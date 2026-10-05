import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { Shield, ShieldAlert, Check, LogOut } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { currentUser, usersList, switchUser, logout } = useAuth();

  if (!isOpen) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
  };

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
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm transition min-h-[44px]"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('auth.signOut', { defaultValue: 'Sign Out' })}</span>
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition min-h-[44px]"
          >
            {t('common.cancel', { defaultValue: 'Close' })}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
          {t('auth.selectProfile', { defaultValue: 'Select Active Chamber User' })}
        </span>

        <div className="space-y-3">
          {usersList.map((user) => {
            const isSelected = user.id === currentUser.id;
            const isOwner = user.role === 'Owner';

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
                      isOwner
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
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
                      {user.email} &bull; {user.role === 'Owner' ? '17 permissions' : `${user.permissions.length} permissions`}
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
