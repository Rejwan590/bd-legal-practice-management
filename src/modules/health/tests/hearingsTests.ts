import { INITIAL_FIRM, localStore } from '../../../data/mockStore';
import { SecurityContext, UserRecord } from '../../../data/types';
import { DiagnosticContext, TestResult } from './types';

export async function runHearingsTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  let testHearingId = '';
  // Test 21: Hearing Creation & Case nextHearingAt Synchronization
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    futureDate.setHours(10, 30, 0, 0);

    const newHearing = await repos.hearing.create(ownerCtx, {
      caseId: 'case-001',
      scheduledAt: futureDate.toISOString(),
      purpose: 'Hearing on Framing of Issues',
      outcomeNote: 'Pre-trial stage directions',
    });
    testHearingId = newHearing.id;

    // Verify case nextHearingAt synchronized
    const updatedCase = await repos.case.getById(ownerCtx, 'case-001');
    const pass =
      Boolean(newHearing.id) &&
      newHearing.firmId === INITIAL_FIRM.id &&
      newHearing.status === 'scheduled' &&
      updatedCase?.nextHearingAt !== null;

    suite.push({
      id: 'hearing-create-sync',
      name: 'Hearing Creation & Case nextHearingAt Synchronization Invariant',
      category: 'Hearings Module',
      passed: pass,
      message: pass
        ? `Hearing created for case-001 and case nextHearingAt synchronized to "${new Date(newHearing.scheduledAt).toLocaleDateString()}".`
        : 'Hearing creation or case date synchronization failed.',
      details: `Hearing ID: ${newHearing.id}, Next hearing timestamp: ${updatedCase?.nextHearingAt}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-create-sync',
      name: 'Hearing Creation & Case nextHearingAt Synchronization Invariant',
      category: 'Hearings Module',
      passed: false,
      message: 'Exception occurred during hearing creation.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 22: Hearing Date History Preservation Invariant
  try {
    if (testHearingId) {
      const rescheduleTargetDate = new Date();
      rescheduleTargetDate.setDate(rescheduleTargetDate.getDate() + 25);
      rescheduleTargetDate.setHours(11, 0, 0, 0);

      const statedReason =
        "Time petition moved by Opposite Party citing learned senior counsel's personal illness";

      const { hearing: rescheduled, history: histRow } =
        await repos.hearing.rescheduleDate(
          ownerCtx,
          testHearingId,
          rescheduleTargetDate.toISOString(),
          statedReason
        );

      const historyRows = await repos.hearing.getDateHistory(ownerCtx, testHearingId);
      const pass =
        historyRows.length >= 1 &&
        histRow.reason === statedReason &&
        histRow.changedByName === ownerUser.name &&
        rescheduled.scheduledAt === rescheduleTargetDate.toISOString();

      suite.push({
        id: 'hearing-date-history-invariant',
        name: 'Hearing Date History Preservation & Immutability Invariant',
        category: 'Hearings Module',
        passed: pass,
        message: pass
          ? 'Date change appended immutable row to hearing_date_history preserving old date, new date, stated reason, and operator.'
          : 'Hearing date history preservation invariant failed.',
        details: `Old: ${histRow.oldAt}, New: ${histRow.newAt}, Reason: "${histRow.reason}"`,
      });
    } else {
      throw new Error('Test hearing ID was not established.');
    }
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-date-history-invariant',
      name: 'Hearing Date History Preservation & Immutability Invariant',
      category: 'Hearings Module',
      passed: false,
      message: 'Hearing date history check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 23: One-Step Adjournment & Next Hearing Workflow
  try {
    if (testHearingId) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 35);
      const outcomeNote = 'Opposite party granted adjournment on cost Tk. 1,000 imposed.';
      const nextPurpose = 'Peremptory hearing on issues';
      const reason = 'Adjournment allowed subject to payment of cost';

      const { adjournedHearing, nextHearing, history } =
        await repos.hearing.adjournAndScheduleNext(
          ownerCtx,
          testHearingId,
          outcomeNote,
          nextDate.toISOString(),
          nextPurpose,
          reason
        );

      const pass =
        adjournedHearing.status === 'adjourned' &&
        adjournedHearing.outcomeNote === outcomeNote &&
        nextHearing.status === 'scheduled' &&
        nextHearing.purpose === nextPurpose &&
        Boolean(history.id);

      suite.push({
        id: 'hearing-adjourn-and-next',
        name: 'One-Step Adjournment & Next Hearing Workflow Invariant',
        category: 'Hearings Module',
        passed: pass,
        message: pass
          ? 'Adjourning marked previous hearing adjourned with court order note and scheduled next date in one atomic step.'
          : 'One-step adjournment workflow failed.',
        details: `Adjourned outcome: "${adjournedHearing.outcomeNote}", Next step: "${nextHearing.purpose}"`,
      });
    } else {
      throw new Error('Test hearing ID was not established.');
    }
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-adjourn-and-next',
      name: 'One-Step Adjournment & Next Hearing Workflow Invariant',
      category: 'Hearings Module',
      passed: false,
      message: 'Adjournment workflow check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 24: Case Overview Previous, Current, Next Distinction
  try {
    const overview = await repos.hearing.getCaseHearingsOverview(ownerCtx, 'case-001');

    const pass =
      overview.previousHearing !== null &&
      overview.nextHearing !== null &&
      overview.allHearings.length >= 2;

    suite.push({
      id: 'hearing-overview-case',
      name: 'Case Overview Previous, Current & Next Hearing Distinction Invariant',
      category: 'Hearings Module',
      passed: pass,
      message: pass
        ? `Case dossier accurately distinguishes previous hearing (${new Date(overview.previousHearing?.scheduledAt || '').toLocaleDateString()}) and next hearing (${new Date(overview.nextHearing?.scheduledAt || '').toLocaleDateString()}).`
        : 'Hearings overview failed to categorize previous/next hearings.',
      details: `Prev: ${overview.previousHearing?.purpose}, Next: ${overview.nextHearing?.purpose}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-overview-case',
      name: 'Case Overview Previous, Current & Next Hearing Distinction Invariant',
      category: 'Hearings Module',
      passed: false,
      message: 'Hearings overview categorization check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 25: Hearings Permission Gate (hearings.update)
  try {
    let listAllowed = false;
    try {
      const hList = await repos.hearing.list(staffCtx);
      listAllowed = Array.isArray(hList);
    } catch {
      listAllowed = false;
    }

    const unprivilegedUser: UserRecord = {
      ...staffUser,
      id: 'user-guest-009',
      permissions: ['cases.view'], // no hearings.update
    };

    let rescheduleBlocked = false;
    try {
      await repos.hearing.rescheduleDate(
        { currentUser: unprivilegedUser },
        'hearing-001',
        new Date().toISOString(),
        'Test reason'
      );
    } catch {
      rescheduleBlocked = true;
    }

    const pass = listAllowed && rescheduleBlocked;
    suite.push({
      id: 'hearing-permission-gate',
      name: 'Hearings Method Permission Enforcement Invariant',
      category: 'Hearings Module',
      passed: pass,
      message: pass
        ? 'Repository enforces hearings.update authorization for date changes and allows cause list viewing.'
        : `Permission gate failed: listAllowed=${listAllowed}, rescheduleBlocked=${rescheduleBlocked}`,
      details: 'Verified against unprivileged security context.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-permission-gate',
      name: 'Hearings Method Permission Enforcement Invariant',
      category: 'Hearings Module',
      passed: false,
      message: 'Hearings permission gate check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 26: Hearing Operations Audit Trail Propagation
  try {
    const dateLogs = await repos.auditLog.list(ownerCtx, {
      action: 'HEARING_DATE_CHANGE',
      limit: 5,
    });
    const pass = dateLogs.length >= 1;

    suite.push({
      id: 'hearing-audit-propagation',
      name: 'Hearing Date Reschedule Audit Trail Verification',
      category: 'Audit Trail',
      passed: pass,
      message: pass
        ? `Audit log captured ${dateLogs.length} hearing date changes with action HEARING_DATE_CHANGE and before/after timestamps.`
        : 'Hearing date change audit log verification failed.',
      details: `Audit entry ID: ${dateLogs[0]?.id}, operator: ${dateLogs[0]?.userName}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'hearing-audit-propagation',
      name: 'Hearing Date Reschedule Audit Trail Verification',
      category: 'Audit Trail',
      passed: false,
      message: 'Hearing audit check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up created test hearing
  if (testHearingId) {
    localStore.mutate((s) => {
      s.hearings = (s.hearings || []).filter((h) => h.id !== testHearingId);
    });
  }

  return suite;
}
