import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { ALL_PERMISSIONS, PermissionKey } from '../../permissions';
import { FirmRecord, UserRecord } from '../../data/types';
import {
  isLawyerOrOwner,
  JobType,
  ROLE_PRESETS,
  VALID_JOB_TYPES,
  VisibilityMode,
} from '../../rolePresets';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  Building2,
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
  Mail,
  UserPlus,
  Edit2,
  UserX,
  UserCheck,
  GitBranch,
  Shield,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
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

  // Firm Form states
  const [firmName, setFirmName] = useState('');
  const [barReg, setBarReg] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [courtAffiliations, setCourtAffiliations] = useState('');
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>('open');

  // Staff View mode: tree vs list
  const [staffViewMode, setStaffViewMode] = useState<'tree' | 'list'>('tree');

  // Add / Edit Staff Modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffJobType, setStaffJobType] = useState<JobType>('lawyer_junior');
  const [staffTitleLabel, setStaffTitleLabel] = useState('');
  const [staffReportsTo, setStaffReportsTo] = useState<string>('');
  const [staffPreset, setStaffPreset] = useState<string>('juniorLawyer');
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [userSubmitting, setUserSubmitting] = useState(false);

  // Deactivate Modal state
  const [deactivateTarget, setDeactivateTarget] = useState<UserRecord | null>(null);
  const [reassignToUserId, setReassignToUserId] = useState<string>('');
  const [deactivating, setDeactivating] = useState(false);

  // Reassign Team (Temporary Cover) state
  const [coverFromLawyerId, setCoverFromLawyerId] = useState<string>('');
  const [coverToLawyerId, setCoverToLawyerId] = useState<string>('');
  const [reassigningTeam, setReassigningTeam] = useState(false);

  // Reset Password states
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [temporaryPasswordResult, setTemporaryPasswordResult] = useState<{
    password: string;
    userName: string;
    email: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const canManageSettings = can('settings.manage');
  const canManageUsers = currentUser.role === 'Owner' || can('users.manage');

  const handleConfirmResetPassword = async () => {
    if (!resetTarget || !firm) return;
    setResettingPassword(true);
    setErrorMsg(null);
    try {
      const res = await repos.user.resetPassword(
        { currentUser },
        resetTarget.id
      );
      const targetName = resetTarget.name;
      const targetEmail = resetTarget.email;
      setResetTarget(null);
      setTemporaryPasswordResult({
        password: res.temporaryPassword,
        userName: targetName,
        email: targetEmail,
      });
      setSuccessMsg(t('settings.resetPasswordSuccess'));
    } catch (err: any) {
      setErrorMsg(err?.message || t('settings.resetPasswordError'));
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyTemporaryPassword = async () => {
    if (!temporaryPasswordResult?.password) return;
    try {
      await navigator.clipboard.writeText(temporaryPasswordResult.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      // Fallback
    }
  };

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
      setVisibilityMode((firmData.visibilityMode as VisibilityMode) || 'open');
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
      const updatedFirm = await repos.firm.updateFirm(
        { currentUser },
        {
          name: firmName,
          barCouncilReg: barReg,
          officeAddress,
          courtAffiliations,
          visibilityMode,
        }
      );
      setFirm(updatedFirm);
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

  const handleApplyPresetToExistingUser = async (targetUser: UserRecord, presetKey: string) => {
    if (!canManageUsers || isReadOnly) return;
    const preset = ROLE_PRESETS[presetKey];
    if (!preset) return;

    setErrorMsg(null);
    try {
      await repos.user.update({ currentUser }, targetUser.id, {
        jobType: preset.jobType,
      });
      if (targetUser.role !== 'Owner' && targetUser.id !== currentUser.id) {
        await repos.user.updatePermissions(
          { currentUser },
          targetUser.id,
          preset.permissions as PermissionKey[]
        );
      }
      await loadData();
      await refreshState();
      setSuccessMsg(t('settings.saveSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const openAddStaffModal = () => {
    setEditingUser(null);
    setStaffName('');
    setStaffEmail('');
    setStaffPreset('juniorLawyer');
    setStaffJobType('lawyer_junior');
    setStaffTitleLabel('');
    const defaultSup = users.find((u) => u.role === 'Owner' && (u.status ?? 'active') === 'active');
    setStaffReportsTo(defaultSup ? defaultSup.id : '');
    setCreatedTempPassword(null);
    setErrorMsg(null);
    setUserModalOpen(true);
  };

  const openEditStaffModal = (u: UserRecord) => {
    setEditingUser(u);
    setStaffName(u.name);
    setStaffEmail(u.email);
    setStaffJobType((u.jobType as JobType) || (u.role === 'Owner' ? 'lawyer_senior' : 'other'));
    setStaffTitleLabel(u.jobTitleLabel || '');
    setStaffReportsTo(u.reportsToUserId || '');
    setStaffPreset('');
    setCreatedTempPassword(null);
    setErrorMsg(null);
    setUserModalOpen(true);
  };

  const handleSaveStaffModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers || isReadOnly) return;
    setUserSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingUser) {
        await repos.user.update({ currentUser }, editingUser.id, {
          name: staffName.trim(),
          email: staffEmail.trim(),
          jobType: staffJobType,
          jobTitleLabel: staffTitleLabel.trim() || null,
          reportsToUserId: staffReportsTo || null,
        });
        if (staffPreset && ROLE_PRESETS[staffPreset] && editingUser.role !== 'Owner' && editingUser.id !== currentUser.id) {
          await repos.user.updatePermissions(
            { currentUser },
            editingUser.id,
            ROLE_PRESETS[staffPreset].permissions as PermissionKey[]
          );
        }
        setUserModalOpen(false);
        await loadData();
        await refreshState();
        setSuccessMsg(t('settings.saveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        const res = await repos.user.create({ currentUser }, {
          name: staffName.trim(),
          email: staffEmail.trim(),
          jobType: staffJobType,
          jobTitleLabel: staffTitleLabel.trim() || null,
          reportsToUserId: staffReportsTo || null,
          preset: staffPreset || undefined,
        });
        setCreatedTempPassword(res.temporaryPassword || 'Temp#Pass123!');
        await loadData();
        await refreshState();
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleToggleRole = async (u: UserRecord) => {
    if (!canManageUsers || isReadOnly) return;
    setErrorMsg(null);
    const nextRole = u.role === 'Owner' ? 'Staff' : 'Owner';
    try {
      await repos.user.updateRole({ currentUser }, u.id, nextRole);
      await loadData();
      await refreshState();
      setSuccessMsg(t('settings.saveSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget || !canManageUsers || isReadOnly) return;
    setDeactivating(true);
    setErrorMsg(null);
    try {
      const res = await repos.user.deactivate(
        { currentUser },
        deactivateTarget.id,
        reassignToUserId || undefined
      );
      setDeactivateTarget(null);
      setReassignToUserId('');
      await loadData();
      await refreshState();
      const warnSuffix =
        res.warnings && res.warnings.length > 0 ? ` (${res.warnings.join(' ')})` : '';
      setSuccessMsg(`${t('settings.saveSuccess')}${warnSuffix}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (u: UserRecord) => {
    if (!canManageUsers || isReadOnly) return;
    setErrorMsg(null);
    try {
      await repos.user.reactivate({ currentUser }, u.id);
      await loadData();
      await refreshState();
      setSuccessMsg(t('settings.saveSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const handleReassignTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers || isReadOnly || !coverFromLawyerId || !coverToLawyerId) return;
    setReassigningTeam(true);
    setErrorMsg(null);
    try {
      await repos.user.reassignTeam({ currentUser }, coverFromLawyerId, coverToLawyerId);
      setCoverFromLawyerId('');
      setCoverToLawyerId('');
      await loadData();
      await refreshState();
      setSuccessMsg(t('settings.teamReassignedSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setReassigningTeam(false);
    }
  };

  const activeSupervisors = users.filter(
    (u) => (u.status ?? 'active') === 'active' && isLawyerOrOwner(u)
  );

  // Build Hierarchy Tree nodes
  const rootUsers = users.filter(
    (u) => !u.reportsToUserId || !users.some((parent) => parent.id === u.reportsToUserId)
  );

  const renderTreeBranch = (parent: UserRecord, depth = 0): React.ReactNode => {
    const children = users.filter((u) => u.reportsToUserId === parent.id);
    const isDeactivated = parent.status === 'deactivated';
    const jobKey = `settings.jobType_${parent.jobType || (parent.role === 'Owner' ? 'lawyer_senior' : 'other')}`;

    return (
      <div key={parent.id} className={depth > 0 ? 'ml-4 sm:ml-8 pl-3 sm:pl-4 border-l-2 border-indigo-200 mt-2.5' : 'mt-3'}>
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            isDeactivated
              ? 'bg-slate-100 border-slate-200 opacity-60'
              : parent.role === 'Owner'
              ? 'bg-purple-50/40 border-purple-200'
              : isLawyerOrOwner(parent)
              ? 'bg-indigo-50/40 border-indigo-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
              {parent.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-slate-900 truncate">{parent.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    parent.role === 'Owner'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {parent.role}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-200 text-slate-800">
                  {t(jobKey)}
                </span>
                {parent.jobTitleLabel && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    {parent.jobTitleLabel}
                  </span>
                )}
                {isDeactivated && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                    {t('settings.deactivatedBadge')}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 font-mono block truncate">{parent.email}</span>
            </div>
          </div>

          {canManageUsers && !isReadOnly && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => openEditStaffModal(parent)}
                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {t('common.edit')}
              </button>
              {parent.id !== currentUser.id && !isDeactivated && (
                <button
                  type="button"
                  onClick={() => setResetTarget(parent)}
                  className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                  title={t('settings.resetPassword')}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {t('settings.resetPassword')}
                </button>
              )}
              {parent.id !== currentUser.id && (
                isDeactivated ? (
                  <button
                    type="button"
                    onClick={() => handleReactivate(parent)}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {t('settings.reactivateStaff')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDeactivateTarget(parent);
                      setReassignToUserId('');
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    {t('settings.deactivateStaff')}
                  </button>
                )
              )}
            </div>
          )}
        </div>
        {children.length > 0 && (
          <div className="space-y-2">
            {children.map((child) => renderTreeBranch(child, depth + 1))}
          </div>
        )}
      </div>
    );
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
        {/* Chamber Profile & Visibility Mode */}
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
                rows={2}
                disabled={!canManageSettings}
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 disabled:opacity-75 rounded-xl min-h-[64px] px-3.5 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
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

            {/* Visibility Mode Setting */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-900">
                {t('settings.visibilityModeTitle')}
              </label>
              <select
                disabled={!canManageSettings}
                value={visibilityMode}
                onChange={(e) => setVisibilityMode(e.target.value as VisibilityMode)}
                className="w-full bg-white border border-slate-300 disabled:opacity-75 rounded-xl min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              >
                <option value="open">{t('settings.visibilityModeOpen')}</option>
                <option value="team">{t('settings.visibilityModeTeam')}</option>
              </select>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {t('settings.visibilityModeExplanation')}
              </p>
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

      {/* Temporary Team Reassignment (Cover) Card for Owners / Managers */}
      {canManageUsers && !isReadOnly && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-600" />
              {t('settings.reassignTeamTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('settings.reassignTeamSubtitle')}</p>
          </div>

          <form onSubmit={handleReassignTeam} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.fromLawyer')}
              </label>
              <select
                required
                value={coverFromLawyerId}
                onChange={(e) => setCoverFromLawyerId(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
              >
                <option value="">--</option>
                {activeSupervisors.map((lw) => (
                  <option key={lw.id} value={lw.id}>
                    {lw.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('settings.toLawyer')}
              </label>
              <select
                required
                value={coverToLawyerId}
                onChange={(e) => setCoverToLawyerId(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
              >
                <option value="">--</option>
                {activeSupervisors
                  .filter((lw) => lw.id !== coverFromLawyerId)
                  .map((lw) => (
                    <option key={lw.id} value={lw.id}>
                      {lw.name}
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!coverFromLawyerId || !coverToLawyerId || reassigningTeam}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('settings.confirmReassignTeam')}
            </button>
          </form>
        </div>
      )}

      {/* Staff Hierarchy Tree & Roster Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-600" />
              {t('settings.staffManagement')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Role permissions and reporting hierarchy are enforced in both UI and data repositories.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setStaffViewMode('tree')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1 ${
                  staffViewMode === 'tree'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                {t('settings.viewTree')}
              </button>
              <button
                type="button"
                onClick={() => setStaffViewMode('list')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1 ${
                  staffViewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                {t('settings.viewList')}
              </button>
            </div>

            {canManageUsers && !isReadOnly ? (
              <button
                type="button"
                onClick={openAddStaffModal}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {t('settings.addStaff')}
              </button>
            ) : (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium">
                Only Owner can modify permissions
              </span>
            )}
          </div>
        </div>

        {/* Hierarchy Tree View (Owner > Lawyer > Team) */}
        {staffViewMode === 'tree' && (
          <div className="space-y-3 pb-4 border-b border-slate-100">
            {rootUsers.map((rootUser) => renderTreeBranch(rootUser, 0))}
          </div>
        )}

        {/* Detailed Staff Cards & Permission Checklists */}
        <div className="space-y-6">
          {users.map((user) => {
            const isDeactivated = user.status === 'deactivated';
            const supervisor = user.reportsToUserId
              ? users.find((u) => u.id === user.reportsToUserId)
              : null;
            const jobKey = `settings.jobType_${user.jobType || (user.role === 'Owner' ? 'lawyer_senior' : 'other')}`;

            return (
              <div
                key={user.id}
                className={`border border-slate-200 rounded-xl p-4 ${
                  isDeactivated ? 'bg-slate-100/70 opacity-70' : 'bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm shrink-0">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {user.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-semibold shrink-0 ${
                            user.role === 'Owner'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {user.role}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-slate-200 text-slate-800">
                          {t(jobKey)}
                        </span>
                        {user.jobTitleLabel && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            {user.jobTitleLabel}
                          </span>
                        )}
                        {isDeactivated && (
                          <span className="text-xs px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                            {t('settings.deactivatedBadge')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="font-mono truncate">{user.email}</span>
                        <span>
                          &bull; {t('settings.reportsToLabel')}:{' '}
                          <strong>{supervisor ? supervisor.name : t('settings.noSupervisor')}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {canManageUsers && !isReadOnly && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {user.role !== 'Owner' && user.id !== currentUser.id && (
                        <select
                          aria-label={t('settings.rolePresetLabel')}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleApplyPresetToExistingUser(user, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="min-h-[36px] bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="">{t('settings.rolePresetLabel')}...</option>
                          <option value="seniorLawyer">{t('settings.presetSeniorLawyer')}</option>
                          <option value="juniorLawyer">{t('settings.presetJuniorLawyer')}</option>
                          <option value="clerk">{t('settings.presetClerk')}</option>
                          <option value="receptionist">{t('settings.presetReceptionist')}</option>
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditStaffModal(user)}
                        className="min-h-[36px] px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
                      >
                        {t('common.edit')}
                      </button>
                      {user.id !== currentUser.id && !isDeactivated && (
                        <button
                          type="button"
                          onClick={() => setResetTarget(user)}
                          className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                          title={t('settings.resetPassword')}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {t('settings.resetPassword')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleRole(user)}
                        className="min-h-[36px] px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                      >
                        {user.role === 'Owner'
                          ? t('settings.demoteToStaff')
                          : t('settings.promoteToOwner')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Permissions Checklist */}
                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
                    {t('settings.permissionsList')} (
                    {user.role === 'Owner'
                      ? 'Unrestricted (All Granted)'
                      : `${user.permissions.length} Granted`}
                    ):
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {ALL_PERMISSIONS.map((perm) => {
                      const isOwner = user.role === 'Owner';
                      const isSelf = user.id === currentUser.id;
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
                          } ${
                            !isOwner && !isSelf && canManageUsers && !isReadOnly
                              ? 'cursor-pointer hover:bg-slate-100'
                              : 'cursor-default'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isOwner || isSelf || !canManageUsers || isReadOnly}
                            checked={hasPerm}
                            onChange={() => handleToggleStaffPermission(user.id, perm)}
                            className="mt-0.5 rounded text-slate-900 focus:ring-slate-500 w-4 h-4 shrink-0 disabled:opacity-50"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium block leading-tight break-words">
                              {label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {perm}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Staff ResponsiveModal */}
      <ResponsiveModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? t('settings.editStaff') : t('settings.addStaff')}
        icon={Users}
        maxWidth="lg"
        footer={
          createdTempPassword ? (
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl"
            >
              {t('common.confirm')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="staff-user-form"
                disabled={userSubmitting}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {userSubmitting ? t('common.loading') : t('common.save')}
              </button>
            </>
          )
        }
      >
        {createdTempPassword ? (
          <div className="space-y-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
            <div className="font-bold text-sm flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-600" />
              {t('settings.tempPasswordLabel')}
            </div>
            <div className="p-3 bg-white rounded-lg border border-emerald-300 font-mono text-base font-bold text-slate-900 select-all">
              {createdTempPassword}
            </div>
            <p className="text-emerald-800">{t('settings.tempPasswordNotice')}</p>
          </div>
        ) : (
          <form id="staff-user-form" onSubmit={handleSaveStaffModal} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('common.name')} *
              </label>
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('common.email')} *
              </label>
              <input
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('settings.rolePresetLabel')}
                </label>
                <select
                  value={staffPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStaffPreset(val);
                    if (val && ROLE_PRESETS[val]) {
                      setStaffJobType(ROLE_PRESETS[val].jobType);
                    }
                  }}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">--</option>
                  <option value="seniorLawyer">{t('settings.presetSeniorLawyer')}</option>
                  <option value="juniorLawyer">{t('settings.presetJuniorLawyer')}</option>
                  <option value="clerk">{t('settings.presetClerk')}</option>
                  <option value="receptionist">{t('settings.presetReceptionist')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('settings.jobTypeLabel')} *
                </label>
                <select
                  value={staffJobType}
                  onChange={(e) => setStaffJobType(e.target.value as JobType)}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                >
                  {VALID_JOB_TYPES.map((jt) => (
                    <option key={jt} value={jt}>
                      {t(`settings.jobType_${jt}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('settings.jobTitleCustom')}
                </label>
                <input
                  type="text"
                  value={staffTitleLabel}
                  onChange={(e) => setStaffTitleLabel(e.target.value)}
                  placeholder="e.g. High Court Clerk"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('settings.reportsToLabel')}
                </label>
                <select
                  value={staffReportsTo}
                  onChange={(e) => setStaffReportsTo(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">{t('settings.noSupervisor')}</option>
                  {activeSupervisors
                    .filter((sup) => !editingUser || sup.id !== editingUser.id)
                    .map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} ({sup.role})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </form>
        )}
      </ResponsiveModal>

      {/* Deactivate Staff ResponsiveModal */}
      <ResponsiveModal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        title={t('settings.deactivateModalTitle')}
        icon={UserX}
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeactivateTarget(null)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={deactivating}
              onClick={handleConfirmDeactivate}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50"
            >
              {deactivating ? t('common.loading') : t('settings.deactivateStaff')}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p className="leading-relaxed">{t('settings.deactivateWarningText')}</p>
          {deactivateTarget && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900">
              {deactivateTarget.name} ({deactivateTarget.email})
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.reassignOpenWorkTo')}
            </label>
            <select
              value={reassignToUserId}
              onChange={(e) => setReassignToUserId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
            >
              <option value="">{t('common.none')}</option>
              {activeSupervisors
                .filter((u) => u.id !== deactivateTarget?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </ResponsiveModal>

      {/* Reset Password Confirmation Modal */}
      <ResponsiveModal
        isOpen={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={t('settings.resetPasswordConfirmTitle')}
        icon={KeyRound}
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={resettingPassword}
              onClick={handleConfirmResetPassword}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl disabled:opacity-50"
            >
              {resettingPassword ? t('common.loading') : t('settings.resetPassword')}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p className="leading-relaxed">
            {resetTarget &&
              t('settings.resetPasswordConfirmMessage', {
                name: resetTarget.name,
                email: resetTarget.email,
              })}
          </p>
          {resetTarget && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl font-semibold text-amber-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {resetTarget.name} ({resetTarget.email})
              </span>
            </div>
          )}
        </div>
      </ResponsiveModal>

      {/* One-Time Temporary Password Display Modal */}
      <ResponsiveModal
        isOpen={Boolean(temporaryPasswordResult)}
        onClose={() => {
          setTemporaryPasswordResult(null);
          setCopiedPassword(false);
        }}
        title={t('settings.temporaryPasswordTitle')}
        icon={KeyRound}
        maxWidth="md"
        footer={
          <button
            type="button"
            onClick={() => {
              setTemporaryPasswordResult(null);
              setCopiedPassword(false);
            }}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
          >
            {t('common.done', { defaultValue: 'Done' })}
          </button>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{t('settings.temporaryPasswordTitle')}</span>
            </div>
            <p className="leading-relaxed text-[11px] text-amber-900">
              {t('settings.temporaryPasswordWarning')}
            </p>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1">
              {temporaryPasswordResult?.userName} ({temporaryPasswordResult?.email})
            </span>
            <div className="flex items-center gap-2 p-3 bg-slate-100 border border-slate-300 rounded-xl">
              <span className="font-mono text-sm font-bold text-slate-900 select-all flex-1 tracking-wider break-all">
                {temporaryPasswordResult?.password}
              </span>
              <button
                type="button"
                onClick={handleCopyTemporaryPassword}
                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-lg shadow-2xs transition shrink-0"
              >
                {copiedPassword ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{t('settings.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('settings.copyPassword')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
};
