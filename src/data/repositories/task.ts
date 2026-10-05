import { can } from '../../permissions';
import { IAuditLogRepository, IReminderRepository, ITaskRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { SecurityContext, TaskPriority, TaskRecord, TaskStatus } from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export class MockTaskRepository implements ITaskRepository {
  private auditRepo: IAuditLogRepository;
  public reminderRepo?: IReminderRepository;

  constructor(auditRepo: IAuditLogRepository, reminderRepo?: IReminderRepository) {
    this.auditRepo = auditRepo;
    this.reminderRepo = reminderRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: TaskStatus | 'active';
      priority?: TaskPriority;
      search?: string;
    }
  ): Promise<TaskRecord[]> {
    if (!can('tasks.view', context.currentUser)) {
      throw new Error('Permission denied: tasks.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    let tasks = (store.tasks || []).filter(
      (t) => t.firmId === currentUser.firmId && t.deletedAt === null
    );

    // Filter out tasks belonging to restricted cases if user lacks restricted.view
    if (!can('restricted.view', currentUser)) {
      const restrictedCaseIds = new Set(
        (store.cases || []).filter((c) => c.restricted).map((c) => c.id)
      );
      tasks = tasks.filter((t) => !t.caseId || !restrictedCaseIds.has(t.caseId));
    }

    // Staff Partitioning Invariant:
    // If user is Staff (and does NOT have tasks.assign or special firm-wide privilege):
    // Staff user can ONLY see tasks assigned to them.
    if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
      tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
    } else if (filter?.assignedTo) {
      tasks = tasks.filter((t) => t.assignedTo === filter.assignedTo);
    }

    if (filter?.caseId) {
      tasks = tasks.filter((t) => t.caseId === filter.caseId);
    }
    if (filter?.clientId) {
      tasks = tasks.filter((t) => t.clientId === filter.clientId);
    }
    if (filter?.priority) {
      tasks = tasks.filter((t) => t.priority === filter.priority);
    }
    if (filter?.status) {
      if (filter.status === 'active') {
        tasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
      } else {
        tasks = tasks.filter((t) => t.status === filter.status);
      }
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.assignedToName && t.assignedToName.toLowerCase().includes(q))
      );
    }

    // Sort by dueAt ascending (soonest due first)
    return tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }

  async getById(context: SecurityContext, id: string): Promise<TaskRecord | null> {
    if (!can('tasks.view', context.currentUser)) {
      throw new Error('Permission denied: tasks.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const task = (store.tasks || []).find(
      (t) => t.id === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    if (!task) return null;

    // Check restricted case
    if (task.caseId && !can('restricted.view', currentUser)) {
      const caseRec = (store.cases || []).find((c) => c.id === task.caseId);
      if (caseRec?.restricted) {
        throw new Error('Permission denied: task is linked to a confidential case');
      }
    }

    // Staff partitioning: staff can only see their own assigned task unless they have tasks.assign
    if (
      currentUser.role === 'Staff' &&
      !can('tasks.assign', currentUser) &&
      task.assignedTo !== currentUser.id
    ) {
      throw new Error('Permission denied: you can only view tasks assigned to you');
    }

    return task;
  }

  async create(
    context: SecurityContext,
    data: {
      title: string;
      description?: string;
      assignedTo: string;
      dueAt: string;
      priority: TaskPriority;
      caseId?: string | null;
      clientId?: string | null;
    }
  ): Promise<TaskRecord> {
    if (!can('tasks.assign', context.currentUser)) {
      throw new Error('Permission denied: tasks.assign required to create or assign tasks');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const id = generateUUID();

    // Resolve assignee name
    const assignee = (store.users || []).find((u) => u.id === data.assignedTo);
    const assignedToName = assignee ? assignee.name : 'Unknown User';

    const newTask: TaskRecord = {
      id,
      firmId: currentUser.firmId,
      caseId: data.caseId || null,
      clientId: data.clientId || null,
      assignedTo: data.assignedTo,
      assignedToName,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      priority: data.priority,
      dueAt: data.dueAt,
      status: 'pending',
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((s) => {
      s.tasks = [...(s.tasks || []), newTask];
    });

    await this.auditRepo.record(context, {
      entity: 'Task',
      entityId: id,
      action: 'TASK_ASSIGN',
      oldValue: null,
      newValue: newTask as unknown as Record<string, unknown>,
    });

    return newTask;
  }

  async update(
    context: SecurityContext,
    id: string,
    updateData: Partial<Omit<TaskRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<TaskRecord> {
    if (!can('tasks.assign', context.currentUser)) {
      throw new Error('Permission denied: tasks.assign required to update task details');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.tasks || []).find(
      (t) => t.id === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    if (!existing) {
      throw new Error('Task not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: TaskRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.tasks || []).findIndex((t) => t.id === id);
      if (idx !== -1) {
        let assignedToName = s.tasks[idx].assignedToName;
        if (updateData.assignedTo && updateData.assignedTo !== s.tasks[idx].assignedTo) {
          const assignee = (s.users || []).find((u) => u.id === updateData.assignedTo);
          assignedToName = assignee ? assignee.name : assignedToName;
        }

        s.tasks[idx] = {
          ...s.tasks[idx],
          ...updateData,
          assignedToName,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.tasks[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to update task');
    }

    await this.auditRepo.record(context, {
      entity: 'Task',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async complete(context: SecurityContext, id: string, note?: string): Promise<TaskRecord> {
    if (!can('tasks.complete', context.currentUser)) {
      throw new Error('Permission denied: tasks.complete required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.tasks || []).find(
      (t) => t.id === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    if (!existing) {
      throw new Error('Task not found');
    }

    // Staff can only complete tasks assigned to them, unless owner/assigned
    if (
      currentUser.role === 'Staff' &&
      !can('tasks.assign', currentUser) &&
      existing.assignedTo !== currentUser.id
    ) {
      throw new Error('Permission denied: you can only complete tasks assigned to you');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: TaskRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.tasks || []).findIndex((t) => t.id === id);
      if (idx !== -1) {
        s.tasks[idx] = {
          ...s.tasks[idx],
          status: 'completed',
          completedAt: now,
          description: note
            ? `${s.tasks[idx].description ? s.tasks[idx].description + '\n' : ''}[Completion note: ${note}]`
            : s.tasks[idx].description,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.tasks[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to mark task completed');
    }

    await this.auditRepo.record(context, {
      entity: 'Task',
      entityId: id,
      action: 'TASK_COMPLETE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    if (this.reminderRepo) {
      await this.reminderRepo.clearBySourceId(context, id);
    }

    return updated;
  }

  async reassign(
    context: SecurityContext,
    id: string,
    newAssignedTo: string,
    reason?: string
  ): Promise<TaskRecord> {
    if (!can('tasks.assign', context.currentUser)) {
      throw new Error('Permission denied: tasks.assign required to reassign tasks');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.tasks || []).find(
      (t) => t.id === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    if (!existing) {
      throw new Error('Task not found');
    }

    const newAssignee = (store.users || []).find((u) => u.id === newAssignedTo);
    if (!newAssignee) {
      throw new Error('Target assignee not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: TaskRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.tasks || []).findIndex((t) => t.id === id);
      if (idx !== -1) {
        s.tasks[idx] = {
          ...s.tasks[idx],
          assignedTo: newAssignedTo,
          assignedToName: newAssignee.name,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.tasks[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to reassign task');
    }

    const finalUpdated: TaskRecord = updated;
    await this.auditRepo.record(context, {
      entity: 'Task',
      entityId: id,
      action: 'TASK_ASSIGN',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: {
        ...finalUpdated,
        reassignmentReason: reason,
      } as unknown as Record<string, unknown>,
    });

    return finalUpdated;
  }

  async delete(
    context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    if (!can('tasks.assign', context.currentUser)) {
      throw new Error('Permission denied: tasks.assign required to delete task');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.tasks || []).find(
      (t) => t.id === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    if (!existing) {
      throw new Error('Task not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();

    // Soft delete: keep row with deletedAt timestamp
    localStore.mutate((s) => {
      const target = (s.tasks || []).find((t) => t.id === id);
      if (target) {
        target.deletedAt = now;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Task',
      entityId: id,
      action: 'DELETE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: { deletedAt: now, softDeleted: true },
    });

    return { success: true, softDeleted: true };
  }

  async getByCaseId(context: SecurityContext, caseId: string): Promise<TaskRecord[]> {
    return this.list(context, { caseId });
  }

  async getByClientId(context: SecurityContext, clientId: string): Promise<TaskRecord[]> {
    return this.list(context, { clientId });
  }
}
