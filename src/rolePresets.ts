import { ALL_PERMISSIONS, PermissionKey } from './permissions';

export type JobType =
  | 'lawyer_senior'
  | 'lawyer_junior'
  | 'clerk'
  | 'receptionist'
  | 'intern'
  | 'other';

export type VisibilityMode = 'open' | 'team';

export interface RolePreset {
  id: string;
  nameKey: string;
  defaultJobType: JobType;
  jobType: JobType;
  permissions: PermissionKey[];
}

const SENIOR_LAWYER_PRESET: RolePreset = {
  id: 'senior_lawyer',
  nameKey: 'presets.seniorLawyer',
  defaultJobType: 'lawyer_senior',
  jobType: 'lawyer_senior',
  permissions: [
    'cases.view',
    'cases.create',
    'cases.edit',
    'hearings.update',
    'clients.view',
    'clients.edit',
    'appointments.view',
    'appointments.manage',
    'tasks.view',
    'tasks.assign',
    'tasks.complete',
    'files.view',
    'files.manage',
    'billing.view',
    'data.export',
  ],
};

const JUNIOR_LAWYER_PRESET: RolePreset = {
  id: 'junior_lawyer',
  nameKey: 'presets.juniorLawyer',
  defaultJobType: 'lawyer_junior',
  jobType: 'lawyer_junior',
  permissions: [
    'cases.view',
    'cases.create',
    'cases.edit',
    'hearings.update',
    'clients.view',
    'clients.edit',
    'appointments.view',
    'appointments.manage',
    'tasks.view',
    'tasks.complete',
    'files.view',
  ],
};

const CLERK_PRESET: RolePreset = {
  id: 'clerk',
  nameKey: 'presets.clerk',
  defaultJobType: 'clerk',
  jobType: 'clerk',
  permissions: [
    'cases.view',
    'hearings.update',
    'clients.view',
    'appointments.view',
    'tasks.view',
    'tasks.complete',
    'files.view',
    'files.manage',
  ],
};

const RECEPTIONIST_PRESET: RolePreset = {
  id: 'receptionist',
  nameKey: 'presets.receptionist',
  defaultJobType: 'receptionist',
  jobType: 'receptionist',
  permissions: [
    'clients.view',
    'clients.edit',
    'appointments.view',
    'appointments.manage',
    'tasks.view',
    'tasks.complete',
  ],
};

export const ROLE_PRESETS: Record<string, RolePreset> = {
  senior_lawyer: SENIOR_LAWYER_PRESET,
  seniorLawyer: SENIOR_LAWYER_PRESET,
  junior_lawyer: JUNIOR_LAWYER_PRESET,
  juniorLawyer: JUNIOR_LAWYER_PRESET,
  clerk: CLERK_PRESET,
  receptionist: RECEPTIONIST_PRESET,
};

export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS;

export const VALID_JOB_TYPES: JobType[] = [
  'lawyer_senior',
  'lawyer_junior',
  'clerk',
  'receptionist',
  'intern',
  'other',
];

export function isLawyerOrOwner(
  userOrRole: { role: string; jobType?: JobType | string | null } | string,
  jobType?: JobType | string | null
): boolean {
  if (typeof userOrRole === 'string') {
    if (userOrRole === 'Owner') return true;
    return jobType === 'lawyer_senior' || jobType === 'lawyer_junior';
  }
  if (userOrRole.role === 'Owner') return true;
  return userOrRole.jobType === 'lawyer_senior' || userOrRole.jobType === 'lawyer_junior';
}
