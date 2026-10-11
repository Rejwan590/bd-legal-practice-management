import { Repositories } from '../../../data/repositories';
import { SecurityContext, UserRecord } from '../../../data/types';

export interface TestResult {
  id: string;
  name: string;
  category:
    | 'Permissions'
    | 'Data Layer'
    | 'Audit Trail'
    | 'i18n & Shell'
    | 'Clients Module'
    | 'Cases Module'
    | 'Hearings Module'
    | 'Tasks Module'
    | 'Physical Files Module'
    | 'Calendar & Reminders'
    | 'Dashboard & Search'
    | 'Backup & Restore'
    | 'Subscription & Read-Only'
    | 'Hub & Navigation';
  passed: boolean;
  message: string;
  details?: string;
}

export interface DiagnosticContext {
  repos: Repositories;
  ownerUser: UserRecord;
  staffUser: UserRecord;
  ownerCtx: SecurityContext;
  staffCtx: SecurityContext;
}
