import React from 'react';
import { AuthProvider, useAuth } from './modules/foundation/AuthContext';
import { NavigationProvider, useNavigation } from './modules/foundation/NavigationContext';
import { AppShell } from './modules/foundation/AppShell';
import { LoginScreen } from './modules/foundation/LoginScreen';
import { HealthScreen } from './modules/health/HealthScreen';
import { AuditLogScreen } from './modules/audit/AuditLogScreen';
import { SettingsScreen } from './modules/settings/SettingsScreen';
import { ClientsScreen } from './modules/clients/ClientsScreen';
import { CasesScreen } from './modules/cases/CasesScreen';
import { HearingsScreen } from './modules/hearings/HearingsScreen';
import { TasksScreen } from './modules/tasks/TasksScreen';
import { FilesScreen } from './modules/files/FilesScreen';
import { CalendarScreen } from './modules/calendar/CalendarScreen';
import { AppointmentsScreen } from './modules/appointments/AppointmentsScreen';
import { DashboardScreen } from './modules/dashboard/DashboardScreen';
import { BackupScreen } from './modules/backup/BackupScreen';
import { GlobalSearchModal } from './modules/search/GlobalSearchModal';
import { BillingScreen } from './modules/billing/BillingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

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
