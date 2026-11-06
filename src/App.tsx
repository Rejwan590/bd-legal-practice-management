import React, { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './modules/foundation/AuthContext';
import { NavigationProvider, useNavigation } from './modules/foundation/NavigationContext';
import { AppShell } from './modules/foundation/AppShell';
import { LoginScreen } from './modules/foundation/LoginScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

const HealthScreen = lazy(() => import('./modules/health/HealthScreen').then(m => ({ default: m.HealthScreen })));
const AuditLogScreen = lazy(() => import('./modules/audit/AuditLogScreen').then(m => ({ default: m.AuditLogScreen })));
const SettingsScreen = lazy(() => import('./modules/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const ClientsScreen = lazy(() => import('./modules/clients/ClientsScreen').then(m => ({ default: m.ClientsScreen })));
const CasesScreen = lazy(() => import('./modules/cases/CasesScreen').then(m => ({ default: m.CasesScreen })));
const HearingsScreen = lazy(() => import('./modules/hearings/HearingsScreen').then(m => ({ default: m.HearingsScreen })));
const TasksScreen = lazy(() => import('./modules/tasks/TasksScreen').then(m => ({ default: m.TasksScreen })));
const FilesScreen = lazy(() => import('./modules/files/FilesScreen').then(m => ({ default: m.FilesScreen })));
const CalendarScreen = lazy(() => import('./modules/calendar/CalendarScreen').then(m => ({ default: m.CalendarScreen })));
const AppointmentsScreen = lazy(() => import('./modules/appointments/AppointmentsScreen').then(m => ({ default: m.AppointmentsScreen })));
const DashboardScreen = lazy(() => import('./modules/dashboard/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const BackupScreen = lazy(() => import('./modules/backup/BackupScreen').then(m => ({ default: m.BackupScreen })));
const GlobalSearchModal = lazy(() => import('./modules/search/GlobalSearchModal').then(m => ({ default: m.GlobalSearchModal })));
const BillingScreen = lazy(() => import('./modules/billing/BillingScreen').then(m => ({ default: m.BillingScreen })));

function MainApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const { route, navigateToScreen } = useNavigation();

  // Route guard: if the URL path is /admin or /admin/*, redirect to the Admin Console
  // to ensure the Chamber Member app is never mistakenly rendered for admin routes.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    window.location.replace('/admin/');
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Redirecting to Super Admin Console...
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-xs font-mono">Loading Chamber Session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const currentTab = route.screen;

  return (
    <AppShell>
      <ErrorBoundary fallbackTitle="An error occurred while loading this section">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12 min-h-[300px]">
            <div className="w-7 h-7 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          {currentTab === 'health' && <HealthScreen />}
          {currentTab === 'auditLog' && <AuditLogScreen />}
          {currentTab === 'settings' && <SettingsScreen />}
          {currentTab === 'backup' && <BackupScreen />}
          {currentTab === 'clients' && <ClientsScreen />}
          {currentTab === 'cases' && <CasesScreen />}
          {currentTab === 'hearings' && <HearingsScreen />}
          {currentTab === 'tasks' && <TasksScreen />}
          {currentTab === 'files' && <FilesScreen />}
          {currentTab === 'appointments' && <AppointmentsScreen />}
          {currentTab === 'calendar' && <CalendarScreen />}
          {currentTab === 'billing' && <BillingScreen />}
          {currentTab === 'search' && (
            <GlobalSearchModal
              isOpen={true}
              inlinePage={true}
              onClose={() => navigateToScreen('dashboard')}
            />
          )}
          {currentTab === 'dashboard' && <DashboardScreen />}
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="BD Legal Practice Management Application Error">
      <AuthProvider>
        <NavigationProvider>
          <MainApp />
        </NavigationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
