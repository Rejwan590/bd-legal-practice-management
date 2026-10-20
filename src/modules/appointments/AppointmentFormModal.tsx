import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import {
  AppointmentRecord,
  AppointmentType,
  AppointmentMode,
  AppointmentStatus,
  ClientRecord,
  CaseRecord,
  UserRecord,
} from '../../data/types';
import {
  X,
  Calendar,
  Clock,
  User,
  Briefcase,
  Users,
  MapPin,
  AlertTriangle,
  Check,
  RotateCcw,
} from 'lucide-react';

interface AppointmentFormModalProps {
  isOpen: boolean;
  initialData?: AppointmentRecord | null;
  defaultClientId?: string;
  defaultCaseId?: string;
  onClose: () => void;
  onSaved: (appointment: AppointmentRecord, overlapWarning?: boolean) => void;
}

export const AppointmentFormModal: React.FC<AppointmentFormModalProps> = ({
  isOpen,
  initialData,
  defaultClientId,
  defaultCaseId,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { currentUser, isReadOnly } = useAuth();
  const repos = getRepositories();

  // Helper to format ISO to datetime-local (YYYY-MM-DDTHH:mm)
  const formatDatetimeLocal = (isoString?: string) => {
    if (!isoString) {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [title, setTitle] = useState('');
  const [type, setType] = useState<AppointmentType>('client_meeting');
  const [mode, setMode] = useState<AppointmentMode>('in_person');
  const [status, setStatus] = useState<AppointmentStatus>('scheduled');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<number | null>(30);
  const [clientId, setClientId] = useState<string>('');
  const [caseId, setCaseId] = useState<string>('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Dropdown options
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const isRescheduling = Boolean(
    initialData && (initialData.startsAt !== new Date(startsAt).toISOString() || initialData.endsAt !== new Date(endsAt).toISOString())
  );

  useEffect(() => {
    if (!isOpen) return;

    // Load clients, cases, users
    const loadPrereqs = async () => {
      try {
        const [cls, cs, us] = await Promise.all([
          repos.client.list({ currentUser }).catch(() => []),
          repos.case.list({ currentUser }).catch(() => []),
          repos.user.list({ currentUser }).catch(() => []),
        ]);
        setClients(cls);
        setCases(cs);
        setUsers(us);
      } catch {
        // Ignored
      }
    };
    loadPrereqs();

    if (initialData) {
      setTitle(initialData.title);
      setType(initialData.type);
      setMode(initialData.mode);
      setStatus(initialData.status);
      setStartsAt(formatDatetimeLocal(initialData.startsAt));
      setEndsAt(formatDatetimeLocal(initialData.endsAt));
      setLocation(initialData.location || '');
      setNotes(initialData.notes || '');
      setReminderMinutesBefore(initialData.reminderMinutesBefore ?? 30);
      setClientId(initialData.clientId || '');
      setCaseId(initialData.caseId || '');
      setAttendeeIds(initialData.attendees || [currentUser.id]);
      setRescheduleReason('');
    } else {
      const nowFormatted = formatDatetimeLocal();
      const startD = new Date(nowFormatted);
      const endD = new Date(startD.getTime() + 30 * 60 * 1000);
      const endFormatted = formatDatetimeLocal(endD.toISOString());

      setTitle('');
      setType('client_meeting');
      setMode('in_person');
      setStatus('scheduled');
      setStartsAt(nowFormatted);
      setEndsAt(endFormatted);
      setLocation('');
      setNotes('');
      setReminderMinutesBefore(30);
      setClientId(defaultClientId || '');
      setCaseId(defaultCaseId || '');
      setAttendeeIds([currentUser.id]);
      setRescheduleReason('');
    }

    setErrorMsg(null);
    setWarningMsg(null);
  }, [isOpen, initialData, defaultClientId, defaultCaseId, currentUser, repos]);

  if (!isOpen) return null;

  // Filter cases if client is selected
  const availableCases = clientId
    ? cases.filter((c) => c.clientId === clientId)
    : cases;

  const handleStartChange = (val: string) => {
    setStartsAt(val);
    // If endsAt is before or equal to startsAt, set endsAt to startsAt + 30m
    const startD = new Date(val);
    const endD = new Date(endsAt);
    if (!endsAt || endD <= startD) {
      const newEnd = new Date(startD.getTime() + 30 * 60 * 1000);
      setEndsAt(formatDatetimeLocal(newEnd.toISOString()));
    }
  };

  const toggleAttendee = (userId: string) => {
    setAttendeeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!title.trim()) {
      setErrorMsg(t('appointments.titleRequired', 'Title is required'));
      return;
    }
    const startIso = new Date(startsAt).toISOString();
    const endIso = new Date(endsAt).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      setErrorMsg(t('appointments.endAfterStart', 'End time must be after start time'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      if (initialData) {
        const res = await repos.appointment.update({ currentUser }, initialData.id, {
          title: title.trim(),
          type,
          mode,
          status,
          startsAt: startIso,
          endsAt: endIso,
          location: location.trim() || null,
          notes: notes.trim() || null,
          reminderMinutesBefore: reminderMinutesBefore !== null ? Number(reminderMinutesBefore) : undefined,
          clientId: clientId || null,
          caseId: caseId || null,
          attendees: attendeeIds,
          rescheduleReason: rescheduleReason.trim() || undefined,
        });

        if (res.overlapWarning) {
          setWarningMsg(t('appointments.overlapWarning', 'Warning: Overlapping appointment detected for one or more attendees.'));
        }
        onSaved(res, res.overlapWarning);
      } else {
        const res = await repos.appointment.create({ currentUser }, {
          title: title.trim(),
          type,
          mode,
          status,
          startsAt: startIso,
          endsAt: endIso,
          location: location.trim() || null,
          notes: notes.trim() || null,
          reminderMinutesBefore: reminderMinutesBefore !== null ? Number(reminderMinutesBefore) : undefined,
          clientId: clientId || null,
          caseId: caseId || null,
          attendees: attendeeIds,
        });

        if (res.overlapWarning) {
          setWarningMsg(t('appointments.overlapWarning', 'Warning: Overlapping appointment detected for one or more attendees.'));
        }
        onSaved(res, res.overlapWarning);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">
              {initialData
                ? isRescheduling
                  ? t('appointments.rescheduleTitle', 'Reschedule Appointment')
                  : t('appointments.editTitle', 'Edit Appointment')
                : t('appointments.scheduleTitle', 'Schedule Appointment')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {warningMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{warningMsg}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('appointments.title', 'Title / Subject')} *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Initial Client Consultation, Bail Hearing Prep"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
            />
          </div>

          {/* Type & Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.type', 'Appointment Type')} *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AppointmentType)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="client_meeting">{t('appointments.typeClientMeeting', 'Client Meeting')}</option>
                <option value="consultation">{t('appointments.typeConsultation', 'Consultation')}</option>
                <option value="phone_call">{t('appointments.typePhoneCall', 'Phone Call')}</option>
                <option value="internal_meeting">{t('appointments.typeInternalMeeting', 'Internal Meeting')}</option>
                <option value="court_visit">{t('appointments.typeCourtVisit', 'Court Visit')}</option>
                <option value="other">{t('appointments.typeOther', 'Other')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.mode', 'Meeting Mode')} *
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AppointmentMode)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="in_person">{t('appointments.modeInPerson', 'In Person')}</option>
                <option value="phone">{t('appointments.modePhone', 'Phone Call')}</option>
                <option value="video">{t('appointments.modeVideo', 'Video Conference')}</option>
              </select>
            </div>
          </div>

          {/* Starts At & Ends At */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.startsAt', 'Starts At')} *
              </label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => handleStartChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.endsAt', 'Ends At')} *
              </label>
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Reschedule Reason if changed */}
          {initialData && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                <span>{t('appointments.rescheduleReasonOptional', 'Reschedule Reason (Audited)')}</span>
              </div>
              <input
                type="text"
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Client requested postponement, Court list extended"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              />
            </div>
          )}

          {/* Location & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.location', 'Location / Venue')}
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Main Chamber, Dhaka Bar Library, Google Meet"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.status', 'Status')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="scheduled">{t('appointments.statusScheduled', 'Scheduled')}</option>
                <option value="completed">{t('appointments.statusCompleted', 'Completed')}</option>
                <option value="cancelled">{t('appointments.statusCancelled', 'Cancelled')}</option>
                <option value="no_show">{t('appointments.statusNoShow', 'No Show')}</option>
              </select>
            </div>
          </div>

          {/* Linked Client & Linked Case */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.linkedClient', 'Linked Client')} (Optional)
              </label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setCaseId('');
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="">{t('common.none')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.nameBn ? `(${c.nameBn})` : ''} - {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.linkedCase', 'Linked Case')} (Optional)
              </label>
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="">{t('common.none')}</option>
                {availableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber} - {c.court}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Attendees Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>{t('appointments.attendees', 'Staff / Lawyer Attendees')}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                {attendeeIds.length} {t('appointments.selected', 'selected')}
              </span>
            </label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
              {users.map((u) => {
                const isSelected = attendeeIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAttendee(u.id)}
                      className="rounded text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                    />
                    <span className="truncate">{u.name}</span>
                    <span className="text-[10px] text-slate-400 capitalize">({u.role})</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Reminder & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.reminder', 'Reminder Alert')}
              </label>
              <select
                value={reminderMinutesBefore === null ? 'none' : String(reminderMinutesBefore)}
                onChange={(e) =>
                  setReminderMinutesBefore(e.target.value === 'none' ? null : Number(e.target.value))
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              >
                <option value="none">{t('appointments.reminderNone', 'No reminder')}</option>
                <option value="15">{t('appointments.reminder15m', '15 minutes before')}</option>
                <option value="30">{t('appointments.reminder30m', '30 minutes before')}</option>
                <option value="60">{t('appointments.reminder1h', '1 hour before')}</option>
                <option value="1440">{t('appointments.reminder1d', '1 day before')}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.notes', 'Notes & Agenda')}
              </label>
              <textarea
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Meeting agenda, documents to bring, points of discussion..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-hidden resize-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || isReadOnly}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? t('common.saving') : t('common.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
