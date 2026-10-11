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
  permissions: string[];
}

const SENIOR_LAWYER_PRESET: RolePreset = {
  id: 'senior_lawyer',
  nameKey: 'presets.seniorLawyer',
  defaultJobType: 'lawyer_senior',
  permissions: [
    'cases.view',
    'cases.create',
    'cases.edit',
    'hearings.update',
    'clients.view',
    'clients.edit',
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
  permissions: [
    'cases.view',
    'cases.create',
    'cases.edit',
    'hearings.update',
    'clients.view',
    'clients.edit',
    'tasks.view',
    'tasks.complete',
    'files.view',
  ],
};

export const ROLE_PRESETS: Record<string, RolePreset> = {
  senior_lawyer: SENIOR_LAWYER_PRESET,
  seniorLawyer: SENIOR_LAWYER_PRESET,
  junior_lawyer: JUNIOR_LAWYER_PRESET,
  juniorLawyer: JUNIOR_LAWYER_PRESET,
  clerk: {
    id: 'clerk',
    nameKey: 'presets.clerk',
    defaultJobType: 'clerk',
    permissions: [
      'cases.view',
      'hearings.update',
      'clients.view',
      'tasks.view',
      'tasks.complete',
      'files.view',
      'files.manage',
    ],
  },
  receptionist: {
    id: 'receptionist',
    nameKey: 'presets.receptionist',
    defaultJobType: 'receptionist',
    permissions: [
      'clients.view',
      'clients.edit',
      'tasks.view',
      'tasks.complete',
    ],
  },
};

export const ALL_PERMISSION_KEYS = [
  'cases.view',
  'cases.create',
  'cases.edit',
  'cases.delete',
  'hearings.update',
  'clients.view',
  'clients.edit',
  'tasks.view',
  'tasks.assign',
  'tasks.complete',
  'files.view',
  'files.manage',
  'restricted.view',
  'billing.view',
  'billing.manage',
  'users.manage',
  'settings.manage',
  'data.export',
] as const;

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
