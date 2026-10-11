import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { SearchResultEntity, SearchResultItem } from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import {
  Search,
  X,
  Briefcase,
  Users,
  Gavel,
  CheckSquare,
  FolderArchive,
  Lock,
  CornerDownLeft,
  Filter,
  Edit2,
} from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string, id?: string) => void;
  initialQuery?: string;
  inlinePage?: boolean;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  inlinePage = false,
}) => {
  const { t } = useTranslation();
  const { currentUser, isReadOnly } = useAuth();
  const {
    refreshVersion,
    openCaseDossier,
    openClientProfile,
    openEntityModalById,
  } = useNavigation();
  const repos = getRepositories();

  const [query, setQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<SearchResultEntity | 'all'>('all');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else if (!inlinePage) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen, inlinePage]);

  // Execute search query
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const securityContext = { currentUser };
        const hits = await repos.search.search(securityContext, trimmed, {
          entity: activeFilter === 'all' ? undefined : activeFilter,
          limit: 40,
        });
        setResults(hits);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query, activeFilter, currentUser, isOpen, repos.search, refreshVersion]);

  // Handle keyboard navigation inside search list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % results.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelectItem(results[selectedIndex]);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleSelectItem = (item: SearchResultItem) => {
    if (item.entity === 'case') {
      openCaseDossier(item.id, 'overview');
    } else if (item.entity === 'client') {
      openClientProfile(item.id, 'cases');
    } else {
      openEntityModalById(item.entity, item.id);
    }
    if (!inlinePage) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const filterOptions: { id: SearchResultEntity | 'all'; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: t('search.filterAll'), icon: Filter },
    { id: 'case', label: t('search.filterCases'), icon: Briefcase },
    { id: 'client', label: t('search.filterClients'), icon: Users },
    { id: 'hearing', label: t('search.filterHearings'), icon: Gavel },
    { id: 'task', label: t('search.filterTasks'), icon: CheckSquare },
    { id: 'file', label: t('search.filterFiles'), icon: FolderArchive },
  ];

  const getEntityIcon = (entity: SearchResultEntity) => {
    switch (entity) {
      case 'case':
        return <Briefcase className="w-4 h-4 text-indigo-600" />;
      case 'client':
        return <Users className="w-4 h-4 text-emerald-600" />;
      case 'hearing':
        return <Gavel className="w-4 h-4 text-amber-600" />;
      case 'task':
        return <CheckSquare className="w-4 h-4 text-blue-600" />;
      case 'file':
        return <FolderArchive className="w-4 h-4 text-purple-600" />;
    }
  };

  const getEntityBg = (entity: SearchResultEntity) => {
    switch (entity) {
      case 'case':
        return 'bg-indigo-50 border-indigo-100 text-indigo-700';
      case 'client':
        return 'bg-emerald-50 border-emerald-100 text-emerald-700';
      case 'hearing':
        return 'bg-amber-50 border-amber-100 text-amber-700';
      case 'task':
        return 'bg-blue-50 border-blue-100 text-blue-700';
      case 'file':
        return 'bg-purple-50 border-purple-100 text-purple-700';
    }
  };

  return (
    <div
      className={
        inlinePage
          ? 'max-w-4xl mx-auto w-full py-2'
          : 'fixed inset-0 z-50 flex items-start justify-center pt-2 sm:pt-16 p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150'
      }
      onClick={() => {
        if (!inlinePage) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[80vh] animate-in zoom-in-95 duration-150 mx-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Input Bar */}
        <div className="relative flex items-center px-3 sm:px-4 py-3 border-b border-slate-200 gap-2 min-h-[56px]">
          <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full pl-2 pr-2 py-1.5 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0"
              aria-label="Clear query"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}

          {/* Close / ESC Button */}
          {!inlinePage && (
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition shrink-0"
              aria-label="Close search"
            >
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                ESC
              </span>
              <X className="w-5 h-5 sm:hidden" />
            </button>
          )}
        </div>

        {/* Entity Filter Pills */}
        <div className="px-3 sm:px-4 py-2 bg-slate-50/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none">
          {filterOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = activeFilter === opt.id;
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => setActiveFilter(opt.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-xl font-medium transition shrink-0 text-xs ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                    : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Results Container */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 max-h-[460px]"
        >
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">{t('common.loading')}</p>
            </div>
          ) : query.trim() === '' ? (
            <div className="py-10 sm:py-12 text-center text-slate-400 px-4 sm:px-6">
              <Search className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <h4 className="text-sm font-semibold text-slate-700">{t('search.title')}</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {t('search.subtitle')}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-slate-400 text-[11px] block w-full sm:w-auto">Quick examples:</span>
                <button
                  type="button"
                  onClick={() => setQuery('Suit')}
                  className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-mono text-xs flex items-center justify-center"
                >
                  Suit
                </button>
                <button
                  type="button"
                  onClick={() => setQuery('F-000101')}
                  className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-mono text-xs flex items-center justify-center"
                >
                  F-000101
                </button>
                <button
                  type="button"
                  onClick={() => setQuery('Dhaka')}
                  className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-mono text-xs flex items-center justify-center"
                >
                  Dhaka
                </button>
                <button
                  type="button"
                  onClick={() => setQuery('Rafiqul')}
                  className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-mono text-xs flex items-center justify-center"
                >
                  Rafiqul
                </button>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-500 px-4 sm:px-6">
              <p className="text-sm font-semibold text-slate-800">
                {t('search.noResults', { query })}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {t('search.noResultsHint')}
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.entity}-${item.id}`}
                  data-index={idx}
                  data-testid={`search-result-${item.entity}-${item.id}`}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group px-3 py-2.5 min-h-[52px] rounded-xl cursor-pointer transition flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-slate-100 text-slate-900 shadow-2xs' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${getEntityBg(
                        item.entity
                      )}`}
                    >
                      {getEntityIcon(item.entity)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        className="flex items-center gap-1.5 sm:gap-2 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EntityLink
                          type={item.entity}
                          id={item.id}
                          caseId={item.entity === 'hearing' ? item.targetId : undefined}
                          mode={item.entity === 'case' || item.entity === 'client' ? 'page' : 'modal'}
                          label={item.title}
                          restricted={item.restricted}
                          onAfterNavigate={() => {
                            if (!inlinePage) onClose();
                          }}
                          className="font-semibold text-sm break-words"
                        />

                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${getEntityBg(
                            item.entity
                          )}`}
                        >
                          {item.entity}
                        </span>

                        {item.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono">
                            {item.badge}
                          </span>
                        )}

                        {item.restricted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            <Lock className="w-3 h-3" />
                            Confidential
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.subtitle}</p>

                      {item.details && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {item.details}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {!isReadOnly &&
                      (item.entity === 'hearing' ||
                        item.entity === 'task' ||
                        item.entity === 'file') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEntityModalById(item.entity, item.id);
                            if (!inlinePage) onClose();
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 gap-2">
          <div className="flex items-center gap-2 truncate">
            <span>
              {results.length > 0 && t('search.resultsFound', { count: results.length })}
            </span>
            <span className="hidden sm:inline text-slate-400">•</span>
            <span className="hidden sm:inline text-slate-400">
              {t('search.confidentialNotice')}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400 shrink-0">
            <span className="hidden sm:inline">↑↓ navigate</span>
            <span className="hidden sm:inline">↵ select</span>
            <span>esc / close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
