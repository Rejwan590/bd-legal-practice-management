import React, { useState } from 'react';
import { ResponsiveModal } from './ResponsiveModal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  requiredConfirmationText?: string;
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  requiredConfirmationText,
  loading = false,
}) => {
  const [typedText, setTypedText] = useState('');

  const isConfirmDisabled = requiredConfirmationText
    ? typedText.trim() !== requiredConfirmationText.trim() || loading
    : loading;

  const handleClose = () => {
    setTypedText('');
    onClose();
  };

  const handleConfirm = () => {
    onConfirm();
    setTypedText('');
  };

  const variantButtonClass = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  }[variant];

  return (
    <ResponsiveModal isOpen={isOpen} onClose={handleClose} title={title} maxWidth="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-sm text-slate-300 leading-relaxed">{message}</div>
        </div>

        {requiredConfirmationText && (
          <div className="space-y-2 pt-2 border-t border-slate-700">
            <label className="block text-xs font-medium text-slate-400">
              Please type <span className="text-white font-semibold underline">{requiredConfirmationText}</span> to confirm:
            </label>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={requiredConfirmationText}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 min-h-[44px]"
            />
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700/50 min-h-[44px] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-lg font-medium min-h-[44px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantButtonClass}`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </ResponsiveModal>
  );
};
