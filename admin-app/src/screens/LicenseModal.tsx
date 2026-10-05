import React, { useState } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { Firm } from '../types/adminTypes';
import { AlertCircle } from 'lucide-react';

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
  const [maxDevices, setMaxDevices] = useState(firm.maxDevices || 5);
  const [expiryDate, setExpiryDate] = useState(
    firm.licenseExpiresAt ? firm.licenseExpiresAt.split('T')[0] : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.updateLicense(firm.id, {
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
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={`Adjust License: ${firm.name}`} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Max Allowed Devices / Seats</label>
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
            {loading ? 'Saving...' : 'Save License'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
};
