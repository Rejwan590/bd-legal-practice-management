import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getRepositories } from '../../data/repositories';
import {
  CaseRecord,
  ClientRecord,
  HearingRecord,
  PhysicalFileRecord,
  TaskRecord,
} from '../../data/types';
import { CaseFormModal } from '../cases/CaseFormModal';
import { ClientFormModal } from '../clients/ClientFormModal';
import { HearingFormModal } from '../hearings/HearingFormModal';
import { RescheduleHearingModal } from '../hearings/RescheduleHearingModal';
import { AdjournHearingModal } from '../hearings/AdjournHearingModal';
import { HearingDateHistoryModal } from '../hearings/HearingDateHistoryModal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { TaskCompleteModal } from '../tasks/TaskCompleteModal';
import { TaskReassignModal } from '../tasks/TaskReassignModal';
import { FileFormModal } from '../files/FileFormModal';
import { FileCheckOutModal } from '../files/FileCheckOutModal';
import { FileCheckInModal } from '../files/FileCheckInModal';
import { FileHistoryModal } from '../files/FileHistoryModal';

export type NavTab =
  | 'dashboard'
  | 'cases'
  | 'clients'
  | 'appointments'
  | 'calendar'
  | 'tasks'
  | 'files'
  | 'hearings'
  | 'billing'
  | 'search'
  | 'backup'
  | 'auditLog'
  | 'settings'
  | 'health';

export type ScreenId = NavTab;
export type CaseDossierTab = 'overview' | 'hearings' | 'notes' | 'appointments' | 'tasks' | 'files' | 'activity' | 'billing';
export type ClientProfileTab = 'cases' | 'appointments' | 'tasks' | 'files' | 'billing';

export interface RouteState {
  screen: NavTab;
  caseId: string | null;
  caseTab: CaseDossierTab;
  clientId: string | null;
  clientTab: ClientProfileTab;
}

const VALID_CASE_TABS: CaseDossierTab[] = ['overview', 'hearings', 'notes', 'appointments', 'tasks', 'files', 'activity', 'billing'];
const VALID_CLIENT_TABS: ClientProfileTab[] = ['cases', 'appointments', 'tasks', 'files', 'billing'];

