import React from 'react';

export interface ColumnDef<T> {
  header: React.ReactNode;
  accessor?: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  columns?: ColumnDef<T>[];
  renderMobileCard: (row: T, index: number) => React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  className?: string;
  children?: React.ReactNode; // Optional custom desktop table content
}

export function ResponsiveTable<T>({
  data,
  keyExtractor,
  columns,
  renderMobileCard,
  onRowClick,
  emptyState,
  className = '',
  children,
}: ResponsiveTableProps<T>) {
  const safeData = Array.isArray(data) ? data : [];

  if (safeData.length === 0 && emptyState) {
    return <div className="w-full">{emptyState}</div>;
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Mobile Stacked Card View (< md) */}
      <div className="block md:hidden space-y-3">
        {safeData.map((row, idx) => (
          <div
            key={keyExtractor(row, idx)}
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}
          >
            {renderMobileCard(row, idx)}
          </div>
        ))}
      </div>

      {/* Desktop / Tablet Table View (>= md) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        {children ? (
          children
        ) : columns ? (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 sticky top-0 z-10 backdrop-blur-xs">
                {columns.map((col, cIdx) => (
                  <th
                    key={cIdx}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${
                      col.headerClassName || col.className || ''
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {safeData.map((row, rIdx) => (
                <tr
                  key={keyExtractor(row, rIdx)}
                  onClick={() => onRowClick?.(row)}
                  className={`transition hover:bg-slate-50/80 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-4 py-3.5 text-slate-700 align-middle ${
                        col.className || ''
                      }`}
                    >
                      {col.accessor ? col.accessor(row, rIdx) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
