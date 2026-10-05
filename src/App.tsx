import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './modules/foundation/AuthContext';
import { AppShell, ActiveTab } from './modules/foundation/AppShell';
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

function MainApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as ActiveTab;
      if (
        [
          'dashboard',
          'clients',
          'cases',
          'hearings',
          'tasks',
          'files',
          'calendar',
          'backup',
          'auditLog',
          'settings',
          'health',
        ].includes(hash)
      ) {
        return hash;
      }
      if (window.location.pathname.includes('/health')) {
        return 'health';
      }
    }
    return 'dashboard';
  });

  const handleSelectTab = (tab: ActiveTab, id?: string) => {
    setCurrentTab(tab);
    setSelectedEntityId(id || null);
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as ActiveTab;
      if (
        [
          'dashboard',
          'clients',
          'cases',
          'hearings',
          'tasks',
          'files',
          'calendar',
          'backup',
          'auditLog',
          'settings',
          'health',
        ].includes(hash)
      ) {
        setCurrentTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  return (
    <AppShell currentTab={currentTab} onSelectTab={handleSelectTab}>
      {currentTab === 'health' && <HealthScreen />}
      {currentTab === 'auditLog' && <AuditLogScreen />}
      {currentTab === 'settings' && <SettingsScreen />}
      {currentTab === 'backup' && <BackupScreen />}
      {currentTab === 'clients' && (
        <ClientsScreen
          initialSelectedClientId={selectedEntityId}
          onNavigateToCase={(caseId) => handleSelectTab('cases', caseId)}
        />
      )}
      {currentTab === 'cases' && (
        <CasesScreen
          initialSelectedCaseId={selectedEntityId}
          onNavigateToClient={(clientId) => handleSelectTab('clients', clientId)}
        />
      )}
      {currentTab === 'hearings' && <HearingsScreen />}
      {currentTab === 'tasks' && <TasksScreen />}
      {currentTab === 'files' && <FilesScreen />}
      {currentTab === 'calendar' && <CalendarScreen />}
      {currentTab === 'dashboard' && (
        <DashboardScreen onNavigate={(tab, id) => handleSelectTab(tab as ActiveTab, id)} />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
