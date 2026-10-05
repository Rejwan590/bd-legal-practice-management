import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { UserSwitchModal } from './UserSwitchModal';
import { GlobalSearchModal } from '../search/GlobalSearchModal';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Gavel,
  CheckSquare,
  FolderArchive,
  Calendar,
  FileText,
  Settings,
  Activity,
  Globe,
  ChevronDown,
  Menu,
  X,
  Building,
  UserCheck,
  Search,
  Database,
  Lock,
  Clock,
  CreditCard,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'clients'
  | 'cases'
  | 'hearings'
  | 'tasks'
  | 'files'
  | 'calendar'
  | 'backup'
  | 'auditLog'
  | 'settings'
  | 'health';

interface AppShellProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab, id?: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentTab, onSelectTab, children }) => {
  const { t, i18n } = useTranslation();
  const { currentUser, currentFirm, subscription, can, refreshState } = useAuth();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Tablet collapsible sidebar: defaults to collapsed on tablet screens (768-1023px)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768 && window.innerWidth < 1024;
    }
    return false;
  });

  // Automatically adapt sidebar collapse state on window resize
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 768 && width < 1024) {
        // On tablet default to compact icon rail
        setSidebarCollapsed(true);
      } else if (width >= 1024) {
        // On desktop default to expanded sidebar
        setSidebarCollapsed(false);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'bn' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, stage: 1 },
    { id: 'clients', label: t('nav.clients'), icon: Users, stage: 1 },
    { id: 'cases', label: t('nav.cases'), icon: Briefcase, stage: 1 },
    { id: 'hearings', label: t('nav.hearings'), icon: Gavel, stage: 1 },
    { id: 'tasks', label: t('nav.tasks'), icon: CheckSquare, stage: 1 },
    { id: 'files', label: t('nav.files'), icon: FolderArchive, stage: 1 },
    { id: 'calendar', label: t('nav.calendar'), icon: Calendar, stage: 1 },
    {
      id: 'backup',
      label: t('nav.backup'),
      icon: Database,
      stage: 1,
      hide: !can('data.export') && !can('settings.manage'),
    },
    {
      id: 'auditLog',
      label: t('nav.auditLog'),
      icon: FileText,
      stage: 1,
      hide: !can('settings.manage'),
    },
    { id: 'settings', label: t('nav.settings'), icon: Settings, stage: 1 },
    { id: 'health', label: t('nav.health'), icon: Activity, stage: 1, highlight: true },
  ];

  // Rule 3: 4 most-used screens for mobile bottom navigation
  const bottomNavItems: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'cases', label: t('nav.cases'), icon: Briefcase },
    { id: 'calendar', label: t('nav.calendar'), icon: Calendar },
    { id: 'tasks', label: t('nav.tasks'), icon: CheckSquare },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col w-full overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs pt-safe">
        <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Chamber Brand & Mobile Drawer Trigger */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Hamburger button for phone drawer (<md) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-11 h-11 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
              aria-label="Toggle navigation drawer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Sidebar collapse toggle for tablet/desktop (>=md) */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden md:flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition shrink-0"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>

            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-base sm:text-lg shadow-xs shrink-0">
                <Building className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1
                  className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-tight truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs"
                  title={currentFirm?.name || t('app.chamberName')}
                >
                  {currentFirm?.name || t('app.chamberName')}
                </h1>
                <p className="hidden sm:block text-[11px] text-slate-500 font-medium truncate">
                  {t('app.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Global Search Header Trigger */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition border border-slate-200/60 shadow-2xs min-h-[44px]"
              title="Search cases, clients, hearings, tasks, files (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-slate-500" />
              <span className="hidden lg:inline">{t('common.search')}</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-slate-400 border border-slate-200">
                ⌘K
              </kbd>
            </button>

            {/* Mobile / Tablet search icon button */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="md:hidden w-11 h-11 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
              aria-label="Global Search"
            >
              <Search className="w-5 h-5 text-slate-600" />
            </button>

            {/* Language Toggle Button with 44px tap target */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 h-11 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 text-slate-700 active:bg-slate-200 transition shrink-0 min-w-[44px]"
              title="Toggle language (English / বাংলা)"
              aria-label="Toggle language between English and Bengali"
            >
              <Globe className="w-4 h-4 text-slate-500 shrink-0" />
              <span className={i18n.language === 'en' ? 'font-bold text-slate-900' : 'text-slate-500'}>
                EN
              </span>
              <span className="text-slate-300">/</span>
              <span className={i18n.language === 'bn' ? 'font-bold text-slate-900 font-bengali' : 'text-slate-500 font-bengali'}>
                বাং
              </span>
            </button>

            {/* User Session & Role Selector */}
            <button
              onClick={() => setUserModalOpen(true)}
              className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 h-11 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-left transition shadow-2xs group shrink-0 active:bg-slate-50"
              aria-label="Switch User Profile"
            >
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  currentUser.role === 'Owner'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[80px] lg:max-w-[130px]">
                    {currentUser.name}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider shrink-0 ${
                      currentUser.role === 'Owner'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* Read-Only Mode Banner (Past Grace Period) */}
      {subscription.isReadOnly && (
        <div className="bg-rose-900 border-b border-rose-950 text-white px-3 sm:px-6 py-2.5 shadow-sm">
          <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-rose-800 text-rose-200 shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <div className="leading-snug">
                <span className="text-xs sm:text-sm font-bold tracking-tight block sm:inline mr-2 text-white">
                  {t('subscription.readOnlyBannerTitle')}
                </span>
                <span className="text-xs text-rose-200">
                  {t('subscription.readOnlyBannerDesc')} ({t('subscription.validUntil', { date: subscription.formattedExpiry })})
                </span>
              </div>
            </div>
            {can('settings.manage') && (
              <a
                href="mailto:support@firm.bd?subject=License%20Renewal%20Request"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-900 rounded-xl text-xs font-bold shrink-0 transition shadow-2xs cursor-pointer min-h-[44px]"
              >
                <Mail className="w-4 h-4" />
                <span>Contact support to renew &rarr;</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Grace Period Banner */}
      {subscription.inGracePeriod && (
        <div className="bg-rose-600 border-b border-rose-700 text-white px-3 sm:px-6 py-2.5 shadow-sm">
          <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-rose-700 text-rose-100 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div className="leading-snug">
                <span className="text-xs sm:text-sm font-bold tracking-tight block sm:inline mr-2 text-white">
                  {t('subscription.graceBannerTitle', {
                    defaultValue: `License expired, ${subscription.graceDaysRemaining} days of grace left`,
                    days: subscription.graceDaysRemaining,
                  })}
                </span>
                <span className="text-xs text-rose-100">
                  {t('subscription.graceBannerDesc', {
                    defaultValue: `Your chamber license expired on ${subscription.formattedExpiry}. Full chamber features remain active during grace. Renew before read-only mode applies.`,
                    days: subscription.graceDaysRemaining,
                    expiry: subscription.formattedExpiry,
                  })}
                </span>
              </div>
            </div>
            {can('settings.manage') && (
              <a
                href="mailto:support@firm.bd?subject=License%20Renewal%20Request"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-900 rounded-xl text-xs font-bold shrink-0 transition shadow-2xs cursor-pointer min-h-[44px]"
              >
                <Mail className="w-4 h-4" />
                <span>Contact support to renew &rarr;</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Expiring Soon Banner */}
      {subscription.isExpiringSoon && !subscription.isReadOnly && (
        <div className="bg-amber-600 border-b border-amber-700 text-white px-3 sm:px-6 py-2 shadow-xs">
          <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-700/80 text-amber-100 shrink-0">
                <Clock className="w-4 h-4" />
              </span>
              <div className="leading-snug">
                <span className="text-xs sm:text-sm font-bold block sm:inline mr-2 text-white">
                  {t('subscription.expiringBannerTitle')}
                </span>
                <span className="text-xs text-amber-100">
                  {t('subscription.expiringBannerDesc', {
                    days: subscription.daysRemaining,
                    expiry: subscription.formattedExpiry,
                  })}
                </span>
              </div>
            </div>
            {can('settings.manage') && (
              <a
                href="mailto:support@firm.bd?subject=License%20Renewal%20Request"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-50 text-amber-900 rounded-xl text-xs font-bold shrink-0 transition shadow-2xs cursor-pointer min-h-[44px]"
              >
                <Mail className="w-4 h-4" />
                <span>Contact support to renew &rarr;</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main Layout Container (Desktop sidebar + Content) */}
      <div className="flex-1 max-w-7xl 2xl:max-w-[1536px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex gap-4 lg:gap-6 min-w-0">
        {/* Tablet / Desktop Sidebar (>=md) */}
        <aside
          className={`hidden md:flex flex-col shrink-0 transition-all duration-200 ${
            sidebarCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          {!sidebarCollapsed && (
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2 truncate">
              Chamber Navigation
            </div>
          )}

          <nav className="space-y-1 flex-1">
            {navItems.map((item) => {
              if (item.hide) return null;
              const isActive = currentTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id as ActiveTab)}
                  title={item.label}
                  className={`w-full flex items-center ${
                    sidebarCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-2.5'
                  } rounded-xl text-sm font-medium transition min-h-[44px] ${
                    isActive
                      ? item.highlight
                        ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                        : 'bg-slate-900 text-white shadow-xs font-semibold'
                      : item.highlight
                      ? 'text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className={`flex items-center gap-2.5 ${sidebarCollapsed ? 'justify-center' : 'min-w-0 truncate'}`}>
                    <Icon className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!sidebarCollapsed && item.stage > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-200/60 text-slate-600">
                      S{item.stage}
                    </span>
                  )}
                  {!sidebarCollapsed && item.highlight && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {sidebarCollapsed && item.highlight && !isActive && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Session Footer inside Sidebar */}
          <div className="pt-4 mt-4 border-t border-slate-200">
            {sidebarCollapsed ? (
              <button
                onClick={() => setUserModalOpen(true)}
                className="w-full flex justify-center py-2 text-slate-600 hover:text-indigo-600"
                title={`${currentUser.name} (${currentUser.role})`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    currentUser.role === 'Owner'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
              </button>
            ) : (
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                  Session Active
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate font-medium">{currentUser.email}</span>
                </div>
                <button
                  onClick={() => setUserModalOpen(true)}
                  className="w-full text-xs text-indigo-600 hover:text-indigo-800 font-semibold text-left underline block pt-1"
                >
                  {t('auth.switchUser')} &rarr;
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Slide-Out Drawer (<md) */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-out drawer panel */}
            <div className="relative w-4/5 max-w-xs bg-white h-[100dvh] p-4 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200 pt-safe pb-safe">
              <div className="flex flex-col min-h-0 flex-1">
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">
                      <Building className="w-4 h-4" />
                    </div>
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {currentFirm?.name || 'BD LawSuite'}
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
                    aria-label="Close navigation drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Nav items list */}
                <nav className="mt-3 space-y-1 overflow-y-auto flex-1 overscroll-contain pr-1">
                  {navItems.map((item) => {
                    if (item.hide) return null;
                    const isActive = currentTab === item.id;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectTab(item.id as ActiveTab);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition min-h-[44px] ${
                          isActive
                            ? 'bg-slate-900 text-white font-semibold'
                            : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 truncate">
                          <Icon className="w-5 h-5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.stage > 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-600 shrink-0">
                            S{item.stage}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Drawer footer session info */}
              <div className="border-t border-slate-100 pt-3 mt-2 shrink-0">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setUserModalOpen(true);
                  }}
                  className="w-full min-h-[44px] py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl text-xs font-semibold text-slate-800 text-center flex items-center justify-center gap-2 transition"
                >
                  <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">{t('auth.switchUser')} ({currentUser.name})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area (with bottom padding on phone to clear fixed bottom navigation) */}
        <main className="flex-1 min-w-0 w-full pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Phone Bottom Navigation Bar (<md: Dashboard, Cases, Calendar, Tasks) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg pb-safe"
      >
        <div className="flex items-center justify-around h-15 px-1 max-w-lg mx-auto">
          {bottomNavItems.map((item) => {
            const isActive = currentTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[48px] rounded-lg transition-colors ${
                  isActive ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
                aria-label={item.label}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'}`} />
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full px-1">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Switch User Modal */}
      <UserSwitchModal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} />

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={(tab, id) => onSelectTab(tab as ActiveTab, id)}
      />
    </div>
  );
};
