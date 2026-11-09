import React, { useState, useEffect } from 'react';
import { Plan } from '../types/adminTypes';
import { adminApi } from '../api/adminApi';
import { ResponsiveModal } from '../components/ResponsiveModal';
import {
  Layers,
  Plus,
  Edit2,
  Archive,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Users,
  Smartphone,
  Calendar,
} from 'lucide-react';

export const PlansScreen: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Form fields
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [priceBdt, setPriceBdt] = useState<number>(1299);
  const [includedUsers, setIncludedUsers] = useState<number>(5);
  const [includedDevices, setIncludedDevices] = useState<number>(5);
  const [extraUserPriceBdt, setExtraUserPriceBdt] = useState<number>(100);
  const [extraDevicePriceBdt, setExtraDevicePriceBdt] = useState<number>(100);
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listPlans();
      setPlans(res.plans);
    } catch (err: any) {
      setError(err?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setPlanId('');
    setName('');
    setPriceBdt(1299);
    setIncludedUsers(5);
    setIncludedDevices(5);
    setExtraUserPriceBdt(100);
    setExtraDevicePriceBdt(100);
    setDurationMonths(12);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Plan) => {
    setEditingPlan(p);
    setPlanId(p.id);
    setName(p.name);
    setPriceBdt(p.priceBdt);
    setIncludedUsers(p.includedUsers ?? p.seats ?? 5);
    setIncludedDevices(p.includedDevices ?? 5);
    setExtraUserPriceBdt(p.extraUserPriceBdt ?? 100);
    setExtraDevicePriceBdt(p.extraDevicePriceBdt ?? 100);
    setDurationMonths(p.durationMonths ?? 12);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSaving(true);

    try {
      if (editingPlan) {
        await adminApi.updatePlan(editingPlan.id, {
          name,
          priceBdt,
          includedUsers,
          includedDevices,
          extraUserPriceBdt,
          extraDevicePriceBdt,
          durationMonths,
        });
        setSuccessMsg(`Plan '${name}' updated successfully.`);
      } else {
        await adminApi.createPlan({
          id: planId.trim() || undefined,
          name: name.trim(),
          priceBdt,
          includedUsers,
          includedDevices,
          extraUserPriceBdt,
          extraDevicePriceBdt,
          durationMonths,
        });
        setSuccessMsg(`Plan '${name}' created successfully.`);
      }
      setIsModalOpen(false);
      await fetchPlans();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save plan');
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleArchive = async (plan: Plan) => {
    const isArchived = plan.status === 'archived';
    const action = isArchived ? 'activate' : 'archive';
    if (!window.confirm(`Are you sure you want to ${action} plan '${plan.name}'?`)) {
      return;
    }

    try {
      await adminApi.updatePlan(plan.id, {
        status: isArchived ? 'active' : 'archived',
      });
      setSuccessMsg(`Plan '${plan.name}' marked as ${isArchived ? 'active' : 'archived'}.`);
      await fetchPlans();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} plan`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Subscription Plans & Pricing Defaults
          </h1>
          <p className="text-xs text-slate-400">
            Define default tiers and limits for chamber firms. Firms can also receive custom prices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPlans}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Create Plan
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading plans...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isArchived = p.status === 'archived';
            return (
              <div
                key={p.id}
                className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  isArchived
                    ? 'bg-slate-900/40 border-slate-800/80 opacity-75'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-100 text-base">{p.name}</h3>
                      <span className="text-[11px] text-slate-400 font-mono">ID: {p.id}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        isArchived
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {p.status || 'active'}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-2xl font-bold text-indigo-400 font-mono">
                      BDT {p.priceBdt.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400"> / month</span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        Included Users:
                      </span>
                      <span className="font-semibold">{p.includedUsers ?? p.seats ?? 0}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                        Included Devices:
                      </span>
                      <span className="font-semibold">{p.includedDevices ?? 0}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Extra User Rate:</span>
                      <span className="font-mono">BDT {p.extraUserPriceBdt ?? 100} / mo</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Extra Device Rate:</span>
                      <span className="font-mono">BDT {p.extraDevicePriceBdt ?? 100} / mo</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        Duration:
                      </span>
                      <span>{p.durationMonths ?? 12} Months</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 mt-4 border-t border-slate-800">
                  <button
                    onClick={() => openEditModal(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors min-h-[44px]"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleArchive(p)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
                      isArchived
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {isArchived ? 'Reactivate' : 'Archive'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      <ResponsiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create Subscription Plan'}
        maxWidth="md"
      >
        <form onSubmit={handleSavePlan} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300">Plan Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Solo, Chamber, Enterprise"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
              />
            </div>

            {!editingPlan && (
              <div className="space-y-1">
                <label className="text-slate-300">Plan Slug / ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. solo, chamber-v2"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-slate-300">Base Price (BDT / mo)</label>
              <input
                type="number"
                min={0}
                required
                value={priceBdt}
                onChange={(e) => setPriceBdt(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300">Duration (Months)</label>
              <input
                type="number"
                min={1}
                max={36}
                required
                value={durationMonths}
                onChange={(e) => setDurationMonths(parseInt(e.target.value, 10) || 12)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300">Included Users</label>
              <input
                type="number"
                min={1}
                max={500}
                required
                value={includedUsers}
                onChange={(e) => setIncludedUsers(parseInt(e.target.value, 10) || 1)}
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
                onChange={(e) => setIncludedDevices(parseInt(e.target.value, 10) || 1)}
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
                onChange={(e) => setExtraUserPriceBdt(parseInt(e.target.value, 10) || 0)}
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
                onChange={(e) => setExtraDevicePriceBdt(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-700/60">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700/50 min-h-[44px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium min-h-[44px] transition-colors disabled:opacity-50"
            >
              {formSaving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
};
