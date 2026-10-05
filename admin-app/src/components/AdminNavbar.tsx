import React, { useState } from 'react';
import { PlatformAdmin } from '../types/adminTypes';
import { Shield, Building2, History, LogOut, Menu, X } from 'lucide-react';

interface AdminNavbarProps {
  currentTab: 'firms' | 'audit';
  onSelectTab: (tab: 'firms' | 'audit') => void;
  admin: PlatformAdmin | null;
  onLogout: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({
  currentTab,
  onSelectTab,
  admin,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (tab: 'firms' | 'audit') => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-100 text-base leading-tight">BD Legal Platform</div>
              <div className="text-xs text-indigo-400 font-medium">Software Owner Super Admin</div>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => handleNav('firms')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                currentTab === 'firms'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Chamber Firms
            </button>
            <button
              onClick={() => handleNav('audit')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                currentTab === 'audit'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              Platform Audit Log
            </button>
          </nav>

          {/* Admin User & Logout */}
          <div className="hidden md:flex items-center gap-4">
            {admin && (
              <span className="text-xs text-slate-400 truncate max-w-[200px]" title={admin.email}>
                {admin.email}
              </span>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 min-h-[44px] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>

          {/* Mobile hamburger */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-slate-800 space-y-2">
            <button
              onClick={() => handleNav('firms')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                currentTab === 'firms' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-5 h-5" />
              Chamber Firms
            </button>
            <button
              onClick={() => handleNav('audit')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                currentTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <History className="w-5 h-5" />
              Platform Audit Log
            </button>
            {admin && (
              <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-800 truncate">
                Signed in as: <span className="text-slate-200">{admin.email}</span>
              </div>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 min-h-[44px]"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
