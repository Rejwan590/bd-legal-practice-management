import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
}

const maxWidthMap = {
  sm: 'md:max-w-md',
  md: 'md:max-w-lg',
  lg: 'md:max-w-xl',
  xl: 'md:max-w-2xl',
  '2xl': 'md:max-w-3xl',
  '3xl': 'md:max-w-4xl',
  '4xl': 'md:max-w-5xl',
};

export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  maxWidth = 'xl',
  children,
  footer,
  bodyClassName = '',
}) => {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      {/* Click outside to close (desktop only) */}
      <div
        className="hidden md:block absolute inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Sheet Container */}
      <div
        className={`w-full bg-white flex flex-col overflow-hidden shadow-2xl transition-all
          /* Mobile (<md): Full-screen sheet with 100dvh and safe areas */
          h-[100dvh] max-h-[100dvh] rounded-t-2xl md:rounded-2xl
          /* Tablet/Desktop (>=md): Centered dialog with max-height 90dvh */
          md:h-auto md:max-h-[90dvh] md:border md:border-slate-200 ${maxWidthMap[maxWidth]}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 shrink-0 pt-safe">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate leading-snug">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-500 truncate mt-0.5 leading-normal">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Close button with 44px touch target */}
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className={`flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 overscroll-contain ${bodyClassName}`}>
          {children}
        </div>

        {/* Sticky Footer Action Bar */}
        {footer && (
          <div className="sticky bottom-0 z-10 bg-white md:bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 shadow-xs">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
