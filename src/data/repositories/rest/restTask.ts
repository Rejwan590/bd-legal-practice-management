import { ITaskRepository } from '../../interfaces';
import { SecurityContext, TaskPriority, TaskRecord, TaskStatus } from '../../types';
import { restFetch } from './restCommon';

export class RestTaskRepository implements ITaskRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: TaskStatus | 'active';
      priority?: TaskPriority;
      search?: string;
    }
  ): Promise<TaskRecord[]> {
    const params = new URLSearchParams();
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.assignedTo) params.set('assignedTo', filter.assignedTo);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.priority) params.set('priority', filter.priority);
    if (filter?.search) params.set('search', filter.search);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await restFetch<{ tasks: TaskRecord[]; total: number } | TaskRecord[]>(`/tasks${qs}`);
    return Array.isArray(res) ? res : (Array.isArray((res as any)?.tasks) ? (res as any).tasks : []);
  }

  async getById(_context: SecurityContext, id: string): Promise<TaskRecord | null> {
    try {
      return await restFetch<TaskRecord>(`/tasks/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  async create(
    _context: SecurityContext,
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
    return restFetch<TaskRecord>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<Omit<TaskRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<TaskRecord> {
    return restFetch<TaskRecord>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async complete(_context: SecurityContext, id: string, note?: string): Promise<TaskRecord> {
    return restFetch<TaskRecord>(`/tasks/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async reassign(
    _context: SecurityContext,
    id: string,
    newAssignedTo: string,
    reason?: string
  ): Promise<TaskRecord> {
    return restFetch<TaskRecord>(`/tasks/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ newAssignedTo, reason }),
    });
  }

  async delete(_context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  async getByCaseId(context: SecurityContext, caseId: string): Promise<TaskRecord[]> {
    return this.list(context, { caseId });
  }

  async getByClientId(context: SecurityContext, clientId: string): Promise<TaskRecord[]> {
    return this.list(context, { clientId });
  }
}
