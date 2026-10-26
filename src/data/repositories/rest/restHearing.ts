import { CaseHearingsOverview, IHearingRepository } from '../../interfaces';
import { HearingDateHistoryRecord, HearingRecord, HearingStatus, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestHearingRepository implements IHearingRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      caseId?: string;
      status?: HearingStatus;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    }
  ): Promise<HearingRecord[]> {
    const params = new URLSearchParams();
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.fixedFor) params.set('fixedFor', filter.fixedFor);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<HearingRecord[]>(`/hearings${qs}`);
  }

  async getById(_context: SecurityContext, id: string): Promise<HearingRecord | null> {
    try {
      return await restFetch<HearingRecord>(`/hearings/${id}`);
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
      caseId: string;
      appearingLawyerId?: string | null;
      scheduledAt: string;
      purpose: string;
      court?: string;
      outcomeNote?: string;
      fixedFor?: string;
      fixedForNote?: string | null;
    }
  ): Promise<HearingRecord> {
    return restFetch<HearingRecord>('/hearings', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        fixedFor: data.fixedFor || 'hearing',
      }),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<Omit<HearingRecord, 'id' | 'firmId' | 'caseId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<HearingRecord> {
    return restFetch<HearingRecord>(`/hearings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async rescheduleDate(
    _context: SecurityContext,
    hearingId: string,
    newDate: string,
    reason: string,
    fixedFor?: string,
    fixedForNote?: string | null
  ): Promise<{ hearing: HearingRecord; history: HearingDateHistoryRecord }> {
    return restFetch<{ hearing: HearingRecord; history: HearingDateHistoryRecord }>(`/hearings/${hearingId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({
        scheduledAt: newDate,
        reason,
        fixedFor: fixedFor || 'hearing',
        fixedForNote: fixedForNote || null,
      }),
    });
  }

  async adjournAndScheduleNext(
    _context: SecurityContext,
    hearingId: string,
    outcomeNote: string,
    nextDate: string,
    nextPurpose: string,
    reason: string,
    nextFixedFor?: string,
    nextFixedForNote?: string | null
  ): Promise<{
    adjournedHearing: HearingRecord;
    nextHearing: HearingRecord;
    history: HearingDateHistoryRecord;
  }> {
    return restFetch<{
      adjournedHearing: HearingRecord;
      nextHearing: HearingRecord;
      history: HearingDateHistoryRecord;
    }>(`/hearings/${hearingId}/adjourn`, {
      method: 'POST',
      body: JSON.stringify({
        nextDate,
        reason,
        nextFixedFor: nextFixedFor || 'hearing',
        nextFixedForNote: nextFixedForNote || null,
        outcomeNote,
        nextPurpose,
      }),
    });
  }

  async getDateHistory(
    _context: SecurityContext,
    hearingId: string
  ): Promise<HearingDateHistoryRecord[]> {
    return restFetch<HearingDateHistoryRecord[]>(`/hearings/${hearingId}/history`);
  }

  async getCaseHearingsOverview(
    context: SecurityContext,
    caseId: string
  ): Promise<CaseHearingsOverview> {
    const all = await this.list(context, { caseId });
    all.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let previousHearing: HearingRecord | null = null;
    let currentHearing: HearingRecord | null = null;
    let nextHearing: HearingRecord | null = null;

    currentHearing =
      all.find(
        (h) => h.scheduledAt.slice(0, 10) === todayStr && h.status === 'scheduled'
      ) || null;

    const upcoming = all.filter(
      (h) =>
        h.status === 'scheduled' &&
        new Date(h.scheduledAt).getTime() >= now.getTime() &&
        h.id !== currentHearing?.id
    );
    nextHearing = upcoming[0] || null;

    const past = all.filter(
      (h) =>
        h.status === 'held' ||
        h.status === 'adjourned' ||
        new Date(h.scheduledAt).getTime() < now.getTime()
    );
    previousHearing = past[past.length - 1] || null;

    return {
      previousHearing,
      currentHearing,
      nextHearing,
      allHearings: all,
    };
  }

  async bulkUpdateStatus(
    _context: SecurityContext,
    hearingIds: string[],
    status: HearingStatus,
    outcomeNote?: string
  ): Promise<{ updatedCount: number }> {
    return restFetch<{ updatedCount: number }>('/hearings/bulk-status', {
      method: 'POST',
      body: JSON.stringify({
        hearingIds,
        status,
        outcomeNote,
      }),
    });
  }

  async bulkAdjourn(
    _context: SecurityContext,
    hearingIds: string[],
    nextDate: string,
    reason: string,
    nextFixedFor?: string,
    outcomeNote?: string
  ): Promise<{ adjournedCount: number }> {
    return restFetch<{ adjournedCount: number }>('/hearings/bulk-adjourn', {
      method: 'POST',
      body: JSON.stringify({
        hearingIds,
        nextDate,
        reason,
        nextFixedFor,
        outcomeNote,
      }),
    });
  }

  async bulkReschedule(
    _context: SecurityContext,
    hearingIds: string[],
    newDate: string,
    reason: string,
    fixedFor?: string
  ): Promise<{ rescheduledCount: number }> {
    return restFetch<{ rescheduledCount: number }>('/hearings/bulk-reschedule', {
      method: 'POST',
      body: JSON.stringify({
        hearingIds,
        newDate,
        reason,
        fixedFor,
      }),
    });
  }
}
