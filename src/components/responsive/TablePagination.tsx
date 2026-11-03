import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  className = '',
}) => {
  const { t } = useTranslation();

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  if (totalItems === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-2xs text-xs text-slate-600 ${className}`}
      data-testid="table-pagination"
    >
      {/* Range and Total summary */}
      <div className="flex items-center gap-2 font-medium">
        <span>
          {t('common.showingRange', {
            defaultValue: 'Showing {{start}}-{{end}} of {{total}}',
            start: startItem,
            end: endItem,
            total: totalItems,
          })}
        </span>
      </div>

      {/* Controls: Page size selector + Page navigation */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
        {/* Page size selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-medium">{t('common.perPage', { defaultValue: 'Per page:' })}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              onPageSizeChange(newSize);
            }}
            className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px] focus:ring-2 focus:ring-slate-400 focus:outline-hidden cursor-pointer"
            aria-label={t('common.perPage', { defaultValue: 'Per page' })}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Page navigation buttons */}
        <div className="flex items-center gap-1">
          {/* First page */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] min-w-[36px] flex items-center justify-center transition"
            title={t('common.firstPage', { defaultValue: 'First page' })}
            aria-label={t('common.firstPage', { defaultValue: 'First page' })}
          >
            <ChevronsLeft className="w-4 h-4 text-slate-600" />
          </button>

          {/* Previous page */}
          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] min-w-[36px] flex items-center justify-center transition"
            title={t('common.previousPage', { defaultValue: 'Previous page' })}
            aria-label={t('common.previousPage', { defaultValue: 'Previous page' })}
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>

          {/* Page indicator */}
          <span className="px-2 font-semibold text-slate-700">
            {t('common.pageOf', {
              defaultValue: 'Page {{current}} of {{total}}',
              current: safeCurrentPage,
              total: totalPages,
            })}
          </span>

          {/* Next page */}
          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] min-w-[36px] flex items-center justify-center transition"
            title={t('common.nextPage', { defaultValue: 'Next page' })}
            aria-label={t('common.nextPage', { defaultValue: 'Next page' })}
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>

          {/* Last page */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={safeCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] min-w-[36px] flex items-center justify-center transition"
            title={t('common.lastPage', { defaultValue: 'Last page' })}
            aria-label={t('common.lastPage', { defaultValue: 'Last page' })}
          >
            <ChevronsRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
