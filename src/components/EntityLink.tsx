import React from 'react';
import {
  Briefcase,
  User,
  Calendar,
  CheckSquare,
  FolderArchive,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../modules/foundation/AuthContext';
import {
  useNavigation,
  CaseDossierTab,
  ClientProfileTab,
} from '../modules/foundation/NavigationContext';

export type EntityLinkType = 'case' | 'client' | 'hearing' | 'task' | 'file';

export interface EntityLinkProps {
  type: EntityLinkType;
  id: string;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  caseId?: string | null;
  caseTab?: CaseDossierTab;
  clientTab?: ClientProfileTab;
  mode?: 'page' | 'modal';
  restricted?: boolean;
  isRestricted?: boolean;
  showIcon?: boolean;
  showExternalIcon?: boolean;
  className?: string;
  title?: string;
  onClickOverride?: () => void;
  onAfterNavigate?: () => void;
}

export const EntityLink: React.FC<EntityLinkProps> = ({
  type,
  id,
  label,
  subtitle,
  caseId,
  caseTab,
  clientTab = 'cases',
  mode,
  restricted = false,
  isRestricted = false,
  showIcon = false,
  showExternalIcon = false,
  className = '',
  title,
  onClickOverride,
  onAfterNavigate,
}) => {
  const { can } = useAuth();
  const {
    openCaseDossier,
    openClientProfile,
    openEntityModalById,
    navigateToScreen,
  } = useNavigation();

  const isConfidential = Boolean(restricted || isRestricted);

  // Strictly conceal restricted items from users without restricted.view
  if (isConfidential && !can('restricted.view')) {
    return null;
  }

  const getHref = (): string => {
    if (type === 'case') {
      return `/cases/${encodeURIComponent(id)}/${caseTab || 'overview'}`;
    }
    if (type === 'client') {
      return clientTab && clientTab !== 'cases'
        ? `/clients/${encodeURIComponent(id)}/${clientTab}`
        : `/clients/${encodeURIComponent(id)}`;
    }
    if (type === 'hearing') {
      if (caseId) return `/cases/${encodeURIComponent(caseId)}/${caseTab || 'hearings'}`;
      return '/hearings';
    }
    if (type === 'task') {
      if (caseId && mode === 'page') return `/cases/${encodeURIComponent(caseId)}/tasks`;
      return '/tasks';
    }
    if (type === 'file') {
      if (caseId && mode === 'page') return `/cases/${encodeURIComponent(caseId)}/files`;
      return '/files';
    }
    return '/dashboard';
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    if (onClickOverride) {
      onClickOverride();
      onAfterNavigate?.();
      return;
    }

    if (type === 'case') {
      if (mode === 'modal') {
        openEntityModalById('case', id);
      } else {
        openCaseDossier(id, caseTab || 'overview');
      }
      onAfterNavigate?.();
      return;
    }

    if (type === 'client') {
      if (mode === 'modal') {
        openEntityModalById('client', id);
      } else {
        openClientProfile(id, clientTab);
      }
      onAfterNavigate?.();
      return;
    }

    if (type === 'hearing') {
      if (mode === 'modal') {
        openEntityModalById('hearing', id);
      } else if (caseId) {
        openCaseDossier(caseId, caseTab || 'hearings');
      } else {
        openEntityModalById('hearing', id);
      }
      onAfterNavigate?.();
      return;
    }

    if (type === 'task') {
      if (mode === 'page' && caseId) {
        openCaseDossier(caseId, caseTab || 'tasks');
      } else if (id) {
        openEntityModalById('task', id);
      } else {
        navigateToScreen('tasks');
      }
      onAfterNavigate?.();
      return;
    }

    if (type === 'file') {
      if (mode === 'page' && caseId) {
        openCaseDossier(caseId, caseTab || 'files');
      } else if (id) {
        openEntityModalById('file', id);
      } else {
        navigateToScreen('files');
      }
      onAfterNavigate?.();
    }
  };

  const renderIcon = () => {
    if (!showIcon) return null;
    const iconProps = { className: 'w-3.5 h-3.5 shrink-0 opacity-75' };
    switch (type) {
      case 'case':
        return <Briefcase {...iconProps} />;
      case 'client':
        return <User {...iconProps} />;
      case 'hearing':
        return <Calendar {...iconProps} />;
      case 'task':
        return <CheckSquare {...iconProps} />;
      case 'file':
        return <FolderArchive {...iconProps} />;
    }
  };

  return (
    <a
      href={getHref()}
      onClick={handleClick}
      title={title}
      data-entity-link={type}
      data-entity-id={id}
      className={`inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2 transition cursor-pointer max-w-full ${className}`}
    >
      {renderIcon()}
      <span className="truncate">{label}</span>
      {subtitle && <span className="text-[11px] font-mono text-slate-400 no-underline shrink-0">{subtitle}</span>}
      {showExternalIcon && <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />}
    </a>
  );
};
