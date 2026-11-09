import React, { useState, useEffect } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { Firm, Plan, BillingCycle } from '../types/adminTypes';
import { calculatePricing } from '../utils/pricing';
import { formatLicenseDate } from '../utils/dateUtils';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Lock,
  PlusCircle,
  Settings2,
  Sparkles,
} from 'lucide-react';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  firm: Firm;
  onSuccess: () => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  firm,
  onSuccess,
}) => {
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(firm.planId || 'chamber');
  const [maxUsers, setMaxUsers] = useState<number>(firm.maxUsers || 10);
  const [maxDevices, setMaxDevices] = useState<number>(firm.maxDevices || 5);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(firm.billingCycle || 'monthly');
  const [expiryDate, setExpiryDate] = useState<string>(
    firm.licenseExpiresAt ? firm.licenseExpiresAt.split('T')[0] : ''
  );

  // Custom pricing overrides (null means use plan default)
  const [customBasePrice, setCustomBasePrice] = useState<string>(
    firm.customBasePriceBdt !== null && firm.customBasePriceBdt !== undefined
      ? String(firm.customBasePriceBdt)
      : ''
  );
  const [customAnnualPrice, setCustomAnnualPrice] = useState<string>(
    firm.customAnnualPriceBdt !== null && firm.customAnnualPriceBdt !== undefined
      ? String(firm.customAnnualPriceBdt)
      : ''
  );
  const [customExtraUserPrice, setCustomExtraUserPrice] = useState<string>(
    firm.customExtraUserPriceBdt !== null && firm.customExtraUserPriceBdt !== undefined
      ? String(firm.customExtraUserPriceBdt)
      : ''
  );
  const [customExtraDevicePrice, setCustomExtraDevicePrice] = useState<string>(
    firm.customExtraDevicePriceBdt !== null && firm.customExtraDevicePriceBdt !== undefined
      ? String(firm.customExtraDevicePriceBdt)
      : ''
  );
  const [priceLockedUntil, setPriceLockedUntil] = useState<string>(
    firm.priceLockedUntil ? firm.priceLockedUntil.split('T')[0] : ''
  );
  const [pricingNote, setPricingNote] = useState<string>(firm.pricingNote || '');

  // Trial management state
  const [activeTab, setActiveTab] = useState<'standard' | 'extend-trial' | 'convert-paid'>('standard');
  const [extendDaysInput, setExtendDaysInput] = useState<string>(() => {
    try {
      return localStorage.getItem('bd_admin_last_extend_trial_days') || '';
    } catch {
      return '';
    }
  });
  const [extendLoading, setExtendLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [trialSuccessMsg, setTrialSuccessMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan defaults editor
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const [planDefaultUsers, setPlanDefaultUsers] = useState<number>(10);
  const [planDefaultDevices, setPlanDefaultDevices] = useState<number>(5);
  const [planDefaultExtraUserPrice, setPlanDefaultExtraUserPrice] = useState<number>(100);
  const [planDefaultExtraDevicePrice, setPlanDefaultExtraDevicePrice] = useState<number>(100);
  const [planSaving, setPlanSaving] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listPlans()
      .then((res) => {
        setAvailablePlans(res.plans);
        const current = res.plans.find((p) => p.id === selectedPlanId);
        if (current) {
          setPlanDefaultUsers(current.includedUsers ?? current.seats ?? 10);
          setPlanDefaultDevices(current.includedDevices ?? 5);
          setPlanDefaultExtraUserPrice(current.extraUserPriceBdt ?? 100);
          setPlanDefaultExtraDevicePrice(current.extraDevicePriceBdt ?? 100);
        }
      })
      .catch(() => {});
  }, []);

  const activePlan = availablePlans.find((p) => p.id === selectedPlanId) || firm.plan || {
    id: selectedPlanId,
    name: selectedPlanId,
    priceBdt: 1299,
    seats: 5,
    includedUsers: 5,
    includedDevices: 5,
    extraUserPriceBdt: 100,
    extraDevicePriceBdt: 100,
    durationMonths: 12,
    features: [],
  };

  const handlePlanChange = (newPlanId: string) => {
    setSelectedPlanId(newPlanId);
    const newPlan = availablePlans.find((p) => p.id === newPlanId);
    if (newPlan) {
      setPlanDefaultUsers(newPlan.includedUsers ?? newPlan.seats ?? 10);
      setPlanDefaultDevices(newPlan.includedDevices ?? 5);
      setPlanDefaultExtraUserPrice(newPlan.extraUserPriceBdt ?? 100);
      setPlanDefaultExtraDevicePrice(newPlan.extraDevicePriceBdt ?? 100);
    }
  };

  // Helper to parse integer taka or null
  const parseCustomPrice = (val: string): number | null => {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? null : Math.max(0, num);
  };

  const parsedCustomBase = parseCustomPrice(customBasePrice);
  const parsedCustomAnnual = parseCustomPrice(customAnnualPrice);
  const parsedCustomExtraUser = parseCustomPrice(customExtraUserPrice);
  const parsedCustomExtraDevice = parseCustomPrice(customExtraDevicePrice);

  // Live breakdown calculation
  const pricing = calculatePricing(activePlan, {
    billingCycle,
    customBasePriceBdt: parsedCustomBase,
    customAnnualPriceBdt: parsedCustomAnnual,
    customExtraUserPriceBdt: parsedCustomExtraUser,
    customExtraDevicePriceBdt: parsedCustomExtraDevice,
    maxUsers,
    maxDevices,
  });

  // Check if price lock is in the future
  const isPriceLocked = firm.priceLockedUntil
    ? new Date(firm.priceLockedUntil).getTime() > Date.now()
    : false;

  const isPricingModified =
    selectedPlanId !== firm.planId ||
    parsedCustomBase !== (firm.customBasePriceBdt ?? null) ||
    parsedCustomAnnual !== (firm.customAnnualPriceBdt ?? null) ||
    parsedCustomExtraUser !== (firm.customExtraUserPriceBdt ?? null) ||
    parsedCustomExtraDevice !== (firm.customExtraDevicePriceBdt ?? null);

  const showLockWarning = isPriceLocked && isPricingModified;

  // Extend trial logic
  const parsedExtendDays = parseInt(extendDaysInput.trim(), 10);
  const isValidExtendDays =
    extendDaysInput.trim() !== '' &&
    !isNaN(parsedExtendDays) &&
    parsedExtendDays >= 1 &&
    parsedExtendDays <= 365 &&
    String(parsedExtendDays) === extendDaysInput.trim();

  const getProjectedExtendExpiry = (): Date => {
    const now = new Date();
    const currentExpiry = new Date(firm.licenseExpiresAt);
    const baseDate = currentExpiry <= now ? now : currentExpiry;
    const dStr = baseDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + (isValidExtendDays ? parsedExtendDays : 0), 17, 59, 59, 999));
  };

  const getProjectedPaidExpiry = (): Date => {
    const now = new Date();
    const months = billingCycle === 'annual' ? (activePlan.durationMonths || 12) : 1;
    return new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
  };

  const handleExtendTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidExtendDays) return;

    setError(null);
    setExtendLoading(true);
    setTrialSuccessMsg(null);

    try {
      localStorage.setItem('bd_admin_last_extend_trial_days', String(parsedExtendDays));
    } catch {
      // safe fallback
    }

    try {
      await adminApi.extendTrial(firm.id, parsedExtendDays);
      setTrialSuccessMsg(`Trial successfully extended by ${parsedExtendDays} days.`);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to extend trial period.');
    } finally {
      setExtendLoading(false);
    }
  };

  const handleConvertToPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConvertLoading(true);
    setTrialSuccessMsg(null);

    try {
      await adminApi.convertToPaid(firm.id, {
        planId: selectedPlanId,
        billingCycle,
        expiryDate: expiryDate ? `${expiryDate}T23:59:59.000Z` : undefined,
      });
      setTrialSuccessMsg('Chamber converted to paid subscription successfully.');
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to convert trial to paid.');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.updateLicense(firm.id, {
        planId: selectedPlanId,
        billingCycle,
        customBasePriceBdt: parsedCustomBase,
        customAnnualPriceBdt: parsedCustomAnnual,
        customExtraUserPriceBdt: parsedCustomExtraUser,
        customExtraDevicePriceBdt: parsedCustomExtraDevice,
        priceLockedUntil: priceLockedUntil ? `${priceLockedUntil}T23:59:59.000Z` : null,
        pricingNote: pricingNote.trim() || null,
        maxUsers,
        maxDevices,
        expiryDate: expiryDate ? `${expiryDate}T23:59:59.000Z` : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update license parameters.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlanDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlan) return;
    setPlanSaving(true);
    setPlanSuccessMsg(null);
    setError(null);

    try {
      const res = await adminApi.updatePlan(activePlan.id, {
        includedUsers: planDefaultUsers,
        includedDevices: planDefaultDevices,
        extraUserPriceBdt: planDefaultExtraUserPrice,
        extraDevicePriceBdt: planDefaultExtraDevicePrice,
      });
      setAvailablePlans((prev) =>
        prev.map((p) => (p.id === res.plan.id ? res.plan : p))
      );
      setPlanSuccessMsg(`Plan '${res.plan.name}' defaults updated.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update plan defaults.');
    } finally {
      setPlanSaving(false);
    }
  };

  const breakdownTitle = firm.isTrial
    ? 'Pricing Breakdown (After Trial)'
    : billingCycle === 'annual'
    ? parsedCustomAnnual !== null
      ? '12-month price (custom annual rate)'
      : '12-month price (10 months charged)'
    : 'Monthly price';

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={`Adjust License: ${firm.name}`} maxWidth="xl">
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {trialSuccessMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{trialSuccessMsg}</span>
          </div>
        )}

        {/* Trial Management Banner & Tab Switcher */}
        {firm.isTrial && (
          <div className="p-4 bg-purple-950/30 border border-purple-800/40 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-300 font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Active Free Trial — {firm.trialDays || 0} days granted</span>
              </div>
              <div className="text-xs text-purple-300 font-mono">
                Expires: {formatLicenseDate(firm.licenseExpiresAt)}
              </div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-purple-800/30">
              <button
                type="button"
                onClick={() => setActiveTab('extend-trial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[38px] transition-all flex items-center gap-1.5 ${
                  activeTab === 'extend-trial'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-900/50 text-purple-200 hover:bg-purple-900'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Extend Trial
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('convert-paid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[38px] transition-all flex items-center gap-1.5 ${
                  activeTab === 'convert-paid'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-950 text-indigo-300 hover:bg-indigo-900/50 border border-indigo-800/40'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Convert to Paid
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('standard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[38px] transition-all ${
                  activeTab === 'standard'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                License Details & Limits
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Extend Trial Form */}
        {firm.isTrial && activeTab === 'extend-trial' && (
          <form onSubmit={handleExtendTrial} className="p-4 bg-slate-900 border border-purple-800/40 rounded-xl space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-purple-400" />
              Extend Trial Period
            </h4>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Days to Extend * (1–365)</label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={extendDaysInput}
                onChange={(e) => setExtendDaysInput(e.target.value)}
                placeholder="Enter number of days"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400 min-h-[44px]"
              />
              <p className="text-[11px] text-slate-400">
                Added to current expiry (or from today if expired) until 23:59 Asia/Dhaka.
              </p>
            </div>

            {isValidExtendDays && (
              <div className="p-3 bg-purple-900/20 border border-purple-800/40 rounded-lg text-xs space-y-1">
                <div className="text-slate-300">
                  Current expiry: <span className="font-mono text-white">{formatLicenseDate(firm.licenseExpiresAt)}</span>
                </div>
                <div className="text-purple-300 font-semibold">
                  Projected new expiry: <span className="font-mono text-purple-200 font-bold">{formatLicenseDate(getProjectedExtendExpiry())}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('standard')}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs min-h-[44px]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={extendLoading || !isValidExtendDays}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs min-h-[44px] transition-colors disabled:opacity-40"
              >
                {extendLoading ? 'Extending...' : 'Confirm & Extend Trial'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Convert to Paid Form */}
        {firm.isTrial && activeTab === 'convert-paid' && (
          <form onSubmit={handleConvertToPaid} className="p-4 bg-slate-900 border border-indigo-800/40 rounded-xl space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              Convert Chamber to Paid Subscription
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Target Plan *</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                >
                  {availablePlans.filter((p) => p.status !== 'archived').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (BDT {p.priceBdt}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Billing Cycle *</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`py-1.5 px-2 rounded text-xs font-medium min-h-[36px] transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`py-1.5 px-2 rounded text-xs font-medium min-h-[36px] transition-all ${
                      billingCycle === 'annual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Annual (Pay 10 mo)
                  </button>
                </div>
              </div>
            </div>

            {/* Confirmation Box */}
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-lg text-xs space-y-1.5">
              <div className="font-semibold text-indigo-200">Confirmation Summary:</div>
              <div className="flex justify-between text-slate-300">
                <span>Selected Plan:</span>
                <span className="font-mono text-white">{activePlan.name}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Billing Term:</span>
                <span className="font-mono text-white capitalize">{billingCycle}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Projected New Expiry:</span>
                <span className="font-mono text-emerald-400 font-bold">{formatLicenseDate(getProjectedPaidExpiry())}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-indigo-800/40 font-bold text-white">
                <span>Term Price:</span>
                <span className="font-mono text-indigo-300">
                  BDT {pricing.termTotal.toLocaleString()} {pricing.unit}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('standard')}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs min-h-[44px]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={convertLoading}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs min-h-[44px] transition-colors disabled:opacity-40"
              >
                {convertLoading ? 'Converting...' : 'Confirm & Convert to Paid'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3 / Main Standard License Parameters Form */}
        {(!firm.isTrial || activeTab === 'standard') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Price Lock Warning Banner */}
            {showLockWarning && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-200">Price Lock Notice</div>
                  <div>
                    This firm has a locked pricing agreement valid until{' '}
                    <span className="font-mono font-bold text-white">
                      {formatLicenseDate(firm.priceLockedUntil)}
                    </span>
                    . Changing the plan or prices now will override the agreed rate.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Plan Selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                >
                  {availablePlans.filter((p) => p.status !== 'archived').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (BDT {p.priceBdt}/mo)
                    </option>
                  ))}
                </select>
              </div>

              {/* Billing Cycle */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Billing Cycle</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`py-1.5 px-3 rounded text-xs font-medium min-h-[36px] transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`py-1.5 px-3 rounded text-xs font-medium min-h-[36px] transition-all ${
                      billingCycle === 'annual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Annual (Pay 10 mo)
                  </button>
                </div>
              </div>
            </div>

            {/* Seat & Device Allocations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-slate-300">Max Users (Seats)</label>
                  <span className="text-[11px] text-slate-500">Plan default: {activePlan.includedUsers ?? activePlan.seats}</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-slate-300">Max Devices</label>
                  <span className="text-[11px] text-slate-500">Plan default: {activePlan.includedDevices ?? 5}</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={maxDevices}
                  onChange={(e) => setMaxDevices(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                />
              </div>
            </div>

            {/* Custom Pricing Overrides */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Custom Price Overrides (Leave empty to use plan defaults)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-300">
                    Custom Monthly Base Price (BDT)
                    <span className="text-slate-500 text-[10px] ml-1">(Plan: BDT {activePlan.priceBdt})</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder={`Plan default (${activePlan.priceBdt})`}
                    value={customBasePrice}
                    onChange={(e) => setCustomBasePrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300">
                    Custom Annual Rate (BDT)
                    <span className="text-slate-500 text-[10px] ml-1">(Plan: 10× monthly)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Plan default (10× monthly)"
                    value={customAnnualPrice}
                    onChange={(e) => setCustomAnnualPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300">
                    Custom Extra User Rate (BDT / user)
                    <span className="text-slate-500 text-[10px] ml-1">(Plan: BDT {activePlan.extraUserPriceBdt ?? 100})</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder={`Plan default (${activePlan.extraUserPriceBdt ?? 100})`}
                    value={customExtraUserPrice}
                    onChange={(e) => setCustomExtraUserPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300">
                    Custom Extra Device Rate (BDT / device)
                    <span className="text-slate-500 text-[10px] ml-1">(Plan: BDT {activePlan.extraDevicePriceBdt ?? 100})</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder={`Plan default (${activePlan.extraDevicePriceBdt ?? 100})`}
                    value={customExtraDevicePrice}
                    onChange={(e) => setCustomExtraDevicePrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                <div className="space-y-1">
                  <label className="text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    Price Locked Until
                  </label>
                  <input
                    type="date"
                    value={priceLockedUntil}
                    onChange={(e) => setPriceLockedUntil(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    License Expiry Date
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs pt-1">
                <label className="text-slate-300">Internal Pricing Note (Admin Only)</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={pricingNote}
                  onChange={(e) => setPricingNote(e.target.value)}
                  placeholder="e.g. Special promotional rate approved by management..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 min-h-[44px]"
                />
              </div>
            </div>

            {/* LIVE BREAKDOWN CARD BEFORE SAVING */}
            <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-800/30 pb-2">
                <div className="text-xs font-semibold text-indigo-300">
                  {breakdownTitle}
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-white">
                    BDT {pricing.termTotal.toLocaleString()}
                  </span>
                  <span className="text-xs text-indigo-300 ml-1 font-mono">
                    {pricing.unit}
                  </span>
                </div>
              </div>

              {firm.isTrial && (
                <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                  Chamber is currently on a free trial (BDT 0 charged). The breakdown below reflects the price when converted to paid plan.
                </div>
              )}

              <div className="text-xs space-y-1.5 text-slate-300 font-mono">
                <div className="flex justify-between items-center">
                  <span>
                    Base price:
                    {pricing.customBasePriceBdt !== null ? (
                      <span className="text-amber-400 text-[11px] ml-1">(Custom Override)</span>
                    ) : (
                      <span className="text-slate-500 text-[11px] ml-1">(Plan: BDT {pricing.planBasePriceBdt})</span>
                    )}
                  </span>
                  <span className="font-semibold text-white">
                    BDT {pricing.effectiveBasePriceBdt.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span>
                    Extra users ({pricing.extraUsersCount} × BDT {pricing.effectiveExtraUserPriceBdt}):
                    {pricing.customExtraUserPriceBdt !== null ? (
                      <span className="text-amber-400 text-[11px] ml-1">(Custom)</span>
                    ) : (
                      <span className="text-slate-500 text-[11px] ml-1">(Plan: BDT {pricing.planExtraUserPriceBdt})</span>
                    )}
                  </span>
                  <span className="font-semibold text-white">
                    BDT {pricing.extraUsersCostBdt.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span>
                    Extra devices ({pricing.extraDevicesCount} × BDT {pricing.effectiveExtraDevicePriceBdt}):
                    {pricing.customExtraDevicePriceBdt !== null ? (
                      <span className="text-amber-400 text-[11px] ml-1">(Custom)</span>
                    ) : (
                      <span className="text-slate-500 text-[11px] ml-1">(Plan: BDT {pricing.planExtraDevicePriceBdt})</span>
                    )}
                  </span>
                  <span className="font-semibold text-white">
                    BDT {pricing.extraDevicesCostBdt.toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between font-medium">
                  <span className="text-slate-300">Monthly Subtotal:</span>
                  <span className="font-mono text-slate-100">BDT {pricing.monthlyTotal.toLocaleString()} / mo</span>
                </div>

                {billingCycle === 'annual' && (
                  <div className="flex justify-between font-semibold text-indigo-300">
                    <span>Annual Term Total:</span>
                    <span className="font-mono">
                      {pricing.customAnnualPriceBdt !== null ? (
                        <span>BDT {pricing.annualTotal.toLocaleString()} (Custom Override)</span>
                      ) : (
                        <span>BDT {pricing.annualTotal.toLocaleString()} (Pay 10 mo = Get 12 mo)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700/50 min-h-[44px] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium min-h-[44px] transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save License'}
              </button>
            </div>
          </form>
        )}

        {/* Platform Admin Plan Configuration Editor */}
        {activePlan && (
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setIsPlanEditorOpen(!isPlanEditorOpen)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 py-1"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                Configure Global Defaults for Plan ({activePlan.name})
              </span>
              {isPlanEditorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isPlanEditorOpen && (
              <form onSubmit={handleUpdatePlanDefaults} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                {planSuccessMsg && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{planSuccessMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-300">Default Included Users</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={planDefaultUsers}
                      onChange={(e) => setPlanDefaultUsers(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300">Default Included Devices</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={planDefaultDevices}
                      onChange={(e) => setPlanDefaultDevices(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300">Extra User Price (BDT / mo)</label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      required
                      value={planDefaultExtraUserPrice}
                      onChange={(e) => setPlanDefaultExtraUserPrice(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300">Extra Device Price (BDT / mo)</label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      required
                      value={planDefaultExtraDevicePrice}
                      onChange={(e) => setPlanDefaultExtraDevicePrice(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={planSaving}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-white min-h-[44px] transition-colors disabled:opacity-50"
                  >
                    {planSaving ? 'Updating...' : 'Update Plan Defaults'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
};
