import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigation } from '../modules/foundation/NavigationContext';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  fallbackPath?: string;
  onBackOverride?: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  fallbackPath,
  onBackOverride,
}) => {
  const { t } = useTranslation();
  const { goBack, navigate } = useNavigation();

  const handleBack = () => {
    if (onBackOverride) {
      onBackOverride();
    } else {
      goBack(fallbackPath);
    }
  };

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="detail-breadcrumbs"
      className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1 min-w-0"
    >
      <button
        type="button"
        onClick={handleBack}
        data-testid="detail-back-button"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold shadow-2xs transition shrink-0 min-h-[34px]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t('common.back')}</span>
      </button>

      <div className="flex items-center flex-wrap gap-1 min-w-0">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <React.Fragment key={`${item.label}-${idx}`}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              {isLast || (!item.href && !item.onClick) ? (
                <span
                  className={`truncate max-w-[180px] sm:max-w-[280px] ${
                    isLast ? 'font-bold text-slate-900' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href || '#'}
                  onClick={(e) => {
                    e.preventDefault();
                    if (item.onClick) item.onClick();
                    else if (item.href) navigate(item.href);
                  }}
                  className="font-medium text-slate-600 hover:text-indigo-700 hover:underline truncate max-w-[150px] sm:max-w-[220px] transition"
                >
                  {item.label}
                </a>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
