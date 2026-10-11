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
import { DashboardScreen } from './modules/dashboard/DashboardScreen';
import { BackupScreen } from './modules/backup/BackupScreen';
import { GlobalSearchModal } from './modules/search/GlobalSearchModal';

function MainApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const { route, navigateToScreen } = useNavigation();

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
      {currentTab === 'health' && <HealthScreen />}
      {currentTab === 'auditLog' && <AuditLogScreen />}
      {currentTab === 'settings' && <SettingsScreen />}
      {currentTab === 'backup' && <BackupScreen />}
      {currentTab === 'clients' && <ClientsScreen />}
      {currentTab === 'cases' && <CasesScreen />}
      {currentTab === 'hearings' && <HearingsScreen />}
      {currentTab === 'tasks' && <TasksScreen />}
      {currentTab === 'files' && <FilesScreen />}
      {currentTab === 'calendar' && <CalendarScreen />}
      {currentTab === 'search' && (
        <GlobalSearchModal
          isOpen={true}
          inlinePage={true}
          onClose={() => navigateToScreen('dashboard')}
        />
      )}
      {currentTab === 'dashboard' && <DashboardScreen />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <MainApp />
      </NavigationProvider>
    </AuthProvider>
  );
}
