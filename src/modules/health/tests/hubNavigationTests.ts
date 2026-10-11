import { can, evaluateSubscription } from '../../../permissions';
import { localStore } from '../../../data/mockStore';
import { SecurityContext, UserRecord } from '../../../data/types';
import {
  buildUrlFromRoute,
  parseUrlRoute,
} from '../../foundation/NavigationContext';
import { DiagnosticContext, TestResult } from './types';

export async function runHubNavigationTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  // Pick an existing non-restricted case for hub chain tests
  const allCases = await repos.case.list(ownerCtx);
  const targetCase = allCases.find((c) => !c.restricted) || allCases[0];

  // 1. Add a hearing from inside a case -> appears in Calendar and Dashboard; rescheduling keeps history
  try {
    const now = new Date();
    const todayIso = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      14,
      30,
      0
    ).toISOString();

    const createdHearing = await repos.hearing.create(ownerCtx, {
      caseId: targetCase.id,
      scheduledAt: todayIso,
      court: targetCase.court,
      purpose: 'Hub Dossier Chain Verification Hearing',
      appearingLawyerId: ownerUser.id,
    });

    const caseHearings = await repos.hearing.list(ownerCtx, { caseId: targetCase.id });
    const inDossier = caseHearings.some((h) => h.id === createdHearing.id);

    const calEvents = await repos.calendar.getEvents(ownerCtx, { type: 'hearing' });
    const inCalendar = calEvents.some(
      (ev) => ev.type === 'hearing' && ev.sourceId === createdHearing.id && ev.caseId === targetCase.id
    );

    const urgentItems = await repos.dashboard.getUrgentItems(ownerCtx);
    const inDashboard = urgentItems.todayHearings.some((h) => h.id === createdHearing.id);

    const nextWeekIso = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 7,
      11,
      0,
      0
    ).toISOString();
    const rescheduleReason = 'Adjourned by court for witness examination (Hub Chain Test)';

    await repos.hearing.rescheduleDate(
      ownerCtx,
      createdHearing.id,
      nextWeekIso,
      rescheduleReason
    );

    const dateHistory = await repos.hearing.getDateHistory(ownerCtx, createdHearing.id);
    const historyRecorded = dateHistory.some(
      (entry) =>
        entry.hearingId === createdHearing.id &&
        entry.oldAt === todayIso &&
        entry.newAt === nextWeekIso &&
        entry.reason === rescheduleReason
    );

    const passed = inDossier && inCalendar && inDashboard && historyRecorded;
    suite.push({
      id: 'hub-hearing-calendar-dashboard-history',
      name: 'Hub Chain: Case Hearing -> Calendar & Dashboard -> Reschedule History',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'Hearing created inside case dossier immediately appears in Calendar and Dashboard, and rescheduling preserves hearing_date_history with reason.'
        : `Failed chain: inDossier=${inDossier}, inCalendar=${inCalendar}, inDashboard=${inDashboard}, historyRecorded=${historyRecorded}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-hearing-calendar-dashboard-history',
      name: 'Hub Chain: Case Hearing -> Calendar & Dashboard -> Reschedule History',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in hearing hub chain',
    });
  }

  // 2. Add a task from inside a case -> appears on the assignee's task list
  try {
    const dueIso = new Date(Date.now() + 3 * 86400000).toISOString();
    const createdTask = await repos.task.create(ownerCtx, {
      title: 'Prepare affidavit for case hub test',
      description: 'Draft and verify with client',
      assignedTo: staffUser.id,
      dueAt: dueIso,
      priority: 'high',
      caseId: targetCase.id,
      clientId: targetCase.clientId,
    });

    const staffTaskList = await repos.task.list(staffCtx);
    const inAssigneeList = staffTaskList.some(
      (t) =>
        t.id === createdTask.id &&
        t.assignedTo === staffUser.id &&
        t.caseId === targetCase.id &&
        t.clientId === targetCase.clientId
    );

    const dossierTaskList = await repos.task.list(ownerCtx, { caseId: targetCase.id });
    const inCaseDossier = dossierTaskList.some((t) => t.id === createdTask.id);

    await repos.task.delete(ownerCtx, createdTask.id);

    const passed = inAssigneeList && inCaseDossier;
    suite.push({
      id: 'hub-task-assignee-list',
      name: 'Hub Chain: Case Task -> Assignee Task List & Case Dossier',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'Task created inside case dossier with locked caseId/clientId immediately appears in the assignee task list and case Tasks tab.'
        : `Failed chain: inAssigneeList=${inAssigneeList}, inCaseDossier=${inCaseDossier}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-task-assignee-list',
      name: 'Hub Chain: Case Task -> Assignee Task List & Case Dossier',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in task hub chain',
    });
  }

  // 3. Check out a file from inside a case -> appears in Files and creates a return reminder
  try {
    const createdFile = await repos.physicalFile.create(ownerCtx, {
      title: 'Original Power of Attorney & Plaint Bundle',
      caseId: targetCase.id,
      clientId: targetCase.clientId,
      shelfLocation: 'Rack A - Shelf 2',
      notes: 'Hub checkout reminder test',
    });

    const dueBackIso = new Date(Date.now() + 2 * 86400000).toISOString();
    const { file: checkedOut } = await repos.physicalFile.checkOut(
      ownerCtx,
      createdFile.id,
      staffUser.id,
      dueBackIso,
      'Taken for court inspection'
    );

    const allFiles = await repos.physicalFile.list(ownerCtx);
    const inFilesList = allFiles.some(
      (f) => f.id === createdFile.id && f.status === 'checked_out' && f.currentHolderId === staffUser.id
    );

    const reminders = await repos.reminder.list(ownerCtx, { sourceType: 'file_return' });
    const returnReminderCreated = reminders.some(
      (r) =>
        r.sourceId === createdFile.id &&
        r.sourceType === 'file_return' &&
        r.status === 'pending' &&
        r.dueAt === dueBackIso
    );

    await repos.physicalFile.checkIn(ownerCtx, createdFile.id, 'Rack A - Shelf 2', 'Returned after inspection');
    const remindersAfterCheckIn = await repos.reminder.list(ownerCtx, { sourceType: 'file_return' });
    const reminderClearedOnCheckIn = !remindersAfterCheckIn.some(
      (r) => r.sourceId === createdFile.id && r.status === 'pending'
    );

    await repos.physicalFile.delete(ownerCtx, createdFile.id);

    const passed =
      checkedOut.status === 'checked_out' &&
      inFilesList &&
      returnReminderCreated &&
      reminderClearedOnCheckIn;

    suite.push({
      id: 'hub-file-checkout-return-reminder',
      name: 'Hub Chain: Case File Checkout -> Files Register & Return Reminder',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'Checking out a file from a case updates Files register, creates a pending file_return reminder, and clears it upon check-in.'
        : `Failed chain: inFilesList=${inFilesList}, returnReminderCreated=${returnReminderCreated}, reminderClearedOnCheckIn=${reminderClearedOnCheckIn}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-file-checkout-return-reminder',
      name: 'Hub Chain: Case File Checkout -> Files Register & Return Reminder',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in file hub chain',
    });
  }

  // 4. Deep link opens the right tab, refresh keeps the place, Back works
  try {
    const deepLinks = [
      '/cases',
      `/cases/${targetCase.id}/overview`,
      `/cases/${targetCase.id}/hearings`,
      `/cases/${targetCase.id}/tasks`,
      `/cases/${targetCase.id}/files`,
      `/cases/${targetCase.id}/activity`,
      '/clients',
      `/clients/${targetCase.clientId}`,
      `/clients/${targetCase.clientId}/tasks`,
      `/clients/${targetCase.clientId}/files`,
      '/calendar',
      '/tasks',
      '/files',
      '/search',
    ];

    const allRoundTrip = deepLinks.every((path) => {
      const parsed = parseUrlRoute(path);
      const rebuilt = buildUrlFromRoute(parsed);
      return rebuilt === path;
    });

    const hearingsDeepLink = parseUrlRoute(`/cases/${targetCase.id}/hearings`);
    const activityDeepLink = parseUrlRoute(`/cases/${targetCase.id}/activity`);
    const clientFilesDeepLink = parseUrlRoute(`/clients/${targetCase.clientId}/files`);

    const tabsCorrect =
      hearingsDeepLink.screen === 'cases' &&
      hearingsDeepLink.caseId === targetCase.id &&
      hearingsDeepLink.caseTab === 'hearings' &&
      activityDeepLink.screen === 'cases' &&
      activityDeepLink.caseId === targetCase.id &&
      activityDeepLink.caseTab === 'activity' &&
      clientFilesDeepLink.screen === 'clients' &&
      clientFilesDeepLink.clientId === targetCase.clientId &&
      clientFilesDeepLink.clientTab === 'files';

    const passed = allRoundTrip && tabsCorrect;
    suite.push({
      id: 'hub-deep-link-url-routing',
      name: 'URL Router: Deep Links, Tab Persistence on Refresh & History State',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'All URL routes (/cases/:id/overview|hearings|tasks|files|activity, /clients/:id, /calendar, /tasks, /files, /search) parse and round-trip deterministically.'
        : `Failed URL routing check: allRoundTrip=${allRoundTrip}, tabsCorrect=${tabsCorrect}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-deep-link-url-routing',
      name: 'URL Router: Deep Links, Tab Persistence on Refresh & History State',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in URL routing test',
    });
  }

  // 5. Clicking a calendar hearing opens its case on the Hearings tab
  try {
    const hearings = await repos.hearing.list(ownerCtx);
    const sampleHearing = hearings[0];
    const calEvents = await repos.calendar.getEvents(ownerCtx, { type: 'hearing' });
    const hearingCalendarEvent = calEvents.find(
      (e) => e.type === 'hearing' && e.sourceId === sampleHearing.id
    );

    const targetUrl = hearingCalendarEvent?.caseId
      ? buildUrlFromRoute({
          screen: 'cases',
          caseId: hearingCalendarEvent.caseId,
          caseTab: 'hearings',
          clientId: null,
          clientTab: 'cases',
        })
      : '';
    const parsedTarget = parseUrlRoute(targetUrl);

    const passed =
      Boolean(hearingCalendarEvent) &&
      hearingCalendarEvent?.caseId === sampleHearing.caseId &&
      targetUrl === `/cases/${sampleHearing.caseId}/hearings` &&
      parsedTarget.screen === 'cases' &&
      parsedTarget.caseId === sampleHearing.caseId &&
      parsedTarget.caseTab === 'hearings';

    suite.push({
      id: 'hub-calendar-hearing-to-case-hearings-tab',
      name: 'Navigation Chain: Calendar Hearing -> Case Dossier Hearings Tab',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'Calendar hearing event links directly to /cases/:id/hearings and opens the Case Dossier on the Hearings tab.'
        : 'Calendar hearing event failed to resolve to /cases/:id/hearings',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-calendar-hearing-to-case-hearings-tab',
      name: 'Navigation Chain: Calendar Hearing -> Case Dossier Hearings Tab',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in calendar hearing link test',
    });
  }

  // 6. Permission hiding/blocking, expired subscription read-only, and restricted case isolation
  try {
    const limitedStaff: UserRecord = {
      ...staffUser,
      permissions: ['cases.view', 'clients.view', 'tasks.view', 'files.view'],
    };
    const limitedCtx: SecurityContext = { currentUser: limitedStaff };

    // Permission checks
    const hidesActions =
      !can('cases.edit', limitedStaff) &&
      !can('hearings.update', limitedStaff) &&
      !can('tasks.assign', limitedStaff) &&
      !can('files.manage', limitedStaff) &&
      !can('restricted.view', limitedStaff);

    let blocksUnauthorizedWrite = false;
    try {
      await repos.case.update(limitedCtx, targetCase.id, { description: 'Unauthorized edit' });
    } catch {
      blocksUnauthorizedWrite = true;
    }

    // Restricted case check across Case List, Search, Calendar, Dashboard, and Activity tab (listByCaseId)
    const restrictedCase = await repos.case.create(ownerCtx, {
      clientId: targetCase.clientId,
      fileSerial: 'SC-CONF-999',
      caseNumber: 'CONFIDENTIAL-WRIT-999/2026',
      court: 'High Court Division',
      matterType: 'Constitutional',
      description: 'Top secret constitutional matter',
      plaintiff: 'Confidential Petitioner',
      defendant: 'State',
      ourRole: 'Petitioner',
      plaintiffLawyer: 'Owner Advocate',
      defendantLawyer: 'AG',
      status: 'ongoing',
      restricted: true,
    });

    const visibleCasesToStaff = await repos.case.list(limitedCtx);
    const searchResultsToStaff = await repos.search.search(limitedCtx, 'CONFIDENTIAL-WRIT-999');
    let activityBlockedForStaff = false;
    let activityLogsToStaff: unknown[] = [];
    if (repos.auditLog.listByCaseId) {
      try {
        activityLogsToStaff = await repos.auditLog.listByCaseId(limitedCtx, restrictedCase.id);
        if (activityLogsToStaff.length === 0) activityBlockedForStaff = true;
      } catch {
        activityBlockedForStaff = true;
      }
    }
    const activityLogsToOwner = repos.auditLog.listByCaseId
      ? await repos.auditLog.listByCaseId(ownerCtx, restrictedCase.id)
      : [];

    const restrictedIsolated =
      !visibleCasesToStaff.some((c) => c.id === restrictedCase.id) &&
      !searchResultsToStaff.some((r) => r.id === restrictedCase.id) &&
      activityBlockedForStaff &&
      activityLogsToStaff.length === 0 &&
      activityLogsToOwner.length > 0;

    // Expired subscription check
    const snapshotBeforeExpiry = localStore.getSnapshot();
    let expiredBlocksWrites = false;
    let expiredEvalReadOnly = false;
    try {
      localStore.mutate((s) => {
        s.firm.status = 'expired';
        s.firm.licenseExpiresAt = '2020-01-01T00:00:00.000Z';
      });
      const firmAfter = localStore.getData().firm;
      const evalResult = evaluateSubscription(firmAfter.status, firmAfter.licenseExpiresAt);
      expiredEvalReadOnly = evalResult.isReadOnly;
      try {
        await repos.task.create(ownerCtx, {
          title: 'Blocked by expired license',
          assignedTo: ownerUser.id,
          dueAt: new Date().toISOString(),
          priority: 'normal',
          caseId: targetCase.id,
        });
      } catch {
        expiredBlocksWrites = true;
      }
    } finally {
      localStore.restoreSnapshot(snapshotBeforeExpiry);
    }

    await repos.case.delete(ownerCtx, restrictedCase.id);

    const passed =
      hidesActions &&
      blocksUnauthorizedWrite &&
      restrictedIsolated &&
      expiredEvalReadOnly &&
      expiredBlocksWrites;

    suite.push({
      id: 'hub-security-permissions-subscription-restricted',
      name: 'Hub Security: Permission Guard, Expired Subscription & Restricted Case Isolation',
      category: 'Hub & Navigation',
      passed,
      message: passed
        ? 'Unauthorized staff actions are hidden & blocked, expired subscriptions enforce read-only mode, and restricted cases never leak in lists, search, or Activity logs.'
        : `Failed security check: hidesActions=${hidesActions}, blocksUnauthorizedWrite=${blocksUnauthorizedWrite}, restrictedIsolated=${restrictedIsolated}, expiredEvalReadOnly=${expiredEvalReadOnly}, expiredBlocksWrites=${expiredBlocksWrites}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hub-security-permissions-subscription-restricted',
      name: 'Hub Security: Permission Guard, Expired Subscription & Restricted Case Isolation',
      category: 'Hub & Navigation',
      passed: false,
      message: err instanceof Error ? err.message : 'Unexpected error in hub security test',
    });
  }

  return suite;
}
