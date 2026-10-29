import { IAppointmentRepository } from '../../interfaces';
import { AppointmentRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestAppointmentRepository implements IAppointmentRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      status?: AppointmentRecord['status'] | 'all';
      type?: AppointmentRecord['type'] | 'all';
      fromDate?: string;
      toDate?: string;
      clientId?: string;
      caseId?: string;
      search?: string;
    }
  ): Promise<AppointmentRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.type) params.set('type', filter.type);
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.search) params.set('search', filter.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await restFetch<{ appointments?: AppointmentRecord[]; total?: number } | AppointmentRecord[]>(
      `/appointments${qs}`
    );
    return Array.isArray(res) ? res : (Array.isArray(res?.appointments) ? res.appointments : []);
  }

  async getById(_context: SecurityContext, id: string): Promise<AppointmentRecord | null> {
    try {
      return await restFetch<AppointmentRecord>(`/appointments/${id}`);
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
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode?: AppointmentRecord['mode'];
      location?: string | null;
      clientId?: string | null;
      caseId?: string | null;
      notes?: string | null;
      reminderMinutesBefore?: number;
      attendees?: string[];
    }
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }> {
    return restFetch<AppointmentRecord & { overlapWarning?: boolean }>('/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<{
      title: string;
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode: AppointmentRecord['mode'];
      location: string | null;
      clientId: string | null;
      caseId: string | null;
      status: AppointmentRecord['status'];
      notes: string | null;
      reminderMinutesBefore: number;
      attendees: string[];
      rescheduleReason?: string;
    }>
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }> {
    return restFetch<AppointmentRecord & { overlapWarning?: boolean }>(`/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(
    _context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/appointments/${id}`, {
      method: 'DELETE',
    });
  }
}
