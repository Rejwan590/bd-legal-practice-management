import React, { useState, useEffect } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { Firm, Plan } from '../types/adminTypes';
import { calculateMonthlyPriceBdt } from '../utils/pricing';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';

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
  const [maxUsers, setMaxUsers] = useState(firm.maxUsers || 10);
  const [maxDevices, setMaxDevices] = useState(firm.maxDevices || 5);
  const [expiryDate, setExpiryDate] = useState(
    firm.licenseExpiresAt ? firm.licenseExpiresAt.split('T')[0] : ''
  );
  const [plan, setPlan] = useState<Plan | null>(firm.plan || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan editing section
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const [includedUsers, setIncludedUsers] = useState(plan?.includedUsers ?? plan?.seats ?? 10);
  const [includedDevices, setIncludedDevices] = useState(plan?.includedDevices ?? 5);
  const [extraUserPriceBdt, setExtraUserPriceBdt] = useState(plan?.extraUserPriceBdt ?? 100);
  const [extraDevicePriceBdt, setExtraDevicePriceBdt] = useState(plan?.extraDevicePriceBdt ?? 100);
  const [planSaving, setPlanSaving] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState<string | null>(null);

  // Load plan details if not provided on firm
  useEffect(() => {
    if (!plan && firm.planId) {
      adminApi.listPlans().then((res) => {
        const found = res.plans.find((p) => p.id === firm.planId);
        if (found) {
          setPlan(found);
          setIncludedUsers(found.includedUsers ?? found.seats ?? 10);
          setIncludedDevices(found.includedDevices ?? 5);
          setExtraUserPriceBdt(found.extraUserPriceBdt ?? 100);
          setExtraDevicePriceBdt(found.extraDevicePriceBdt ?? 100);
        }
      }).catch(() => {});
    } else if (plan) {
      setIncludedUsers(plan.includedUsers ?? plan.seats ?? 10);
      setIncludedDevices(plan.includedDevices ?? 5);
      setExtraUserPriceBdt(plan.extraUserPriceBdt ?? 100);
      setExtraDevicePriceBdt(plan.extraDevicePriceBdt ?? 100);
    }
  }, [firm.planId, plan]);

  // Pricing calculation based on active inputs and plan
  const effectivePlan = plan
    ? {
        ...plan,
        includedUsers,
        includedDevices,
        extraUserPriceBdt,
        extraDevicePriceBdt,
      }
    : {
        id: 'standard',
        name: 'Standard',
        priceBdt: 50000,
        includedUsers: 10,
        includedDevices: 5,
        extraUserPriceBdt: 100,
        extraDevicePriceBdt: 100,
      };

  const pricing = calculateMonthlyPriceBdt(effectivePlan, { maxUsers, maxDevices });

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    setPlanSaving(true);
    setPlanSuccessMsg(null);
    setError(null);

    try {
      const res = await adminApi.updatePlan(plan.id, {
        includedUsers,
        includedDevices,
        extraUserPriceBdt,
        extraDevicePriceBdt,
      });
      setPlan(res.plan);
      setPlanSuccessMsg('Plan defaults updated successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to update plan defaults.');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.updateLicense(firm.id, {
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

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={`Adjust License: ${firm.name}`} maxWidth="lg">
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* License Limits & Expiry Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Max Allowed Users (Seats)</label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={maxUsers}
                onChange={(e) => setMaxUsers(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Max Allowed Devices</label>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={maxDevices}
                onChange={(e) => setMaxDevices(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">License Expiry Date (YYYY-MM-DD)</label>
            <input
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            />
          </div>

          {/* Computed Pricing Card */}
          <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Monthly Pricing Breakdown
              </span>
              <span className="text-base font-bold text-indigo-400 font-mono">
                BDT {pricing.monthlyPriceBdt.toLocaleString()}
                <span className="text-xs font-normal text-slate-400"> / mo</span>
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Base Plan ({effectivePlan.name || 'Standard'}):</span>
                <span className="font-mono text-slate-200">BDT {pricing.basePriceBdt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">
                  Extra Users ({pricing.extraUsersCount} over {pricing.includedUsers} incl. × BDT {pricing.extraUserPriceBdt}):
                </span>
                <span className="font-mono text-slate-200">BDT {pricing.extraUsersCostBdt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">
                  Extra Devices ({pricing.extraDevicesCount} over {pricing.includedDevices} incl. × BDT {pricing.extraDevicePriceBdt}):
                </span>
                <span className="font-mono text-slate-200">BDT {pricing.extraDevicesCostBdt.toLocaleString()}</span>
              </div>
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

        {/* Platform Admin Plan Configuration Editor */}
        {plan && (
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setIsPlanEditorOpen(!isPlanEditorOpen)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 py-1"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                Configure Plan Pricing Defaults ({plan.name})
              </span>
              {isPlanEditorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isPlanEditorOpen && (
              <form onSubmit={handleUpdatePlan} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                {planSuccessMsg && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{planSuccessMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-300">Included Users</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={includedUsers}
                      onChange={(e) => setIncludedUsers(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300">Included Devices</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={includedDevices}
                      onChange={(e) => setIncludedDevices(parseInt(e.target.value) || 1)}
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
                      value={extraUserPriceBdt}
                      onChange={(e) => setExtraUserPriceBdt(parseInt(e.target.value) || 0)}
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
                      value={extraDevicePriceBdt}
                      onChange={(e) => setExtraDevicePriceBdt(parseInt(e.target.value) || 0)}
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
