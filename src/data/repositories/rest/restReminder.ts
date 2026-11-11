import { IReminderRepository } from '../../interfaces';
import {
  ReminderChannel,
  ReminderRecord,
  ReminderSourceType,
  ReminderStatus,
  SecurityContext,
} from '../../types';
import { restFetch } from './restCommon';

export class RestReminderRepository implements IReminderRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      status?: ReminderStatus | 'active';
      sourceType?: ReminderSourceType;
      userId?: string;
      search?: string;
    }
  ): Promise<ReminderRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.sourceType) params.set('sourceType', filter.sourceType);
    if (filter?.userId) params.set('userId', filter.userId);
    if (filter?.search?.trim()) params.set('search', filter.search.trim());
    const qs = params.toString();
    return restFetch<ReminderRecord[]>(`/reminders${qs ? `?${qs}` : ''}`);
  }

  async getDueReminders(_context: SecurityContext): Promise<ReminderRecord[]> {
    return restFetch<ReminderRecord[]>('/reminders/due');
  }

  async create(
    _context: SecurityContext,
    data: {
      userId: string;
      sourceType: ReminderSourceType;
      sourceId: string;
      title: string;
      description?: string;
      remindAt: string;
      dueAt: string;
      channel?: ReminderChannel;
    }
  ): Promise<ReminderRecord> {
    return restFetch<ReminderRecord>('/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async dismiss(_context: SecurityContext, id: string): Promise<ReminderRecord> {
    return restFetch<ReminderRecord>(`/reminders/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
    });
  }

  async syncReminders(
    _context: SecurityContext
  ): Promise<{ createdCount: number; updatedCount: number; activeReminders: ReminderRecord[] }> {
    return restFetch<{
      createdCount: number;
      updatedCount: number;
      activeReminders: ReminderRecord[];
    }>('/reminders/sync', {
      method: 'POST',
    });
  }

  async clearBySourceId(_context: SecurityContext, sourceId: string): Promise<{ dismissedCount: number }> {
    return restFetch<{ dismissedCount: number }>('/reminders/clear-source', {
      method: 'POST',
      body: JSON.stringify({ sourceId }),
    });
  }

  async rescheduleBySourceId(
    _context: SecurityContext,
    sourceId: string,
    newDueAt: string,
    newRemindAt?: string
  ): Promise<{ updatedCount: number }> {
    return restFetch<{ updatedCount: number }>('/reminders/reschedule-source', {
      method: 'POST',
      body: JSON.stringify({
        sourceId,
        newDueAt,
        ...(newRemindAt ? { newRemindAt } : {}),
      }),
    });
  }
}
