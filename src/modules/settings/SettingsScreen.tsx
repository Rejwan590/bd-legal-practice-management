import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { ALL_PERMISSIONS, PermissionKey } from '../../permissions';
import { FirmRecord, UserRecord } from '../../data/types';
import {
  Building2,
  ShieldCheck,
  CreditCard,
  Users,
  Globe,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Lock,
  Database,
  ArrowRight,
  Clock,
  Mail,
} from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, refreshState, subscription, isReadOnly } = useAuth();
  const repos = getRepositories();

  const [firm, setFirm] = useState<FirmRecord | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [firmName, setFirmName] = useState('');
  const [barReg, setBarReg] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [courtAffiliations, setCourtAffiliations] = useState('');

  const canManageSettings = can('settings.manage');
  const canManageUsers = can('users.manage');
  const isRestMode = import.meta.env.VITE_DATA_SOURCE === 'rest';

  const loadData = async () => {
    setLoading(true);
    try {
      const securityCtx = { currentUser };
      const [firmData, usersData] = await Promise.all([
        repos.firm.getFirm(securityCtx),
        repos.user.list(securityCtx),
      ]);
      setFirm(firmData);
      setFirmName(firmData.name);
      setBarReg(firmData.barCouncilReg);
      setOfficeAddress(firmData.officeAddress);
      setCourtAffiliations(firmData.courtAffiliations);
      setUsers(usersData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleSaveFirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings) return;

    if (isReadOnly) {
      setErrorMsg(t('subscription.readOnlyBlockedAction'));
      return;
    }

    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await repos.firm.updateFirm(
        { currentUser },
        {
          name: firmName,
          barCouncilReg: barReg,
          officeAddress,
          courtAffiliations,
        }
      );
      setSuccessMsg(t('settings.saveSuccess'));
      await refreshState();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStaffPermission = async (targetUserId: string, perm: PermissionKey) => {
    if (!canManageUsers) return;
    if (isReadOnly) {
      setErrorMsg(t('subscription.readOnlyBlockedAction'));
      return;
    }

    const target = users.find((u) => u.id === targetUserId);
    if (!target) return;

    const exists = target.permissions.includes(perm);
    const updated = exists
      ? target.permissions.filter((p) => p !== perm)
      : [...target.permissions, perm];

    try {
      await repos.user.updatePermissions({ currentUser }, targetUserId, updated);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, permissions: updated } : u))
      );
      await refreshState();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      }
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-slate-700 shrink-0" />
          <span>{t('settings.title')}</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('settings.subtitle')}</p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chamber Profile */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-600" />
              {t('settings.firmProfile')}
            </h2>
            {!canManageSettings && (
              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium">
                <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyStaff')}
              </span>
            )}
          </div>

          <form onSubmit={handleSaveFirm} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.firmName')}
              </label>
              <input
                type="text"
                disabled={!canManageSettings}
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 disabled:opacity-75 rounded-xl min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.barCouncilReg')}
              </label>
              <input
                type="text"
                disabled={!canManageSettings}
                value={barReg}
                onChange={(e) => setBarReg(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 disabled:opacity-75 rounded-xl min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.officeAddress')}
              </label>
              <textarea
                rows={3}
                disabled={!canManageSettings}
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 disabled:opacity-75 rounded-xl min-h-[80px] px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.courtAffiliations')}
              </label>
              <input
                type="text"
                disabled={!canManageSettings}
                value={courtAffiliations}
                onChange={(e) => setCourtAffiliations(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 disabled:opacity-75 rounded-xl min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            {canManageSettings && (
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
                >
                  <Save className="w-4 h-4" />
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Subscription & Language Column */}
        <div className="space-y-6">
          {/* Subscription */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                {t('settings.subscription')}
              </h2>
              {canManageSettings && (
                <a
                  href="mailto:support@firm.bd?subject=License%20Renewal%20Request"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold border border-indigo-200 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Contact us to renew
                </a>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">{t('settings.plan')}</span>
                  <span className="font-semibold text-slate-900">{t('settings.planType')}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">{t('settings.status')}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                      subscription.isReadOnly
                        ? 'bg-rose-100 text-rose-800'
                        : subscription.inGracePeriod
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : subscription.isExpiringSoon
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {subscription.isReadOnly
                      ? t('subscription.statusExpired')
                      : subscription.inGracePeriod
                      ? t('subscription.statusGrace', {
                          defaultValue: `Grace Period (${subscription.graceDaysRemaining}d left)`,
                          days: subscription.graceDaysRemaining,
                        })
                      : subscription.isExpiringSoon
                      ? t('subscription.statusExpiringSoon')
                      : t('subscription.statusActive')}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">{t('settings.validUntil')}</span>
                  <span className="font-mono font-medium text-slate-800">
                    {firm?.licenseExpiresAt ? new Date(firm.licenseExpiresAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Remaining</span>
                  <span
                    className={`font-semibold text-xs ${
                      subscription.isReadOnly
                        ? 'text-rose-600'
                        : subscription.inGracePeriod
                        ? 'text-rose-600 font-bold'
                        : subscription.isExpiringSoon
                        ? 'text-amber-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {subscription.isReadOnly
                      ? '0 days (Expired)'
                      : subscription.inGracePeriod
                      ? `${subscription.graceDaysRemaining} days grace left`
                      : `${subscription.daysRemaining} days`}
                  </span>
                </div>
              </div>

              {subscription.inGracePeriod ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    License Expired &mdash; Grace Period Active
                  </span>
                  <p>
                    Chamber license expired on {subscription.formattedExpiry}. Full features remain active during this 5-day grace period ({subscription.graceDaysRemaining} days left). Renew now before read-only mode applies.
                  </p>
                </div>
              ) : subscription.isReadOnly ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    {t('subscription.readOnlyBadge')} Active
                  </span>
                  <p>{t('subscription.readOnlyNotice')}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {t('settings.readOnlyNotice')}
                </p>
              )}
            </div>
          </div>

          {/* Language Preference */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Globe className="w-5 h-5 text-slate-600" />
              {t('settings.languagePref')}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => i18n.changeLanguage('en')}
                className={`flex-1 min-h-[44px] py-2.5 px-4 text-sm rounded-xl font-medium border transition flex items-center justify-center ${
                  i18n.language === 'en'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => i18n.changeLanguage('bn')}
                className={`flex-1 min-h-[44px] py-2.5 px-4 text-sm rounded-xl font-medium border transition flex items-center justify-center ${
                  i18n.language === 'bn'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Backup & Disaster Recovery Quick Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Database className="w-5 h-5 text-indigo-600" />
              Chamber Backup & Recovery
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Export password-encrypted JSON snapshots with SHA-256 integrity verification or restore historical snapshots.
            </p>
            <a
              href="#backup"
              className="min-h-[44px] py-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
            >
              Open Backup & Restore Console <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Staff Roster & Permissions Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-600" />
              {t('settings.staffManagement')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Role permissions are verified both in UI actions and data repository writes.
            </p>
          </div>
          {!canManageUsers && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium self-start sm:self-auto">
              Only Owner can modify permissions
            </span>
          )}
        </div>

        <div className="space-y-6">
          {users.map((user) => (
            <div key={user.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm shrink-0">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 truncate">{user.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 ${
                          user.role === 'Owner'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono block truncate">{user.email}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-mono break-all sm:break-normal">
                  User ID: {user.id}
                </div>
              </div>

              {/* Permissions Checklist */}
              <div className="mt-3">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
                  {t('settings.permissionsList')} ({user.role === 'Owner' ? 'Unrestricted (All Granted)' : `${user.permissions.length} Granted`}):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ALL_PERMISSIONS.map((perm) => {
                    const isOwner = user.role === 'Owner';
                    const hasPerm = isOwner || user.permissions.includes(perm);
                    const permKey = perm.replace('.', '_');
                    const label = t(`permissions.${permKey}`, perm);

                    return (
                      <label
                        key={perm}
                        className={`flex items-start gap-2.5 min-h-[44px] p-2.5 rounded-xl text-xs transition border ${
                          hasPerm
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-500 opacity-60'
                        } ${!isOwner && canManageUsers && !isReadOnly ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={isOwner || !canManageUsers || isReadOnly}
                          checked={hasPerm}
                          onChange={() => handleToggleStaffPermission(user.id, perm)}
                          className="mt-0.5 rounded text-slate-900 focus:ring-slate-500 w-4 h-4 shrink-0 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block leading-tight break-words">{label}</span>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{perm}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