export function parseUrlRoute(pathname: string, hash: string = ''): RouteState {
  const cleanHash = hash.replace(/^#\/?/, '').trim();
  const rawPath = pathname && pathname !== '/' ? pathname : cleanHash ? `/${cleanHash}` : '/';
  const segments = rawPath
    .split('/')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  const defaultState: RouteState = {
    screen: 'dashboard',
    caseId: null,
    caseTab: 'overview',
    clientId: null,
    clientTab: 'cases',
  };

  if (segments.length === 0 || segments[0] === 'dashboard') {
    return defaultState;
  }

  const root = segments[0];

  if (root === 'cases') {
    const caseId = segments[1] || null;
    const rawTab = (segments[2] || 'overview').toLowerCase() as CaseDossierTab;
    const caseTab = VALID_CASE_TABS.includes(rawTab) ? rawTab : 'overview';
    return {
      ...defaultState,
      screen: 'cases',
      caseId,
      caseTab,
    };
  }

  if (root === 'clients') {
    const clientId = segments[1] || null;
    const rawTab = (segments[2] || 'cases').toLowerCase() as ClientProfileTab;
    const clientTab = VALID_CLIENT_TABS.includes(rawTab) ? rawTab : 'cases';
    return {
      ...defaultState,
      screen: 'clients',
      clientId,
      clientTab,
    };
  }

  if (root === 'appointments') return { ...defaultState, screen: 'appointments' };
  if (root === 'calendar') return { ...defaultState, screen: 'calendar' };
  if (root === 'tasks') return { ...defaultState, screen: 'tasks' };
  if (root === 'files') return { ...defaultState, screen: 'files' };
  if (root === 'hearings') return { ...defaultState, screen: 'hearings' };
  if (root === 'billing' || root === 'accounts') return { ...defaultState, screen: 'billing' };
  if (root === 'search') return { ...defaultState, screen: 'search' };
  if (root === 'backup') return { ...defaultState, screen: 'backup' };
  if (root === 'audit' || root === 'auditLog' || root === 'audit-log') {
    return { ...defaultState, screen: 'auditLog' };
  }
  if (root === 'settings') return { ...defaultState, screen: 'settings' };
  if (root === 'health') return { ...defaultState, screen: 'health' };

  return defaultState;
}

export function buildUrlFromRoute(route: RouteState): string {
  switch (route.screen) {
    case 'dashboard':
      return '/dashboard';
    case 'cases':
      if (route.caseId) {
        return `/cases/${encodeURIComponent(route.caseId)}/${route.caseTab || 'overview'}`;
      }
      return '/cases';
    case 'clients':
      if (route.clientId) {
        if (route.clientTab && route.clientTab !== 'cases') {
          return `/clients/${encodeURIComponent(route.clientId)}/${route.clientTab}`;
        }
        return `/clients/${encodeURIComponent(route.clientId)}`;
      }
      return '/clients';
    case 'appointments':
      return '/appointments';
    case 'calendar':
      return '/calendar';
    case 'tasks':
      return '/tasks';
    case 'files':
      return '/files';
    case 'hearings':
      return '/hearings';
    case 'billing':
      return '/billing';
    case 'search':
      return '/search';
    case 'backup':
      return '/backup';
    case 'auditLog':
      return '/audit';
    case 'settings':
      return '/settings';
    case 'health':
      return '/health';
    default:
      return '/dashboard';
  }
}

export interface ActiveCaseContextInfo {
  id?: string;
  caseId: string;
  clientId: string;
  caseNumber: string;
}

export interface ActiveClientContextInfo {
  id?: string;
  name?: string;
  clientId: string;
  clientName: string;
}

interface NavigationContextValue {
  route: RouteState;
  pathname: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  navigateToScreen: (screen: NavTab) => void;
  openCaseDossier: (caseId: string, tab?: CaseDossierTab) => void;
  openClientProfile: (clientId: string, tab?: ClientProfileTab) => void;
  goBack: (fallbackPath?: string) => void;
  refreshVersion: number;
  triggerRefresh: () => void;
  selectedCalendarDate: string;
  setSelectedCalendarDate: (dateIso: string) => void;
  activeCaseContext: ActiveCaseContextInfo | null;
  setActiveCaseContext: (ctx: ActiveCaseContextInfo | null) => void;
  activeClientContext: ActiveClientContextInfo | null;
  setActiveClientContext: (ctx: ActiveClientContextInfo | null) => void;
  // Global Hub Modals
  openCaseForm: (opts?: {
    initialData?: CaseRecord | null;
    defaultClientId?: string;
    lockClientId?: boolean;
  }) => void;
  openClientForm: (opts?: { initialData?: ClientRecord | null }) => void;
  openHearingForm: (opts?: {
    initialData?: HearingRecord | null;
    defaultCaseId?: string;
    lockCaseId?: boolean;
    defaultDate?: string;
  }) => void;
  openRescheduleHearing: (hearing: HearingRecord, caseTitle?: string) => void;
  openAdjournHearing: (hearing: HearingRecord, caseTitle?: string) => void;
  openHearingHistory: (hearing: HearingRecord, caseTitle?: string) => void;
  openTaskForm: (opts?: {
    initialData?: TaskRecord | null;
    defaultCaseId?: string | null;
    defaultClientId?: string | null;
    lockCaseAndClient?: boolean;
    lockClientOnly?: boolean;
    defaultDueDate?: string;
  }) => void;
  openTaskComplete: (task: TaskRecord) => void;
  openTaskReassign: (task: TaskRecord) => void;
  openFileForm: (opts?: {
    initialData?: PhysicalFileRecord | null;
    defaultCaseId?: string | null;
    defaultClientId?: string | null;
    lockCaseAndClient?: boolean;
    lockClientOnly?: boolean;
  }) => void;
  openFileCheckOut: (file: PhysicalFileRecord) => void;
  openFileCheckIn: (file: PhysicalFileRecord) => void;
  openFileHistory: (file: PhysicalFileRecord) => void;
  openEntityModalById: (
    entity: 'hearing' | 'task' | 'file' | 'case' | 'client' | 'appointment',
    id: string
  ) => Promise<void>;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, can, isReadOnly } = useAuth();
  const repos = getRepositories();

  const [route, setRoute] = useState<RouteState>(() =>
    typeof window !== 'undefined'
      ? parseUrlRoute(window.location.pathname, window.location.hash)
      : {
          screen: 'dashboard',
          caseId: null,
          caseTab: 'overview',
          clientId: null,
          clientTab: 'cases',
        }
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [activeCaseContext, setActiveCaseContext] = useState<ActiveCaseContextInfo | null>(null);
  const [activeClientContext, setActiveClientContext] = useState<ActiveClientContextInfo | null>(
    null
  );

  // Modal states
  const [caseFormState, setCaseFormState] = useState<{
    isOpen: boolean;
    initialData?: CaseRecord | null;
    defaultClientId?: string;
    lockClientId?: boolean;
  }>({ isOpen: false });

  const [clientFormState, setClientFormState] = useState<{
    isOpen: boolean;
    initialData?: ClientRecord | null;
  }>({ isOpen: false });

  const [hearingFormState, setHearingFormState] = useState<{
    isOpen: boolean;
    initialData?: HearingRecord | null;
    defaultCaseId?: string;
    lockCaseId?: boolean;
    defaultDate?: string;
  }>({ isOpen: false });

  const [rescheduleState, setRescheduleState] = useState<{
    hearing: HearingRecord | null;
    caseTitle?: string;
  }>({ hearing: null });

  const [adjournState, setAdjournState] = useState<{
    hearing: HearingRecord | null;
    caseTitle?: string;
  }>({ hearing: null });

  const [hearingHistoryState, setHearingHistoryState] = useState<{
    hearing: HearingRecord | null;
    caseTitle?: string;
  }>({ hearing: null });

  const [taskFormState, setTaskFormState] = useState<{
    isOpen: boolean;
    initialData?: TaskRecord | null;
    defaultCaseId?: string | null;
    defaultClientId?: string | null;
    lockCaseAndClient?: boolean;
    lockClientOnly?: boolean;
    defaultDueDate?: string;
  }>({ isOpen: false });

  const [taskCompleteTarget, setTaskCompleteTarget] = useState<TaskRecord | null>(null);
  const [taskReassignTarget, setTaskReassignTarget] = useState<TaskRecord | null>(null);

  const [fileFormState, setFileFormState] = useState<{
    isOpen: boolean;
    initialData?: PhysicalFileRecord | null;
    defaultCaseId?: string | null;
    defaultClientId?: string | null;
    lockCaseAndClient?: boolean;
    lockClientOnly?: boolean;
  }>({ isOpen: false });

  const [fileCheckOutTarget, setFileCheckOutTarget] = useState<PhysicalFileRecord | null>(null);
  const [fileCheckInTarget, setFileCheckInTarget] = useState<PhysicalFileRecord | null>(null);
  const [fileHistoryTarget, setFileHistoryTarget] = useState<PhysicalFileRecord | null>(null);

  // Normalize initial URL if hash was used or /cases/:id lacked tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parsed = parseUrlRoute(window.location.pathname, window.location.hash);
    const canonical = buildUrlFromRoute(parsed);
    if (
      (window.location.pathname === '/cases/' + parsed.caseId && parsed.caseId) ||
      (window.location.hash && window.location.pathname === '/')
    ) {
      window.history.replaceState({}, '', canonical);
    }
    setRoute(parsed);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setRoute(parseUrlRoute(window.location.pathname, window.location.hash));
    };
    const onHashChange = () => {
      if (window.location.hash) {
        const parsed = parseUrlRoute('', window.location.hash);
        const canonical = buildUrlFromRoute(parsed);
        window.history.replaceState({}, '', canonical);
        setRoute(parsed);
      }
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const parsed = parseUrlRoute(path, '');
    const canonical = buildUrlFromRoute(parsed);
    if (typeof window !== 'undefined') {
      if (options?.replace) {
        window.history.replaceState({}, '', canonical);
      } else if (window.location.pathname !== canonical) {
        window.history.pushState({}, '', canonical);
      }
    }
    setRoute(parsed);
  }, []);

  const navigateToScreen = useCallback(
    (screen: NavTab) => {
      const nextRoute: RouteState = {
        screen,
        caseId: null,
        caseTab: 'overview',
        clientId: null,
        clientTab: 'cases',
      };
      navigate(buildUrlFromRoute(nextRoute));
    },
    [navigate]
  );

  const openCaseDossier = useCallback(
    (caseId: string, tab: CaseDossierTab = 'overview') => {
      navigate(`/cases/${encodeURIComponent(caseId)}/${tab}`);
    },
    [navigate]
  );

  const openClientProfile = useCallback(
    (clientId: string, tab: ClientProfileTab = 'cases') => {
      const path =
        tab && tab !== 'cases'
          ? `/clients/${encodeURIComponent(clientId)}/${tab}`
          : `/clients/${encodeURIComponent(clientId)}`;
      navigate(path);
    },
    [navigate]
  );

  const goBack = useCallback(
    (fallbackPath?: string) => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else if (fallbackPath) {
        navigate(fallbackPath);
      } else if (route.caseId) {
        navigate('/cases');
      } else if (route.clientId) {
        navigate('/clients');
      } else {
        navigate('/dashboard');
      }
    },
    [navigate, route.caseId, route.clientId]
  );

  const triggerRefresh = useCallback(() => {
    if (currentUser) {
      repos.reminder.syncReminders({ currentUser }).catch(() => {});
    }
    setRefreshVersion((v) => v + 1);
  }, [currentUser, repos.reminder]);

  // Modal openers with permission and read-only enforcement
  const openCaseForm = useCallback(
    (opts?: {
      initialData?: CaseRecord | null;
      defaultClientId?: string;
      lockClientId?: boolean;
    }) => {
      if (isReadOnly) return;
      if (opts?.initialData ? !can('cases.edit') : !can('cases.create')) return;
      setCaseFormState({
        isOpen: true,
        initialData: opts?.initialData || null,
        defaultClientId: opts?.defaultClientId,
        lockClientId: opts?.lockClientId,
      });
    },
    [can, isReadOnly]
  );

  const openClientForm = useCallback(
    (opts?: { initialData?: ClientRecord | null }) => {
      if (isReadOnly) return;
      if (!can('clients.edit')) return;
      setClientFormState({
        isOpen: true,
        initialData: opts?.initialData || null,
      });
    },
    [can, isReadOnly]
  );

  const openHearingForm = useCallback(
    (opts?: {
      initialData?: HearingRecord | null;
      defaultCaseId?: string;
      lockCaseId?: boolean;
      defaultDate?: string;
    }) => {
      if (isReadOnly) return;
      if (!can('hearings.update')) return;
      setHearingFormState({
        isOpen: true,
        initialData: opts?.initialData || null,
        defaultCaseId: opts?.defaultCaseId,
        lockCaseId: opts?.lockCaseId,
        defaultDate: opts?.defaultDate,
      });
    },
    [can, isReadOnly]
  );

  const openRescheduleHearing = useCallback(
    (hearing: HearingRecord, caseTitle?: string) => {
      if (isReadOnly || !can('hearings.update')) return;
      setRescheduleState({ hearing, caseTitle });
    },
    [can, isReadOnly]
  );

  const openAdjournHearing = useCallback(
    (hearing: HearingRecord, caseTitle?: string) => {
      if (isReadOnly || !can('hearings.update')) return;
      setAdjournState({ hearing, caseTitle });
    },
    [can, isReadOnly]
  );

  const openHearingHistory = useCallback((hearing: HearingRecord, caseTitle?: string) => {
    setHearingHistoryState({ hearing, caseTitle });
  }, []);

  const openTaskForm = useCallback(
    (opts?: {
      initialData?: TaskRecord | null;
      defaultCaseId?: string | null;
      defaultClientId?: string | null;
      lockCaseAndClient?: boolean;
      lockClientOnly?: boolean;
      defaultDueDate?: string;
    }) => {
      if (isReadOnly) return;
      if (!can('tasks.assign')) return;
      setTaskFormState({
        isOpen: true,
        initialData: opts?.initialData || null,
        defaultCaseId: opts?.defaultCaseId,
        defaultClientId: opts?.defaultClientId,
        lockCaseAndClient: opts?.lockCaseAndClient,
        lockClientOnly: opts?.lockClientOnly,
        defaultDueDate: opts?.defaultDueDate,
      });
    },
    [can, isReadOnly]
  );

  const openTaskComplete = useCallback(
    (task: TaskRecord) => {
      if (isReadOnly || !can('tasks.complete')) return;
      setTaskCompleteTarget(task);
    },
    [can, isReadOnly]
  );

  const openTaskReassign = useCallback(
    (task: TaskRecord) => {
      if (isReadOnly || !can('tasks.assign')) return;
      setTaskReassignTarget(task);
    },
    [can, isReadOnly]
  );

  const openFileForm = useCallback(
    (opts?: {
      initialData?: PhysicalFileRecord | null;
      defaultCaseId?: string | null;
      defaultClientId?: string | null;
      lockCaseAndClient?: boolean;
      lockClientOnly?: boolean;
    }) => {
      if (isReadOnly || !can('files.manage')) return;
      setFileFormState({
        isOpen: true,
        initialData: opts?.initialData || null,
        defaultCaseId: opts?.defaultCaseId,
        defaultClientId: opts?.defaultClientId,
        lockCaseAndClient: opts?.lockCaseAndClient,
        lockClientOnly: opts?.lockClientOnly,
      });
    },
    [can, isReadOnly]
  );

  const openFileCheckOut = useCallback(
    (file: PhysicalFileRecord) => {
      if (isReadOnly || !can('files.manage')) return;
      setFileCheckOutTarget(file);
    },
    [can, isReadOnly]
  );

  const openFileCheckIn = useCallback(
    (file: PhysicalFileRecord) => {
      if (isReadOnly || !can('files.manage')) return;
      setFileCheckInTarget(file);
    },
    [can, isReadOnly]
  );

  const openFileHistory = useCallback((file: PhysicalFileRecord) => {
    setFileHistoryTarget(file);
  }, []);

  const openEntityModalById = useCallback(
    async (entity: 'hearing' | 'task' | 'file' | 'case' | 'client' | 'appointment', id: string) => {
      if (!currentUser) return;
      try {
        if (entity === 'appointment') {
          navigateToScreen('appointments');
          return;
        }
        if (entity === 'case') {
          const c = await repos.case.getById({ currentUser }, id);
          if (c) openCaseDossier(c.id, 'overview');
          return;
        }
        if (entity === 'client') {
          const cl = await repos.client.getById({ currentUser }, id);
          if (cl) openClientProfile(cl.id, 'cases');
          return;
        }
        if (entity === 'hearing') {
          const h = await repos.hearing.getById({ currentUser }, id);
          if (!h) return;
          if (!isReadOnly && can('hearings.update')) {
            openHearingForm({ initialData: h });
          } else {
            openCaseDossier(h.caseId, 'hearings');
          }
          return;
        }
        if (entity === 'task') {
          const tRec = await repos.task.getById({ currentUser }, id);
          if (!tRec) return;
          if (!isReadOnly && can('tasks.assign')) {
            openTaskForm({ initialData: tRec });
          } else if (!isReadOnly && can('tasks.complete') && tRec.status !== 'completed') {
            openTaskComplete(tRec);
          } else if (tRec.caseId) {
            openCaseDossier(tRec.caseId, 'tasks');
          } else {
            navigateToScreen('tasks');
          }
          return;
        }
        if (entity === 'file') {
          const fRec = await repos.physicalFile.getById({ currentUser }, id);
          if (!fRec) return;
          if (!isReadOnly && can('files.manage')) {
            openFileForm({ initialData: fRec });
          } else if (fRec.caseId) {
            openCaseDossier(fRec.caseId, 'files');
          } else {
            navigateToScreen('files');
          }
        }
      } catch (err) {
        console.error('Failed to open entity by ID:', err);
      }
    },
    [
      currentUser,
      repos,
      isReadOnly,
      can,
      openCaseDossier,
      openClientProfile,
      openHearingForm,
      openTaskForm,
      openTaskComplete,
      openFileForm,
      navigateToScreen,
    ]
  );

  const pathname = buildUrlFromRoute(route);

  return (
    <NavigationContext.Provider
      value={{
        route,
        pathname,
        navigate,
        navigateToScreen,
        openCaseDossier,
        openClientProfile,
        goBack,
        refreshVersion,
        triggerRefresh,
        selectedCalendarDate,
        setSelectedCalendarDate,
        activeCaseContext,
        setActiveCaseContext,
        activeClientContext,
        setActiveClientContext,
        openCaseForm,
        openClientForm,
        openHearingForm,
        openRescheduleHearing,
        openAdjournHearing,
        openHearingHistory,
        openTaskForm,
        openTaskComplete,
        openTaskReassign,
        openFileForm,
        openFileCheckOut,
        openFileCheckIn,
        openFileHistory,
        openEntityModalById,
      }}
    >
      {children}

      {/* Global Shared Hub Modals */}
      {currentUser && (
        <>
          <CaseFormModal
            isOpen={caseFormState.isOpen}
            onClose={() => setCaseFormState({ isOpen: false })}
            initialData={caseFormState.initialData}
            defaultClientId={caseFormState.defaultClientId}
            lockClientId={caseFormState.lockClientId}
            onSave={async (data) => {
              if (caseFormState.initialData) {
                await repos.case.update({ currentUser }, caseFormState.initialData.id, data);
              } else {
                await repos.case.create({ currentUser }, data);
              }
              triggerRefresh();
            }}
          />

          <ClientFormModal
            isOpen={clientFormState.isOpen}
            onClose={() => setClientFormState({ isOpen: false })}
            initialData={clientFormState.initialData}
            onSave={async (data) => {
              if (clientFormState.initialData) {
                await repos.client.update({ currentUser }, clientFormState.initialData.id, data);
              } else {
                await repos.client.create({ currentUser }, data);
              }
              triggerRefresh();
            }}
          />

          <HearingFormModal
            isOpen={hearingFormState.isOpen}
            onClose={() => setHearingFormState({ isOpen: false })}
            initialData={hearingFormState.initialData}
            defaultCaseId={hearingFormState.defaultCaseId}
            lockCaseId={hearingFormState.lockCaseId}
            defaultDate={hearingFormState.defaultDate}
            onSave={async (data) => {
              if (hearingFormState.initialData) {
                await repos.hearing.update({ currentUser }, hearingFormState.initialData.id, {
                  appearingLawyerId: data.appearingLawyerId,
                  scheduledAt: data.scheduledAt,
                  fixedFor: data.fixedFor,
                  fixedForNote: data.fixedForNote,
                  purpose: data.purpose,
                  outcomeNote: data.outcomeNote,
                  status: data.status,
                });
              } else {
                await repos.hearing.create({ currentUser }, data);
              }
              triggerRefresh();
            }}
          />

          <RescheduleHearingModal
            isOpen={Boolean(rescheduleState.hearing)}
            hearing={rescheduleState.hearing}
            onClose={() => setRescheduleState({ hearing: null })}
            onReschedule={async (hearingId, newDate, reason, fixedFor, fixedForNote) => {
              await repos.hearing.rescheduleDate({ currentUser }, hearingId, newDate, reason, fixedFor, fixedForNote);
              triggerRefresh();
            }}
          />

          <AdjournHearingModal
            isOpen={Boolean(adjournState.hearing)}
            hearing={adjournState.hearing}
            onClose={() => setAdjournState({ hearing: null })}
            onAdjournAndScheduleNext={async (
              hearingId,
              outcomeNote,
              nextDate,
              nextPurpose,
              reason,
              nextFixedFor,
              nextFixedForNote
            ) => {
              await repos.hearing.adjournAndScheduleNext(
                { currentUser },
                hearingId,
                outcomeNote,
                nextDate,
                nextPurpose,
                reason,
                nextFixedFor,
                nextFixedForNote
              );
              triggerRefresh();
            }}
          />

          <HearingDateHistoryModal
            isOpen={Boolean(hearingHistoryState.hearing)}
            hearing={hearingHistoryState.hearing}
            onClose={() => setHearingHistoryState({ hearing: null })}
          />

          <TaskFormModal
            isOpen={taskFormState.isOpen}
            initialData={taskFormState.initialData}
            defaultCaseId={taskFormState.defaultCaseId}
            defaultClientId={taskFormState.defaultClientId}
            lockCaseAndClient={taskFormState.lockCaseAndClient}
            lockClientOnly={taskFormState.lockClientOnly}
            defaultDueDate={taskFormState.defaultDueDate}
            onClose={() => setTaskFormState({ isOpen: false })}
            onSave={async (data) => {
              if (taskFormState.initialData) {
                await repos.task.update({ currentUser }, taskFormState.initialData.id, data);
              } else {
                await repos.task.create({ currentUser }, data);
              }
              triggerRefresh();
            }}
          />

          <TaskCompleteModal
            isOpen={Boolean(taskCompleteTarget)}
            task={taskCompleteTarget}
            onClose={() => setTaskCompleteTarget(null)}
            onComplete={async (taskId, completionNote) => {
              await repos.task.complete({ currentUser }, taskId, completionNote);
              triggerRefresh();
            }}
          />

          <TaskReassignModal
            isOpen={Boolean(taskReassignTarget)}
            task={taskReassignTarget}
            onClose={() => setTaskReassignTarget(null)}
            onReassign={async (taskId, newAssigneeId) => {
              await repos.task.reassign({ currentUser }, taskId, newAssigneeId);
              triggerRefresh();
            }}
          />

          <FileFormModal
            isOpen={fileFormState.isOpen}
            initialData={fileFormState.initialData}
            defaultCaseId={fileFormState.defaultCaseId}
            defaultClientId={fileFormState.defaultClientId}
            lockCaseAndClient={fileFormState.lockCaseAndClient}
            lockClientOnly={fileFormState.lockClientOnly}
            onClose={() => setFileFormState({ isOpen: false })}
            onSave={async (data) => {
              if (fileFormState.initialData) {
                await repos.physicalFile.update({ currentUser }, fileFormState.initialData.id, data);
              } else {
                await repos.physicalFile.create({ currentUser }, data);
              }
              triggerRefresh();
            }}
          />

          <FileCheckOutModal
            isOpen={Boolean(fileCheckOutTarget)}
            file={fileCheckOutTarget}
            onClose={() => setFileCheckOutTarget(null)}
            onCheckOut={async (fileId, holderId, dueBackAt, note) => {
              await repos.physicalFile.checkOut({ currentUser }, fileId, holderId, dueBackAt, note);
              triggerRefresh();
            }}
          />

          <FileCheckInModal
            isOpen={Boolean(fileCheckInTarget)}
            file={fileCheckInTarget}
            onClose={() => setFileCheckInTarget(null)}
            onCheckIn={async (fileId, shelfLocation, note) => {
              await repos.physicalFile.checkIn({ currentUser }, fileId, shelfLocation, note);
              triggerRefresh();
            }}
          />

          <FileHistoryModal
            isOpen={Boolean(fileHistoryTarget)}
            file={fileHistoryTarget}
            onClose={() => setFileHistoryTarget(null)}
          />
        </>
      )}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextValue => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
};
