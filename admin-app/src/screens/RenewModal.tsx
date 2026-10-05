import React, { useState } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { Firm } from '../types/adminTypes';
import { AlertCircle, CalendarClock } from 'lucide-react';

interface RenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  firm: Firm;
  onSuccess: () => void;
}

export const RenewModal: React.FC<RenewModalProps> = ({
  isOpen,
  onClose,
  firm,
  onSuccess,
}) => {
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.renewLicense(firm.id, months);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to renew license.');
    } finally {
      setLoading(false);
    }
  };

  const currentExpiry = new Date(firm.licenseExpiresAt);
  const isCurrentlyExpired = currentExpiry.getTime() < Date.now();
  const baseTime = Math.max(Date.now(), currentExpiry.getTime());
  const projectedExpiry = new Date(baseTime + months * 30 * 24 * 60 * 60 * 1000);

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={`Renew License: ${firm.name}`} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-900/80 border border-slate-700 rounded-xl space-y-2 text-xs">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
            <CalendarClock className="w-4 h-4" />
            License Calculation Policy
          </div>
          <div className="text-slate-300">
            Current status: <span className={`font-semibold ${isCurrentlyExpired ? 'text-rose-400' : 'text-emerald-400'}`}>{firm.status}</span>
          </div>
          <div className="text-slate-300">
            Current expiry: <span className="font-mono text-slate-100">{currentExpiry.toLocaleDateString()}</span>
          </div>
          <div className="text-slate-300">
            Projected new expiry: <span className="font-mono text-emerald-400 font-bold">{projectedExpiry.toLocaleDateString()}</span>
          </div>
          <p className="text-slate-400 text-[11px] pt-1">
            Renewal strictly extends from the later of the current server clock or the existing expiry date. All existing firm cases, clients, and files are permanently preserved.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Extension Period</label>
          <select
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value) || 12)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
          >
            <option value={1}>1 Month</option>
            <option value={3}>3 Months</option>
            <option value={6}>6 Months</option>
            <option value={12}>12 Months (1 Year)</option>
            <option value={24}>24 Months (2 Years)</option>
            <option value={36}>36 Months (3 Years)</option>
          </select>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-slate-700">
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
            {loading ? 'Renewing...' : 'Confirm Renewal'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
};
