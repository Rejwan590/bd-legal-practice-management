import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Columns3, Check, RotateCcw } from 'lucide-react';

export interface ColumnOption {
  id: string;
  label: string;
  isAlwaysVisible?: boolean;
  defaultHiddenOnTablet?: boolean;
}

export interface ColumnVisibilityMenuProps {
  storageKey: string;
  columns: ColumnOption[];
  visibleColumns: string[];
  onChange: (visibleKeys: string[]) => void;
  className?: string;
}

export function useColumnVisibility(
  storageKey: string,
  columns: ColumnOption[]
): [string[], (keys: string[]) => void] {
  const getDefaultColumns = () => {
    const isTablet =
      typeof window !== 'undefined' &&
      window.innerWidth >= 768 &&
      window.innerWidth < 1024;

    return columns
      .filter((col) => {
        if (col.isAlwaysVisible) return true;
        if (isTablet && col.defaultHiddenOnTablet) return false;
        return true;
      })
      .map((col) => col.id);
  };

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(`col_vis_${storageKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Ensure always-visible columns are present
            const alwaysVisible = columns.filter((c) => c.isAlwaysVisible).map((c) => c.id);
            return Array.from(new Set([...parsed, ...alwaysVisible]));
          }
        }
      }
    } catch {
      // Fallback if localStorage is disabled or throws
    }
    return getDefaultColumns();
  });

  const updateVisibleColumns = (keys: string[]) => {
    // Ensure always-visible columns cannot be unchecked
    const alwaysVisible = columns.filter((c) => c.isAlwaysVisible).map((c) => c.id);
    const finalKeys = Array.from(new Set([...keys, ...alwaysVisible]));
    setVisibleColumns(finalKeys);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`col_vis_${storageKey}`, JSON.stringify(finalKeys));
      }
    } catch {
      // Ignore localStorage write failures
    }
  };

  return [visibleColumns, updateVisibleColumns];
}

export const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  columns,
  visibleColumns,
  onChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleColumn = (colId: string) => {
    const col = columns.find((c) => c.id === colId);
    if (col?.isAlwaysVisible) return;

    if (visibleColumns.includes(colId)) {
      onChange(visibleColumns.filter((id) => id !== colId));
    } else {
      onChange([...visibleColumns, colId]);
    }
  };

  const resetToDefault = () => {
    const allIds = columns.map((c) => c.id);
    onChange(allIds);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
        aria-label={t('common.columnVisibility', { defaultValue: 'Columns' })}
        aria-expanded={open}
      >
        <Columns3 className="w-4 h-4 text-slate-500" />
        <span>{t('common.columns', { defaultValue: 'Columns' })}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg border border-slate-200 z-30 p-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100 px-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('common.columnVisibility', { defaultValue: 'Toggle Columns' })}
            </span>
            <button
              type="button"
              onClick={resetToDefault}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
              title={t('common.resetAll', { defaultValue: 'Reset all' })}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('common.reset', { defaultValue: 'Reset' })}</span>
            </button>
          </div>

          <div className="space-y-0.5 max-h-60 overflow-y-auto">
            {columns.map((col) => {
              const isChecked = visibleColumns.includes(col.id);
              const isDisabled = Boolean(col.isAlwaysVisible);

              return (
                <label
                  key={col.id}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition ${
                    isDisabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100'
                  }`}
                >
                  <span className="text-slate-700 font-medium">{col.label}</span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleColumn(col.id)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
