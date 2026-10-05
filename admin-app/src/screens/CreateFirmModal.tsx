import React, { useState } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { CreateFirmPayload } from '../types/adminTypes';
import { Copy, Check, AlertCircle, KeyRound } from 'lucide-react';

interface CreateFirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateFirmModal: React.FC<CreateFirmModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<CreateFirmPayload>({
    name: '',
    ownerName: '',
    ownerEmail: '',
    contact: '',
    officeAddress: '',
    barCouncilReg: '',
    courtAffiliations: '',
    months: 12,
    maxDevices: 5,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdOwnerEmail, setCreatedOwnerEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await adminApi.createFirm(formData);
      setTempPassword(res.temporaryPassword);
      setCreatedOwnerEmail(res.ownerUser.email);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to create chamber firm.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setTempPassword(null);
    setCreatedOwnerEmail(null);
    setFormData({
      name: '',
      ownerName: '',
      ownerEmail: '',
      contact: '',
      officeAddress: '',
      barCouncilReg: '',
      courtAffiliations: '',
      months: 12,
      maxDevices: 5,
    });
    onClose();
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={handleClose} title="Create Chamber Firm" maxWidth="lg">
      {tempPassword ? (
        <div className="space-y-5">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-base">
              <KeyRound className="w-5 h-5" />
              Chamber Created & Credentials Generated
            </div>
            <p className="text-xs text-slate-300">
              The first Owner account for <span className="text-white font-medium">{createdOwnerEmail}</span> has been provisioned.
              This temporary password will be <span className="text-amber-400 font-semibold underline">shown only once</span>.
              The owner will be forced to change it on their first login.
            </p>

            <div className="flex items-center justify-between gap-2 p-3 bg-slate-900 rounded-lg border border-slate-700 font-mono text-sm">
              <span className="text-emerald-300 select-all font-semibold tracking-wider">{tempPassword}</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs min-h-[44px] transition-colors"
                title="Copy temporary password"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg min-h-[44px] transition-colors"
            >
              Done & Return to List
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Chamber Firm Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Rahman & Associates"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Contact Number</label>
              <input
                type="text"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                placeholder="e.g. +880 1711-000000"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Initial Owner Name *</label>
              <input
                type="text"
                required
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                placeholder="e.g. Adv. Mahbubur Rahman"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Initial Owner Email *</label>
              <input
                type="email"
                required
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                placeholder="owner@chamber.bd"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">License Duration (Months)</label>
              <select
                value={formData.months}
                onChange={(e) => setFormData({ ...formData, months: parseInt(e.target.value) || 12 })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              >
                <option value={1}>1 Month (Trial)</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
                <option value={12}>12 Months (1 Year)</option>
                <option value={24}>24 Months (2 Years)</option>
                <option value={36}>36 Months (3 Years)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Allowed Devices / Seats</label>
              <input
                type="number"
                min={1}
                max={100}
                value={formData.maxDevices}
                onChange={(e) => setFormData({ ...formData, maxDevices: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Office Address</label>
            <input
              type="text"
              value={formData.officeAddress}
              onChange={(e) => setFormData({ ...formData, officeAddress: e.target.value })}
              placeholder="e.g. Supreme Court Bar Association Building, Ramna, Dhaka"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700/50 min-h-[44px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium min-h-[44px] transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Firm'}
            </button>
          </div>
        </form>
      )}
    </ResponsiveModal>
  );
};
