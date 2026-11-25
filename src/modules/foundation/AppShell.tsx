import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { calculateDaysLeftDhaka, toBnDigits } from '../../utils/dateUtils';
import { useNavigation, ScreenId } from './NavigationContext';
const UserSwitchModal = React.lazy(() => import('./UserSwitchModal').then(m => ({ default: m.UserSwitchModal })));
const GlobalSearchModal = React.lazy(() => import('../search/GlobalSearchModal').then(m => ({ default: m.GlobalSearchModal })));
import { Logo } from '../../components/Logo';
import { InstallAppPrompt } from '../../components/InstallAppPrompt';
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
  Search,
  Database,
  Lock,
  Clock,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
  MessageSquare,
  Plus,
  MoreHorizontal,
  CreditCard,
} from 'lucide-react';

export type ActiveTab = ScreenId;

interface AppShellProps {
  currentTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab, id?: string) => void;
  children: React.ReactNode;
}

export const SHELL_CONTAINER_CLASS = 'w-full min-w-0 px-3 sm:px-6 lg:px-8';

export const getContentWrapperClass = (): string => {
  return `flex-1 ${SHELL_CONTAINER_CLASS} py-3.5 sm:py-5 flex gap-4 lg:gap-6 min-w-0`;
};

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const { currentUser, currentFirm, subscription, can, isReadOnly } = useAuth();
  const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string) || '';
  const supportWhatsapp = (import.meta.env.VITE_SUPPORT_WHATSAPP as string) || '';
  const trialDaysLeft = currentFirm?.licenseExpiresAt ? Math.max(0, calculateDaysLeftDhaka(currentFirm.licenseExpiresAt)) : 0;
  const {
    route,
    navigateToScreen,
    openCaseDossier,
    openClientProfile,
    activeCaseContext,
    activeClientContext,
    selectedCalendarDate,
    openCaseForm,
    openClientForm,
    openAppointmentForm,
    openHearingForm,
    openTaskForm,
    openFileForm,
  } = useNavigation();

  const currentTab = route.screen;

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddRef = useRef<HTMLDivElement>(null);

  // Close quickAdd menu on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickAddOpen(false);
      }
    };

    if (quickAddOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [quickAddOpen]);

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
        setSidebarCollapsed(true);
      } else if (width >= 1024) {
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

  const handleSelectNav = (tab: ActiveTab, id?: string) => {
    if (tab === 'cases' && id) {
      openCaseDossier(id, 'overview');
    } else if (tab === 'clients' && id) {
      openClientProfile(id, 'cases');
    } else {
      navigateToScreen(tab);
    }
  };

  const navSections = [
    {
      titleKey: 'app.sectionPractice',
      defaultTitle: 'Practice & Matters',
      items: [
        { id: 'dashboard' as ActiveTab, label: t('nav.dashboard'), icon: LayoutDashboard },
        { id: 'clients' as ActiveTab, label: t('nav.clients'), icon: Users },
        { id: 'cases' as ActiveTab, label: t('nav.cases'), icon: Briefcase },
        { id: 'hearings' as ActiveTab, label: t('nav.hearings'), icon: Gavel },
        { id: 'calendar' as ActiveTab, label: t('nav.calendar'), icon: Calendar },
        { id: 'appointments' as ActiveTab, label: t('nav.appointments', 'Appointments'), icon: Clock, hide: !can('appointments.view') },
        { id: 'tasks' as ActiveTab, label: t('nav.tasks'), icon: CheckSquare },
        { id: 'files' as ActiveTab, label: t('nav.files'), icon: FolderArchive },
      ],
    },
    {
      titleKey: 'app.sectionFinance',
      defaultTitle: 'Finance & Accounts',
      items: [
        { id: 'billing' as ActiveTab, label: t('nav.billing', 'Billing'), icon: CreditCard, hide: !(can('accounts.view') || can('billing.view') || can('expenses.record')) },
      ],
    },
    {
      titleKey: 'app.sectionAdmin',
      defaultTitle: 'Chamber Administration',
      items: [
        { id: 'backup' as ActiveTab, label: t('nav.backup'), icon: Database, hide: !can('data.export') && !can('settings.manage') },
        { id: 'auditLog' as ActiveTab, label: t('nav.auditLog'), icon: FileText, hide: !can('settings.manage') },
        { id: 'settings' as ActiveTab, label: t('nav.settings'), icon: Settings },
        { id: 'health' as ActiveTab, label: t('nav.health'), icon: Activity, highlight: true },
      ],
    },
  ];

  const navItems = navSections.flatMap((s) => s.items);

  // Mobile bottom navigation: Dashboard, Clients, Cases, Calendar, More
  const bottomNavItems: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'clients', label: t('nav.clients'), icon: Users },
    { id: 'cases', label: t('nav.cases'), icon: Briefcase },
    { id: 'calendar', label: t('nav.calendar'), icon: Calendar },
  ];

  const isMoreTabActive = !['dashboard', 'clients', 'cases', 'calendar'].includes(currentTab);

  // Build 6 quick add actions in exact order
  type QuickActionItem = {
    key: string;
    label: string;
    desc: string;
    icon: React.ElementType;
    onClick: () => void;
  };

  const getQuickActions = (): QuickActionItem[] => {
    if (isReadOnly) return [];

    const actions: QuickActionItem[] = [];

    const targetCaseId = activeCaseContext?.caseId || activeCaseContext?.id || (route.screen === 'cases' ? route.caseId : undefined);
    const targetClientId = activeClientContext?.clientId || activeClientContext?.id || (route.screen === 'clients' ? route.clientId : undefined);
    const targetClientName = activeClientContext?.clientName || activeClientContext?.name || '';
    const targetCaseNumber = activeCaseContext?.caseNumber || '';

    // 1. Register Case — Create a new legal matter
    if (can('cases.create')) {
      actions.push({
        key: 'quick-case',
        label: t('quickAdd.caseTitle', 'Register Case'),
        desc: targetClientName
          ? `${t('quickAdd.caseDesc', 'Create a new legal matter')} (${targetClientName})`
          : t('quickAdd.caseDesc', 'Create a new legal matter'),
        icon: Briefcase,
        onClick: () => {
          if (targetClientId) {
            openCaseForm({
              defaultClientId: targetClientId,
              lockClientId: true,
            });
          } else {
            openCaseForm();
          }
        },
      });
    }

    // 2. Register Client — Add a chamber client
    if (can('clients.edit')) {
      actions.push({
        key: 'quick-client',
        label: t('quickAdd.clientTitle', 'Register Client'),
        desc: t('quickAdd.clientDesc', 'Add a chamber client'),
        icon: Users,
        onClick: () => openClientForm(),
      });
    }

    // 3. New Appointment — Consultation or meeting
    if (can('appointments.manage')) {
      actions.push({
        key: 'quick-appointment',
        label: t('quickAdd.appointmentTitle', 'New Appointment'),
        desc: t('quickAdd.appointmentDesc', 'Consultation or meeting'),
        icon: Clock,
        onClick: () => {
          if (targetCaseId) {
            openAppointmentForm({
              defaultCaseId: targetCaseId,
              defaultClientId: activeCaseContext?.clientId,
            });
          } else if (targetClientId) {
            openAppointmentForm({
              defaultClientId: targetClientId,
              lockClientId: true,
            });
          } else {
            openAppointmentForm();
          }
        },
      });
    }

    // 4. Schedule Hearing — Add a court hearing
    if (can('hearings.update')) {
      actions.push({
        key: 'quick-hearing',
        label: t('quickAdd.hearingTitle', 'Schedule Hearing'),
        desc: targetCaseNumber
          ? `${t('quickAdd.hearingDesc', 'Add a court hearing')} (${targetCaseNumber})`
          : route.screen === 'calendar' && selectedCalendarDate
          ? `${t('quickAdd.hearingDesc', 'Add a court hearing')} (${selectedCalendarDate})`
          : t('quickAdd.hearingDesc', 'Add a court hearing'),
        icon: Gavel,
        onClick: () => {
          if (targetCaseId) {
            openHearingForm({
              defaultCaseId: targetCaseId,
              lockCaseId: true,
            });
          } else if (route.screen === 'calendar' && selectedCalendarDate) {
            openHearingForm({
              defaultDate: selectedCalendarDate,
            });
          } else {
            openHearingForm();
          }
        },
      });
    }

    // 5. New Task — Create an action item
    if (can('tasks.assign')) {
      actions.push({
        key: 'quick-task',
        label: t('quickAdd.taskTitle', 'New Task'),
        desc: targetCaseNumber
          ? `${t('quickAdd.taskDesc', 'Create an action item')} (${targetCaseNumber})`
          : targetClientName
          ? `${t('quickAdd.taskDesc', 'Create an action item')} (${targetClientName})`
          : route.screen === 'calendar' && selectedCalendarDate
          ? `${t('quickAdd.taskDesc', 'Create an action item')} (${selectedCalendarDate})`
          : t('quickAdd.taskDesc', 'Create an action item'),
        icon: CheckSquare,
        onClick: () => {
          if (targetCaseId) {
            openTaskForm({
              defaultCaseId: targetCaseId,
              defaultClientId: activeCaseContext?.clientId,
              lockCaseAndClient: true,
            });
          } else if (targetClientId) {
            openTaskForm({
              defaultClientId: targetClientId,
              lockClientOnly: true,
            });
          } else if (route.screen === 'calendar' && selectedCalendarDate) {
            openTaskForm({
              defaultDueDate: selectedCalendarDate,
            });
          } else {
            openTaskForm();
          }
        },
      });
    }

    // 6. Register Physical File — Track a physical case file
    if (can('files.manage')) {
      actions.push({
        key: 'quick-file',
        label: t('quickAdd.fileTitle', 'Register Physical File'),
        desc: targetCaseNumber
          ? `${t('quickAdd.fileDesc', 'Track a physical case file')} (${targetCaseNumber})`
          : targetClientName
          ? `${t('quickAdd.fileDesc', 'Track a physical case file')} (${targetClientName})`
          : t('quickAdd.fileDesc', 'Track a physical case file'),
        icon: FolderArchive,
        onClick: () => {
          if (targetCaseId) {
            openFileForm({
              defaultCaseId: targetCaseId,
              defaultClientId: activeCaseContext?.clientId,
              lockCaseAndClient: true,
            });
          } else if (targetClientId) {
            openFileForm({
              defaultClientId: targetClientId,
              lockClientOnly: true,
            });
          } else {
            openFileForm();
          }
        },
      });
    }

    return actions;
  };

  const quickActions = getQuickActions();

  const handleContextPlusClick = () => {
    if (isReadOnly || quickActions.length === 0) return;
    setQuickAddOpen((prev) => !prev);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col w-full overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs pt-safe">
        <div className={`${SHELL_CONTAINER_CLASS} h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3`}>
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

            <div
              onClick={() => navigateToScreen('dashboard')}
              className="flex items-center gap-2 sm:gap-2.5 min-w-0 cursor-pointer"
            >
              <Logo size="sm" showText={false} />
              <div className="min-w-0">
                <h1
                  className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-tight truncate max-w-[110px] sm:max-w-[200px] md:max-w-xs"
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
            {/* Quick Add Action Button */}
            {isReadOnly ? (
              <button
                type="button"
                disabled
                title={t('subscription.readOnlyBannerTitle')}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 h-11 rounded-xl text-xs font-bold bg-rose-50 text-rose-500 border border-rose-200 cursor-not-allowed opacity-80 shrink-0 min-w-[44px]"
                data-testid="context-plus-button"
              >
                <Lock className="w-4 h-4" />
                <span className="hidden lg:inline">{t('common.readOnlyMode')}</span>
              </button>
            ) : quickActions.length > 0 ? (
              <div className="relative" ref={quickAddRef}>
                <button
                  type="button"
                  onClick={handleContextPlusClick}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 h-11 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition shrink-0 min-w-[44px]"
                  title={t('quickAdd.title', 'Quick Add')}
                  aria-label={t('quickAdd.title', 'Quick Add')}
                  aria-expanded={quickAddOpen}
                  aria-haspopup="true"
                  data-testid="context-plus-button"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span className="hidden lg:inline">
                    {t('quickAdd.title', 'Quick Add')}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 hidden sm:inline transition-transform duration-200 ${quickAddOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu expanding downward under button (up to down) */}
                {quickAddOpen && (
                  <>
                    {/* Mobile backdrop for dismiss */}
                    <div
                      className="sm:hidden fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-2xs"
                      onClick={() => setQuickAddOpen(false)}
                      aria-hidden="true"
                    />

                    <div
                      className="fixed sm:absolute top-14 sm:top-auto right-3 sm:right-0 mt-0 sm:mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 max-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 origin-top-right"
                      data-testid="context-plus-menu"
                    >
                      <div className="px-3.5 py-2 border-b border-slate-100 shrink-0 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-900">{t('quickAdd.title', 'Quick Add')}</div>
                          <div className="text-[11px] text-slate-500">{t('quickAdd.subtitle', 'Select an action to create')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickAddOpen(false)}
                          className="sm:hidden w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          aria-label={t('common.close', 'Close')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="py-1 overflow-y-auto overscroll-contain flex-1">
                        {quickActions.map((act) => {
                          const ActIcon = act.icon;
                          return (
                            <button
                              key={act.key}
                              type="button"
                              onClick={() => {
                                setQuickAddOpen(false);
                                act.onClick();
                              }}
                              className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[48px] text-left hover:bg-indigo-50/80 active:bg-indigo-100 transition group cursor-pointer"
                            >
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition">
                                <ActIcon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-indigo-700 truncate">
                                  {act.label}
                                </div>
                                {act.desc && (
                                  <div className="text-[11px] text-slate-500 truncate">{act.desc}</div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}

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
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-11 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 text-slate-700 active:bg-slate-200 transition shrink-0 min-w-[44px]"
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
              className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 h-11 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-left transition shadow-2xs group shrink-0 active:bg-slate-50"
              aria-label="Switch User Profile"
              title={`${currentUser.name} (${currentUser.email})`}
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

      {/* Trial Active Banner (hidden for paid chambers) */}
      {currentFirm?.isTrial && !subscription.isReadOnly && (
        <div className="bg-indigo-600 border-b border-indigo-700 text-white py-1.5 shadow-xs">
          <div className={`${SHELL_CONTAINER_CLASS} flex items-center justify-between text-xs font-medium`}>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-700/80 text-indigo-100 shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </span>
              <span>
                {t('subscription.trialBanner', {
                  defaultValue: `Trial: ${trialDaysLeft} days left`,
                  days: i18n.language === 'bn' ? toBnDigits(trialDaysLeft) : trialDaysLeft,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Mode Banner (Past Grace Period / Trial Ended) */}
      {subscription.isReadOnly && (
        <div className="bg-rose-900 border-b border-rose-950 text-white py-2.5 shadow-sm">
          <div className={`${SHELL_CONTAINER_CLASS} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5`}>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-rose-800 text-rose-200 shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <div className="leading-snug">
                <span className="text-xs sm:text-sm font-bold tracking-tight block sm:inline mr-2 text-white">
                  {currentFirm?.isTrial
                    ? t('subscription.trialEndedTitle')
                    : t('subscription.readOnlyBannerTitle')}
                </span>
                <span className="text-xs text-rose-200">
                  {currentFirm?.isTrial
                    ? t('subscription.trialEndedDesc')
                    : `${t('subscription.readOnlyBannerDesc')} (${t('subscription.validUntil', { date: subscription.formattedExpiry })})`}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {Boolean(supportEmail) && (
                <a
                  href={`mailto:${supportEmail}?subject=Chamber%20License%20Renewal`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-900 rounded-xl text-xs font-bold shrink-0 transition shadow-2xs cursor-pointer min-h-[44px]"
                >
                  <Mail className="w-4 h-4" />
                  <span>{supportEmail}</span>
                </a>
              )}
              {Boolean(supportWhatsapp) && (
                <a
                  href={`https://wa.me/${supportWhatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shrink-0 transition shadow-2xs cursor-pointer min-h-[44px]"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp ({supportWhatsapp})</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grace Period Banner */}
      {subscription.inGracePeriod && !currentFirm?.isTrial && (
        <div className="bg-rose-600 border-b border-rose-700 text-white py-2.5 shadow-sm">
          <div className={`${SHELL_CONTAINER_CLASS} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5`}>
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
      {subscription.isExpiringSoon && !subscription.isReadOnly && !currentFirm?.isTrial && (
        <div className="bg-amber-600 border-b border-amber-700 text-white py-2 shadow-xs">
          <div className={`${SHELL_CONTAINER_CLASS} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2`}>
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
      <div className={getContentWrapperClass()}>
        {/* Tablet / Desktop Sidebar (>=md) */}
        <aside
          className={`hidden md:flex flex-col shrink-0 transition-all duration-200 ${
            sidebarCollapsed ? 'w-16' : 'w-56 lg:w-60'
          }`}
        >
          <nav className="space-y-3 flex-1 overflow-y-auto pr-0.5">
            {navSections.map((sec, sIdx) => {
              const visibleItems = sec.items.filter((i) => !i.hide);
              if (visibleItems.length === 0) return null;

              return (
                <div key={sec.titleKey || sIdx} className="space-y-1">
                  {!sidebarCollapsed && (
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-0.5 truncate">
                      {t(sec.titleKey, sec.defaultTitle)}
                    </div>
                  )}

                  {visibleItems.map((item) => {
                    const isActive = currentTab === item.id;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        title={item.label}
                        className={`w-full relative flex items-center ${
                          sidebarCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
                        } rounded-xl text-xs sm:text-sm font-semibold transition min-h-[38px] cursor-pointer ${
                          isActive
                            ? item.highlight
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-900 text-white shadow-xs'
                            : item.highlight
                            ? 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/80'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`flex items-center gap-2.5 ${sidebarCollapsed ? 'justify-center' : 'min-w-0 truncate'}`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </div>

                        {!sidebarCollapsed && item.highlight && !isActive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {sidebarCollapsed && item.highlight && !isActive && (
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
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
                    <Logo size="sm" showText={false} />
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {currentFirm?.name || t('app.title')}
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

                {/* Nav items grouped by section */}
                <nav className="mt-3 space-y-3 overflow-y-auto flex-1 overscroll-contain pr-1">
                  {navSections.map((sec, sIdx) => {
                    const visibleItems = sec.items.filter((i) => !i.hide);
                    if (visibleItems.length === 0) return null;

                    return (
                      <div key={sec.titleKey || sIdx} className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-0.5 truncate">
                          {t(sec.titleKey, sec.defaultTitle)}
                        </div>
                        {visibleItems.map((item) => {
                          const isActive = currentTab === item.id;
                          const Icon = item.icon;

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                handleSelectNav(item.id);
                                setMobileMenuOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition min-h-[44px] ${
                                isActive
                                  ? item.highlight
                                    ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                                    : 'bg-slate-900 text-white font-semibold shadow-xs'
                                  : item.highlight
                                  ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                  : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 truncate">
                                <Icon className="w-5 h-5 shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </nav>
              </div>

              {/* Install App on Phone Banner */}
              <InstallAppPrompt />
            </div>
          </div>
        )}

        {/* Content Area (with bottom padding on phone to clear fixed bottom navigation) */}
        <main className="flex-1 min-w-0 w-full pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Phone Bottom Navigation Bar (<md: Dashboard, Cases, Calendar, Tasks, More) */}
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
                onClick={() => handleSelectNav(item.id)}
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

          {/* 5th item: More */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[48px] rounded-lg transition-colors ${
              isMoreTabActive || mobileMenuOpen
                ? 'text-indigo-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            aria-label={t('hub.moreNav', 'More')}
          >
            <div className="relative">
              <MoreHorizontal
                className={`w-5 h-5 ${
                  isMoreTabActive || mobileMenuOpen ? 'stroke-[2.5px]' : 'stroke-[1.75px]'
                }`}
              />
              {isMoreTabActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo-600" />
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full px-1">
              {t('hub.moreNav', 'More')}
            </span>
          </button>
        </div>
      </nav>

      {/* Switch User Modal */}
      {userModalOpen && (
        <React.Suspense fallback={null}>
          <UserSwitchModal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} />
        </React.Suspense>
      )}

      {/* Global Search Modal */}
      {searchModalOpen && (
        <React.Suspense fallback={null}>
          <GlobalSearchModal
            isOpen={searchModalOpen}
            onClose={() => setSearchModalOpen(false)}
            onNavigate={(tab, id) => handleSelectNav(tab as ActiveTab, id)}
          />
        </React.Suspense>
      )}
    </div>
  );
};
