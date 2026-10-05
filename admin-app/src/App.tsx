import React, { useState, useEffect } from 'react';
import { PlatformAdmin } from './types/adminTypes';
import { adminApi } from './api/adminApi';
import { LoginScreen } from './screens/LoginScreen';
import { FirmListScreen } from './screens/FirmListScreen';
import { FirmDetailScreen } from './screens/FirmDetailScreen';
import { AuditScreen } from './screens/AuditScreen';
import { AdminNavbar } from './components/AdminNavbar';

export const App: React.FC = () => {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'firms' | 'audit'>('firms');
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);

  useEffect(() => {
    // Check session on load (using admin httpOnly cookie)
    adminApi
      .getMe()
      .then((res) => {
        setAdmin(res.admin);
      })
      .catch(() => {
        setAdmin(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } finally {
      setAdmin(null);
      setSelectedFirmId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Initializing Super Admin session...
      </div>
    );
  }

  if (!admin) {
    return <LoginScreen onLoginSuccess={(adminProfile) => setAdmin(adminProfile)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 antialiased overflow-x-hidden">
      <AdminNavbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setSelectedFirmId(null);
        }}
        admin={admin}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 overflow-x-hidden">
        {currentTab === 'firms' ? (
          selectedFirmId ? (
            <FirmDetailScreen
              firmId={selectedFirmId}
              onBack={() => setSelectedFirmId(null)}
            />
          ) : (
            <FirmListScreen onSelectFirm={(id) => setSelectedFirmId(id)} />
          )
        ) : (
          <AuditScreen />
        )}
      </main>
    </div>
  );
};

export default App;
