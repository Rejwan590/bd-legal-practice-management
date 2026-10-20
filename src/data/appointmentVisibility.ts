import { can } from '../permissions';
import { canUserSeeCase } from './caseVisibility';
import { AppointmentRecord, CaseRecord, CaseShareRecord, FirmRecord, UserRecord } from './types';

export function canUserSeeAppointment(
  user: UserRecord,
  appointment: AppointmentRecord,
  firm: FirmRecord,
  cases: CaseRecord[],
  users: UserRecord[],
  shares: CaseShareRecord[] = []
): boolean {
  if (!user || user.firmId !== appointment.firmId) return false;
  if (!can('appointments.view', user)) return false;

  // Chamber Owner sees all appointments
  if (user.role === 'Owner') return true;

  // Organiser or creator can always see
  if (appointment.organiserUserId === user.id || appointment.createdBy === user.id) return true;

  // Direct attendee can always see
  if (appointment.attendees && appointment.attendees.includes(user.id)) return true;

  // If linked to a case, user can see if they can see the case
  if (appointment.caseId) {
    const linkedCase = cases.find((c) => c.id === appointment.caseId && c.firmId === user.firmId);
    if (linkedCase) {
      return canUserSeeCase(user, linkedCase, firm, users, shares);
    }
  }

  // In open mode, any user with appointments.view can see
  if (firm.visibilityMode === 'open') return true;

  return false;
}

export function filterVisibleAppointments(
  user: UserRecord,
  appointments: AppointmentRecord[],
  firm: FirmRecord,
  cases: CaseRecord[],
  users: UserRecord[],
  shares: CaseShareRecord[] = []
): AppointmentRecord[] {
  return appointments.filter(
    (a) =>
      a.firmId === user.firmId &&
      a.deletedAt === null &&
      canUserSeeAppointment(user, a, firm, cases, users, shares)
  );
}
