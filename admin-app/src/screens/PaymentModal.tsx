import React, { useState } from 'react';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { adminApi } from '../api/adminApi';
import { Firm } from '../types/adminTypes';
import { AlertCircle } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  firm: Firm;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  firm,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<number>(35000);
  const [method, setMethod] = useState<'bKash' | 'Nagad' | 'bank'>('bKash');
  const [txnId, setTxnId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.recordPayment(firm.id, {
        amount,
        method,
        txnId,
        note: note.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title={`Record Payment: ${firm.name}`} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Amount (BDT) *</label>
            <input
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Payment Method *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            >
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Transaction ID (TrxID / Bank Reference) *</label>
          <input
            type="text"
            required
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
            placeholder="e.g. BK88991122"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Note / Remarks (Optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 1-year chamber subscription fee"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
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
            {loading ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
};
