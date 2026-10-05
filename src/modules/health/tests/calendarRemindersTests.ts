import { DiagnosticContext, TestResult } from './types';

export async function runCalendarRemindersTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  // Test 39: Unified Chamber Calendar Aggregation Invariant
  try {
    const allEvents = await repos.calendar.getEvents(ownerCtx);

    const hasHearings = allEvents.some((e) => e.type === 'hearing');
    const hasTasks = allEvents.some((e) => e.type === 'task');
    const hasFiles = allEvents.some((e) => e.type === 'file_return');

    // Verify chronological sorting (ascending date)
    let sorted = true;
    for (let i = 1; i < allEvents.length; i++) {
      if (new Date(allEvents[i].date).getTime() < new Date(allEvents[i - 1].date).getTime()) {
        sorted = false;
        break;
      }
    }

    const pass = allEvents.length >= 3 && hasHearings && hasTasks && hasFiles && sorted;
    suite.push({
      id: 'calendar-aggregate-events',
      name: 'Unified Chamber Calendar Aggregation & Sorting Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? `Aggregated ${allEvents.length} chamber matters across hearings, task deadlines, and file returns sorted chronologically.`
        : `Calendar aggregation failed: total=${allEvents.length}, hasHearings=${hasHearings}, hasTasks=${hasTasks}, hasFiles=${hasFiles}, sorted=${sorted}`,
      details: `Event counts: Hearings=${allEvents.filter((e) => e.type === 'hearing').length}, Tasks=${allEvents.filter((e) => e.type === 'task').length}, File Returns=${allEvents.filter((e) => e.type === 'file_return').length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'calendar-aggregate-events',
      name: 'Unified Chamber Calendar Aggregation & Sorting Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Calendar aggregation invariant test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 40: Confidential Case Calendar Isolation Invariant
  try {
    const staffEvents = await repos.calendar.getEvents(staffCtx);
    const ownerEvents = await repos.calendar.getEvents(ownerCtx);

    // case-003 is confidential
    const staffSeesConfidential = staffEvents.some(
      (e) => e.caseId === 'case-003' || e.restricted === true
    );
    const ownerSeesConfidential = ownerEvents.some((e) => e.caseId === 'case-003');

    const pass = !staffSeesConfidential && ownerSeesConfidential;
    suite.push({
      id: 'calendar-confidential-isolation',
      name: 'Confidential Case Calendar Isolation Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? 'Confidential matters are strictly excluded from calendar feeds for staff lacking restricted.view.'
        : `Calendar confidentiality breach: staffSees=${staffSeesConfidential}, ownerSees=${ownerSeesConfidential}`,
      details: `Staff visible event count: ${staffEvents.length}, Owner event count: ${ownerEvents.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'calendar-confidential-isolation',
      name: 'Confidential Case Calendar Isolation Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Calendar confidential isolation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 41: Automated Reminders Generation Engine & Notification Invariant
  try {
    await repos.reminder.syncReminders(ownerCtx);
    const allReminders = await repos.reminder.list(ownerCtx);

    const hasHearingReminders = allReminders.some((r) => r.sourceType === 'hearing');
    const hasTaskReminders = allReminders.some((r) => r.sourceType === 'task');
    const dueReminders = await repos.reminder.getDueReminders(ownerCtx);

    const nowMs = Date.now();
    const allDueValid = dueReminders.every(
      (r) => new Date(r.remindAt).getTime() <= nowMs && r.status !== 'dismissed'
    );

    const pass =
      allReminders.length >= 2 &&
      hasHearingReminders &&
      hasTaskReminders &&
      allDueValid;

    suite.push({
      id: 'reminder-generation-engine',
      name: 'Automated Reminders Generation Engine & Offset Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? `Engine synced ${allReminders.length} chamber reminders. Verified ${dueReminders.length} active due alerts.`
        : `Reminder engine failed: count=${allReminders.length}, dueRemindersValid=${allDueValid}`,
      details: `Active reminders count: ${allReminders.length}, Due alerts: ${dueReminders.map((r) => r.title).join(' | ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'reminder-generation-engine',
      name: 'Automated Reminders Generation Engine & Offset Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Automated reminder engine test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 42: Hearing Adjournment Automated Reminder Rescheduling Invariant
  try {
    const scheduledAt = '2026-11-10T10:00:00.000Z';
    const hearing = await repos.hearing.create(ownerCtx, {
      caseId: 'case-001',
      scheduledAt,
      purpose: 'Test Hearing for Reminder Adjournment Rescheduling',
    });

    const remindAt = '2026-11-09T10:00:00.000Z';
    await repos.reminder.create(ownerCtx, {
      userId: ownerUser.id,
      sourceType: 'hearing',
      sourceId: hearing.id,
      title: `Hearing: ${hearing.purpose}`,
      dueAt: scheduledAt,
      remindAt,
    });

    const nextDate = '2026-11-25T11:00:00.000Z';
    await repos.hearing.adjournAndScheduleNext(
      ownerCtx,
      hearing.id,
      'Order 17 Adjournment granted on counsel motion',
      nextDate,
      'Framing of Issues & Framing of Additional Issues',
      'Senior counsel engaged before Appellate Division'
    );

    const reminders = await repos.reminder.list(ownerCtx);
    const linkedReminder = reminders.find((r) => r.sourceId === hearing.id);

    const pass =
      Boolean(linkedReminder) &&
      linkedReminder?.dueAt === nextDate &&
      linkedReminder?.status === 'pending';

    suite.push({
      id: 'reminder-adjournment-reschedule',
      name: 'Hearing Adjournment Automated Reminder Reschedule Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? `Hearing adjournment automatically rescheduled reminder deadline from ${scheduledAt} to ${nextDate}.`
        : `Reminder rescheduling failed: linkedReminder=${JSON.stringify(linkedReminder)}`,
      details: `Hearing ID: ${hearing.id}, Rescheduled reminder dueAt: ${linkedReminder?.dueAt}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'reminder-adjournment-reschedule',
      name: 'Hearing Adjournment Automated Reminder Reschedule Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Reminder adjournment reschedule test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 43: Task Completion Automated Reminder Clearance Invariant
  try {
    const task = await repos.task.create(ownerCtx, {
      title: 'File Process Fee with Nazir Office for Order 39 Motion',
      assignedTo: staffUser.id,
      dueAt: '2026-10-25T14:00:00.000Z',
      priority: 'high',
    });

    const reminder = await repos.reminder.create(ownerCtx, {
      userId: staffUser.id,
      sourceType: 'task',
      sourceId: task.id,
      title: `Task Deadline: ${task.title}`,
      dueAt: task.dueAt,
      remindAt: '2026-10-25T12:00:00.000Z',
    });

    await repos.task.complete(ownerCtx, task.id, 'Process fees deposited and verified');

    const allReminders = await repos.reminder.list(ownerCtx);
    const targetReminder = allReminders.find((r) => r.id === reminder.id);

    const pass =
      targetReminder?.status === 'dismissed' &&
      Boolean(targetReminder?.dismissedAt);

    suite.push({
      id: 'reminder-task-completion-clear',
      name: 'Task Completion Automated Reminder Clearance Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? 'Completing task automatically cleared and dismissed linked deadline alert with timestamp.'
        : `Reminder completion clearance failed: status=${targetReminder?.status}`,
      details: `Task ID: ${task.id}, Reminder status: ${targetReminder?.status}, DismissedAt: ${targetReminder?.dismissedAt}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'reminder-task-completion-clear',
      name: 'Task Completion Automated Reminder Clearance Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Reminder completion clearance test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 44: Daily Cause List Docket Generation Invariant
  try {
    const hearings = await repos.hearing.list(ownerCtx);
    const targetDate = hearings.length > 0 ? hearings[0].scheduledAt.slice(0, 10) : '2026-10-15';
    const causeList = await repos.calendar.getDayCauseList(ownerCtx, targetDate);

    const pass =
      causeList.date === targetDate &&
      causeList.hearings.length >= 1 &&
      Boolean(causeList.firmName) &&
      causeList.hearings.some((h) => Boolean(h.court));

    suite.push({
      id: 'cause-list-daily-generation',
      name: 'Daily Cause List Docket Generation & Formatting Invariant',
      category: 'Calendar & Reminders',
      passed: pass,
      message: pass
        ? `Generated daily cause list for ${causeList.date} with ${causeList.hearings.length} court matter(s) for "${causeList.firmName}".`
        : `Cause list generation failed: date=${causeList.date}, count=${causeList.hearings.length}`,
      details: `Listed hearings: ${causeList.hearings.map((h) => `${h.caseNumber || h.title} (${h.court})`).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'cause-list-daily-generation',
      name: 'Daily Cause List Docket Generation & Formatting Invariant',
      category: 'Calendar & Reminders',
      passed: false,
      message: 'Daily cause list generation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return suite;
}
