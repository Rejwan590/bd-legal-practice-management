import { INITIAL_FIRM, localStore } from '../../../data/mockStore';
import { can } from '../../../permissions';
import { DiagnosticContext, TestResult } from './types';

export async function runTasksTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  let testTaskId = '';
  // Test 27: Task Creation & BaseRecord Schema Invariant
  try {
    const due = new Date();
    due.setDate(due.getDate() + 4);
    const newTask = await repos.task.create(ownerCtx, {
      title: 'Draft Rebuttal Affidavit to Interlocutory Injunction',
      description: 'Prepare counter-affidavit for Motijheel commercial property dispute.',
      assignedTo: staffUser.id,
      dueAt: due.toISOString(),
      priority: 'high',
      caseId: 'case-001',
      clientId: 'client-001',
    });
    testTaskId = newTask.id;

    const pass =
      Boolean(newTask.id) &&
      newTask.firmId === INITIAL_FIRM.id &&
      newTask.assignedTo === staffUser.id &&
      newTask.status === 'pending' &&
      newTask.deletedAt === null &&
      newTask.createdBy === ownerUser.id;

    suite.push({
      id: 'task-create-schema',
      name: 'Task Creation & BaseRecord Schema Invariant',
      category: 'Tasks Module',
      passed: pass,
      message: pass
        ? `Task "${newTask.title}" registered with UUID, firmId isolation, and assigned to "${staffUser.name}".`
        : 'Task creation failed BaseRecord schema requirements.',
      details: `Task ID: ${newTask.id}, Firm: ${newTask.firmId}, Assignee: ${newTask.assignedToName}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-create-schema',
      name: 'Task Creation & BaseRecord Schema Invariant',
      category: 'Tasks Module',
      passed: false,
      message: 'Exception occurred during task creation.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 28: Staff Role Tasks Partitioning Invariant
  try {
    const staffTasks = await repos.task.list(staffCtx);
    const allAssignedToStaff = staffTasks.every((t) => t.assignedTo === staffUser.id);
    const seesOwnerTask = staffTasks.some(
      (t) => t.assignedTo === ownerUser.id || t.id === 'task-003' || t.id === 'task-005'
    );

    const pass = staffTasks.length >= 1 && allAssignedToStaff && !seesOwnerTask;
    suite.push({
      id: 'task-staff-partition',
      name: 'Staff Role Tasks Partitioning Invariant',
      category: 'Tasks Module',
      passed: pass,
      message: pass
        ? `Staff user sees only ${staffTasks.length} tasks assigned to them; firm-wide and other advocate tasks are strictly partitioned.`
        : `Staff partitioning breach: allAssignedToStaff=${allAssignedToStaff}, seesOwnerTask=${seesOwnerTask}`,
      details: `Staff visible task IDs: ${staffTasks.map((t) => t.id).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-staff-partition',
      name: 'Staff Role Tasks Partitioning Invariant',
      category: 'Tasks Module',
      passed: false,
      message: 'Staff task partitioning test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 29: Task Assignment Authorization Gate (tasks.assign)
  try {
    let assignBlocked = false;
    try {
      await repos.task.create(staffCtx, {
        title: 'Unauthorized Task Assignment',
        assignedTo: staffUser.id,
        dueAt: new Date().toISOString(),
        priority: 'normal',
      });
    } catch {
      assignBlocked = true;
    }

    const ownerCanAssign = can('tasks.assign', ownerUser);
    const pass = assignBlocked && ownerCanAssign;

    suite.push({
      id: 'task-permission-assign-gate',
      name: 'Task Assignment Authorization Gate (tasks.assign)',
      category: 'Tasks Module',
      passed: pass,
      message: pass
        ? 'Repository enforces tasks.assign authorization; unprivileged staff calls are strictly rejected.'
        : `Permission gate failed: assignBlocked=${assignBlocked}, ownerCanAssign=${ownerCanAssign}`,
      details: 'Verified inside MockTaskRepository.create().',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-permission-assign-gate',
      name: 'Task Assignment Authorization Gate (tasks.assign)',
      category: 'Tasks Module',
      passed: false,
      message: 'Task assignment authorization check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 30: Task Completion Workflow & Status Invariant
  try {
    const completionNote = 'Rebuttal draft completed and verified with senior advocate';
    const completedTask = await repos.task.complete(staffCtx, 'task-001', completionNote);

    const pass =
      completedTask.status === 'completed' &&
      Boolean(completedTask.completedAt) &&
      (completedTask.description?.includes(completionNote) || false);

    suite.push({
      id: 'task-complete-workflow',
      name: 'Task Completion Workflow & Timestamp Invariant',
      category: 'Tasks Module',
      passed: pass,
      message: pass
        ? 'Staff advocate successfully marked task completed with timestamp and audit note.'
        : 'Task completion workflow failed.',
      details: `Status: ${completedTask.status}, CompletedAt: ${completedTask.completedAt}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-complete-workflow',
      name: 'Task Completion Workflow & Timestamp Invariant',
      category: 'Tasks Module',
      passed: false,
      message: 'Task completion workflow test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 31: Dynamic Overdue Calculation Invariant
  try {
    const allTasks = await repos.task.list(ownerCtx);
    const nowMs = Date.now();

    const overdueTasks = allTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        new Date(t.dueAt).getTime() < nowMs
    );

    const task002Overdue = overdueTasks.some((t) => t.id === 'task-002');
    const task004NotOverdue = !overdueTasks.some((t) => t.id === 'task-004');

    const pass = overdueTasks.length >= 1 && task002Overdue && task004NotOverdue;
    suite.push({
      id: 'task-overdue-calculation',
      name: 'Dynamic Overdue Invariant Calculation',
      category: 'Tasks Module',
      passed: pass,
      message: pass
        ? `System accurately detected ${overdueTasks.length} overdue task(s); completed tasks with past deadlines are excluded.`
        : `Overdue calculation failed: overdueCount=${overdueTasks.length}, task002Overdue=${task002Overdue}`,
      details: `Identified overdue tasks: ${overdueTasks.map((t) => t.title).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-overdue-calculation',
      name: 'Dynamic Overdue Invariant Calculation',
      category: 'Tasks Module',
      passed: false,
      message: 'Overdue calculation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 32: Task Operations Audit Trail Propagation
  try {
    const taskLogs = await repos.auditLog.list(ownerCtx, { entity: 'Task', limit: 10 });
    const hasAssign = taskLogs.some((l) => l.action === 'TASK_ASSIGN');
    const hasComplete = taskLogs.some((l) => l.action === 'TASK_COMPLETE');

    const pass = taskLogs.length >= 2 && hasAssign && hasComplete;
    suite.push({
      id: 'task-audit-propagation',
      name: 'Task Delegation & Completion Audit Trail Verification',
      category: 'Audit Trail',
      passed: pass,
      message: pass
        ? `Audit log captured ${taskLogs.length} task operations with actions TASK_ASSIGN and TASK_COMPLETE.`
        : 'Task audit log verification failed.',
      details: `Logged task actions: ${taskLogs.map((l) => l.action).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'task-audit-propagation',
      name: 'Task Delegation & Completion Audit Trail Verification',
      category: 'Audit Trail',
      passed: false,
      message: 'Task audit verification failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up created task
  if (testTaskId) {
    localStore.mutate((s) => {
      s.tasks = (s.tasks || []).filter((t) => t.id !== testTaskId);
    });
  }

  return suite;
}
