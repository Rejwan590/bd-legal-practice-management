import { ALL_PERMISSION_KEYS } from '../../../rolePresets';
import { localStore } from '../../../data/mockStore';
import { PermissionKey } from '../../../permissions';
import { SecurityContext } from '../../../data/types';
import { DiagnosticContext, TestResult } from './types';

export async function runTeamVisibilityTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const { repos, ownerUser, ownerCtx } = ctx;
  const results: TestResult[] = [];
  const snapshot = localStore.getSnapshot();

  try {
    // 1. Setup Lawyers & Clerk in Team Mode
    const lawyerA = await repos.user.create(ownerCtx, {
      name: 'Adv. Lawyer A',
      email: 'lawyer.a@firm.bd',
      preset: 'seniorLawyer',
      reportsToUserId: ownerUser.id,
    });

    const lawyerB = await repos.user.create(ownerCtx, {
      name: 'Adv. Lawyer B',
      email: 'lawyer.b@firm.bd',
      preset: 'seniorLawyer',
      reportsToUserId: ownerUser.id,
    });

    const clerkA = await repos.user.create(ownerCtx, {
      name: 'Clerk Under A',
      email: 'clerk.a@firm.bd',
      preset: 'clerk',
      reportsToUserId: lawyerA.id,
    });

    // Grant clerkA data.export and settings.manage so we can test backup export and audit visibility
    await repos.user.updatePermissions(ownerCtx, clerkA.id, [
      ...clerkA.permissions,
      'data.export',
      'settings.manage',
    ]);
    const updatedClerkA = (await repos.user.getById(ownerCtx, clerkA.id))!;
    const clerkACtx: SecurityContext = { currentUser: updatedClerkA };

    // Set firm visibilityMode to 'team'
    await repos.firm.updateFirm(ownerCtx, { visibilityMode: 'team' });

    const client = await repos.client.create(ownerCtx, {
      name: 'Visibility Test Client',
      phone: '+8801711000001',
      address: 'Dhaka',
      notes: 'Test client',
    });

    // Create Case A (responsible: Lawyer A) and Case B (responsible: Lawyer B)
    const caseA = await repos.case.create(ownerCtx, {
      clientId: client.id,
      responsibleLawyerId: lawyerA.id,
      fileSerial: 'F-TEAM-A',
      caseNumber: 'Team Suit A/2026',
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Lawyer A matter',
      plaintiff: 'Alpha',
      defendant: 'Beta',
      ourRole: 'Petitioner',
      plaintiffLawyer: lawyerA.name,
      defendantLawyer: 'Opp',
      status: 'ongoing',
      restricted: false,
    });

    const caseB = await repos.case.create(ownerCtx, {
      clientId: client.id,
      responsibleLawyerId: lawyerB.id,
      fileSerial: 'F-TEAM-B',
      caseNumber: 'Team Suit B/2026',
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Lawyer B secret team matter',
      plaintiff: 'Gamma',
      defendant: 'Delta',
      ourRole: 'Petitioner',
      plaintiffLawyer: lawyerB.name,
      defendantLawyer: 'Opp',
      status: 'ongoing',
      restricted: false,
    });

    // Add hearing, task, and physical file to Case B
    const todayIso = new Date().toISOString();
    await repos.hearing.create(ownerCtx, {
      caseId: caseB.id,
      appearingLawyerId: lawyerB.id,
      scheduledAt: todayIso,
      purpose: 'Hearing B Secret',
    });
    await repos.task.create(ownerCtx, {
      title: 'Task B Secret',
      description: 'Linked to Case B',
      assignedTo: clerkA.id,
      priority: 'high',
      dueAt: todayIso,
      caseId: caseB.id,
    });
    await repos.physicalFile.create(ownerCtx, {
      serial: 'F-B-999',
      title: 'File B Secret',
      caseId: caseB.id,
      shelfLocation: 'Rack B',
      notes: '',
    });

    // Verify Clerk A sees Case A and cannot see Case B anywhere
    const clerkCases = await repos.case.list(clerkACtx);
    const seesA = clerkCases.some((c) => c.id === caseA.id);
    const seesBInList = clerkCases.some((c) => c.id === caseB.id);
    const directB = await repos.case.getById(clerkACtx, caseB.id);
    const searchB = await repos.search.search(clerkACtx, 'Team Suit B');
    const searchTaskB = await repos.search.search(clerkACtx, 'Task B Secret');
    const calEvents = await repos.calendar.getEvents(clerkACtx);
    const seesBInCal = calEvents.some((e) => e.caseId === caseB.id);
    const dashMetrics = await repos.dashboard.getMetrics(clerkACtx);
    const clientOverview = await repos.client.getLinkedOverview(clerkACtx, client.id);
    const seesBInClientOverview = clientOverview.cases.some((c) => c.id === caseB.id);
    const auditLogsClerk = await repos.auditLog.list(clerkACtx);
    const seesBInAudit = auditLogsClerk.some((a) => a.entityId === caseB.id);
    const backupSnap = await repos.backup.createBackup(clerkACtx);
    const backupData = (backupSnap.payload as any).data;
    const seesBInBackup =
      backupData.cases.some((c: any) => c.id === caseB.id) ||
      backupData.hearings.some((h: any) => h.caseId === caseB.id) ||
      backupData.tasks.some((t: any) => t.caseId === caseB.id) ||
      backupData.physicalFiles.some((f: any) => f.caseId === caseB.id);

    let countsBZeroOrThrew = false;
    try {
      const countsB = await repos.case.getLinkedCounts(clerkACtx, caseB.id);
      countsBZeroOrThrew =
        countsB.hearingsCount === 0 &&
        countsB.tasksCount === 0 &&
        countsB.filesCount === 0 &&
        countsB.remindersCount === 0;
    } catch {
      countsBZeroOrThrew = true;
    }

    const isolatedEverywhere =
      seesA &&
      !seesBInList &&
      directB === null &&
      searchB.length === 0 &&
      searchTaskB.length === 0 &&
      !seesBInCal &&
      dashMetrics.activeCasesCount === 1 &&
      !seesBInClientOverview &&
      !seesBInAudit &&
      !seesBInBackup &&
      countsBZeroOrThrew;

    results.push({
      id: 'team-vis-clerk-isolation',
      name: "Clerk under Lawyer A sees Lawyer A's cases and cannot see Lawyer B's cases anywhere",
      category: 'Permissions',
      passed: isolatedEverywhere,
      message: isolatedEverywhere
        ? "Verified across list, direct ID, search, calendar, dashboard, client overview, counts, audit, and backup."
        : "Clerk saw another team's case or missed own team's case.",
    });

    // 2. Sharing & Unsharing Case B with Clerk A
    const shareRec = await repos.case.shareCase!(ownerCtx, caseB.id, clerkA.id);
    const afterShareDirect = await repos.case.getById(clerkACtx, caseB.id);
    await repos.case.unshareCase!(ownerCtx, caseB.id, shareRec.id);
    const afterUnshareDirect = await repos.case.getById(clerkACtx, caseB.id);

    const sharePassed = afterShareDirect !== null && afterUnshareDirect === null;
    results.push({
      id: 'team-vis-case-sharing',
      name: 'Shared case becomes visible and stops being visible when un-shared',
      category: 'Permissions',
      passed: sharePassed,
      message: sharePassed
        ? 'Case share granted visibility immediately and revoking share hid it again.'
        : 'Case sharing/unsharing failed to toggle visibility.',
    });

    // 3. Open mode shows all; switching modes never loses data
    await repos.firm.updateFirm(ownerCtx, { visibilityMode: 'open' });
    const openCases = await repos.case.list(clerkACtx);
    const seesBothInOpen =
      openCases.some((c) => c.id === caseA.id) && openCases.some((c) => c.id === caseB.id);
    await repos.firm.updateFirm(ownerCtx, { visibilityMode: 'team' });
    const ownerAllCases = await repos.case.list(ownerCtx);
    const noDataLost =
      seesBothInOpen &&
      ownerAllCases.some((c) => c.id === caseA.id) &&
      ownerAllCases.some((c) => c.id === caseB.id);

    results.push({
      id: 'team-vis-open-mode-switch',
      name: "'open' mode shows all non-restricted cases and switching modes never loses data",
      category: 'Data Layer',
      passed: noDataLost,
      message: noDataLost
        ? "Switching between 'open' and 'team' modes preserved all records and toggled visibility cleanly."
        : 'Open mode or mode switching failed.',
    });

    // 4. Restricted cases still require restricted.view even for responsible lawyer
    await repos.user.updatePermissions(
      ownerCtx,
      lawyerA.id,
      lawyerA.permissions.filter((p) => p !== 'restricted.view')
    );
    const lawyerAWithoutRestricted = (await repos.user.getById(ownerCtx, lawyerA.id))!;
    const restrictedCase = await repos.case.create(ownerCtx, {
      clientId: client.id,
      responsibleLawyerId: lawyerA.id,
      fileSerial: 'F-REST-A',
      caseNumber: 'Restricted Suit 99/2026',
      court: 'High Court Division',
      matterType: 'Company Matter',
      description: 'Confidential',
      plaintiff: 'P',
      defendant: 'D',
      ourRole: 'Petitioner',
      plaintiffLawyer: lawyerA.name,
      defendantLawyer: 'Opp',
      status: 'ongoing',
      restricted: true,
    });
    const lawyerACasesList = await repos.case.list({ currentUser: lawyerAWithoutRestricted });
    let lawyerASeesRestrictedInGet = false;
    try {
      const resCase = await repos.case.getById(
        { currentUser: lawyerAWithoutRestricted },
        restrictedCase.id
      );
      if (resCase !== null) lawyerASeesRestrictedInGet = true;
    } catch {
      lawyerASeesRestrictedInGet = false;
    }
    const restrictedHidden =
      !lawyerACasesList.some((c) => c.id === restrictedCase.id) && !lawyerASeesRestrictedInGet;
    results.push({
      id: 'team-vis-restricted-override',
      name: 'restricted.view still hides restricted cases from a responsible lawyer who lacks it',
      category: 'Permissions',
      passed: restrictedHidden,
      message: restrictedHidden
        ? 'Restricted case remained hidden from responsible lawyer lacking restricted.view.'
        : 'Restricted case leaked to lawyer without restricted.view!',
    });

    // 5. User management invariants (last Owner, self-permissions, cycle rejection, unknown perm keys, seat limit)
    let lastOwnerDemoteBlocked = false;
    try {
      await repos.user.updateRole(ownerCtx, ownerUser.id, 'Staff');
    } catch {
      lastOwnerDemoteBlocked = true;
    }

    let selfPermBlocked = false;
    try {
      await repos.user.updatePermissions(ownerCtx, ownerUser.id, [...ALL_PERMISSION_KEYS] as PermissionKey[]);
    } catch {
      selfPermBlocked = true;
    }

    let cycleBlocked = false;
    try {
      // Make lawyerA report to lawyerB, and then try making lawyerB report to lawyerA
      await repos.user.update(ownerCtx, lawyerA.id, { reportsToUserId: lawyerB.id });
      await repos.user.update(ownerCtx, lawyerB.id, { reportsToUserId: lawyerA.id });
    } catch {
      cycleBlocked = true;
    }

    let unknownPermBlocked = false;
    try {
      await repos.user.updatePermissions(ownerCtx, clerkA.id, ['unknown.fake_perm' as PermissionKey]);
    } catch {
      unknownPermBlocked = true;
    }

    // Seat limit enforcement
    await repos.firm.updateFirm(ownerCtx, { seatLimit: 2 } as any);
    let seatLimitBlocked = false;
    try {
      await repos.user.create(ownerCtx, {
        name: 'Over Seat Limit User',
        email: 'overlimit@firm.bd',
        preset: 'clerk',
      });
    } catch {
      seatLimitBlocked = true;
    }

    const allInvariantsPassed =
      lastOwnerDemoteBlocked &&
      selfPermBlocked &&
      cycleBlocked &&
      unknownPermBlocked &&
      seatLimitBlocked;

    results.push({
      id: 'team-vis-user-mgmt-invariants',
      name: 'User management guards: last Owner, self-permissions, hierarchy cycles, unknown keys, and seat limit',
      category: 'Permissions',
      passed: allInvariantsPassed,
      message: allInvariantsPassed
        ? 'All user management guards enforced (last Owner, self-perm, cycle, unknown key, seat limit).'
        : `Guard failure: lastOwner=${lastOwnerDemoteBlocked}, selfPerm=${selfPermBlocked}, cycle=${cycleBlocked}, unknownPerm=${unknownPermBlocked}, seatLimit=${seatLimitBlocked}`,
    });
  } finally {
    localStore.restoreSnapshot(snapshot);
  }

  return results;
}
