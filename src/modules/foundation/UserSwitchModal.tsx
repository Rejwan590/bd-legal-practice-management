import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import {
  User,
  Shield,
  ShieldAlert,
  Check,
  LogOut,
  KeyRound,
  Globe,
  Briefcase,
  Mail,
  Loader2,
} from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { getApiBaseUrl } from '../../data/repositories/rest/restCommon';

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isRestMode =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_DATA_SOURCE === 'rest';

const isDemoLoginEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_ENABLE_DEMO_LOGIN === 'true';

// Show demo switcher only in Mock mode when VITE_ENABLE_DEMO_LOGIN is explicitly true
const showDemoSwitcher = !isRestMode && isDemoLoginEnabled;

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { currentUser, usersList, switchUser, logout } = useAuth();

  // Password change state for REST profile view
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  if (!isOpen) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword) {
      setPasswordError(t('auth.passwordLengthError', { defaultValue: 'Please fill out all password fields.' }));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t('auth.passwordLengthError', { defaultValue: 'New password must be at least 8 characters long.' }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordMismatch', { defaultValue: 'New passwords do not match.' }));
      return;
    }

    setPasswordLoading(true);
    try {
      if (isRestMode) {
        const changeUrl = getApiBaseUrl().replace('/api/v1', '') + '/auth/change-password';
        const res = await fetch(changeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPasswordError(data.message || data.error || 'Failed to update password');
          return;
        }
      }
      setPasswordSuccess(t('auth.passwordChangedSuccess', { defaultValue: 'Password changed successfully.' }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess('');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during password update';
      setPasswordError(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  // If in REST mode (or demo login disabled in mock mode), render ONLY the "My Profile" panel
  if (!showDemoSwitcher) {
    const isOwner = currentUser.role === 'Owner';
    const permissionCount = currentUser.permissions ? currentUser.permissions.length : 0;
    const userInitials = (currentUser.name || 'User').slice(0, 2).toUpperCase();

    return (
      <ResponsiveModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('auth.myProfile', { defaultValue: 'My Profile' })}
        subtitle={t('auth.profileSubtitle', { defaultValue: 'Account details and active session information' })}
        icon={User}
        maxWidth="md"
        footer={
          <div className="w-full flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
            <button
              onClick={handleLogout}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm transition min-h-[44px] cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.signOut', { defaultValue: 'Sign Out' })}</span>
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition min-h-[44px] cursor-pointer"
            >
              {t('common.cancel', { defaultValue: 'Close' })}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* User Profile Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${
                isOwner ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base text-slate-900 truncate">{currentUser.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                    isOwner ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{currentUser.email}</span>
              </p>
            </div>
          </div>

          {/* Profile Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('auth.jobTitle', { defaultValue: 'Job Title / Designation' })}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs font-medium text-slate-800 truncate">
                  {currentUser.jobTitleLabel || (isOwner ? 'Senior Advocate & Head of Chamber' : 'Associate Advocate')}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('auth.language', { defaultValue: 'Interface Language' })}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs font-medium text-slate-800">
                  {currentUser.language === 'bn' ? 'বাংলা (Bangla)' : 'English'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 bg-white sm:col-span-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('auth.permissionsAssigned', { defaultValue: 'Permissions Assigned' })}
              </span>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800">
                    {t('auth.permissionCount', {
                      count: permissionCount,
                      defaultValue: `${permissionCount} permissions`,
                    })}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {isOwner ? 'Full Chamber Authority' : 'Role-Scoped Access'}
                </span>
              </div>
            </div>
          </div>

          {/* Password Change Action & Form */}
          <div className="pt-2">
            {!showPasswordForm ? (
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition min-h-[44px] cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-slate-500" />
                <span>{t('auth.changePassword', { defaultValue: 'Change Password' })}</span>
              </button>
            ) : (
              <form onSubmit={handlePasswordChange} className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-indigo-600" />
                    {t('auth.changePassword', { defaultValue: 'Change Password' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                </div>

                {passwordError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                    {passwordSuccess}
                  </div>
                )}

                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder={t('auth.currentPassword', { defaultValue: 'Current Password' })}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                  />
                  <input
                    type="password"
                    placeholder={t('auth.newPassword', { defaultValue: 'New Password (min 8 chars)' })}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                  />
                  <input
                    type="password"
                    placeholder={t('auth.confirmNewPassword', { defaultValue: 'Confirm New Password' })}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition min-h-[40px] disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{t('auth.changePassword', { defaultValue: 'Update Password' })}</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </ResponsiveModal>
    );
  }

  // Mock mode switcher (public demo only behind VITE_ENABLE_DEMO_LOGIN === 'true')
  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('auth.mockLoginTitle', { defaultValue: 'User Profile & Session' })}
      subtitle={t('auth.mockLoginSubtitle', { defaultValue: 'Manage your active session or switch user profile' })}
      icon={Shield}
      maxWidth="md"
      footer={
        <div className="w-full flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <button
            onClick={handleLogout}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm transition min-h-[44px] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('auth.signOut', { defaultValue: 'Sign Out' })}</span>
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition min-h-[44px] cursor-pointer"
          >
            {t('common.cancel', { defaultValue: 'Close' })}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
            {t('auth.selectProfile', { defaultValue: 'Select Active Chamber User' })}
          </span>
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
            {t('auth.demoModeSampleData', { defaultValue: 'Demo mode - sample data' })}
          </span>
        </div>

        <div className="space-y-3">
          {usersList.map((user) => {
            const isSelected = user.id === currentUser.id;
            const isOwner = user.role === 'Owner';
            const realPermCount = user.permissions ? user.permissions.length : 0;

            return (
              <div
                key={user.id}
                onClick={async () => {
                  await switchUser(user.id);
                  onClose();
                }}
                className={`p-3.5 sm:p-4 rounded-xl border-2 transition cursor-pointer flex items-center justify-between gap-3 min-h-[56px] active:scale-[0.99] ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center sm:items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      isOwner ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate">{user.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                          isOwner ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-normal line-clamp-1 sm:line-clamp-none">
                      {isOwner ? t('auth.ownerDesc') : t('auth.staffDesc')}
                    </p>
                    <span className="text-[11px] text-slate-400 font-mono block mt-0.5 truncate">
                      {user.email} &bull; {realPermCount} permissions
                    </span>
                  </div>
                </div>

                {isSelected ? (
                  <span className="text-indigo-600 shrink-0 p-1">
                    <Check className="w-5 h-5" />
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shrink-0">
                    Select
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800 leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{t('auth.permissionNotice')}</span>
        </div>
      </div>
    </ResponsiveModal>
  );
};
