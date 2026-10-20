import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

let generatedOwnerPassword: string | null = null;
let generatedStaffPassword: string | null = null;

function resolvePassword(envVar: string, roleName: string): string {
  const envVal = process.env[envVar]?.trim();
  if (envVal) {
    return envVal;
  }
  const randomPass = `BdLegal_${crypto.randomBytes(8).toString('hex')}!`;
  console.log(`[Seed] Notice: No ${envVar} provided. Generated random ${roleName} password: ${randomPass}`);
  return randomPass;
}

export const SEED_PASSWORDS = {
  get owner(): string {
    if (!generatedOwnerPassword) {
      generatedOwnerPassword = resolvePassword('SEED_OWNER_PASSWORD', 'owner');
    }
    return generatedOwnerPassword;
  },
  get staff(): string {
    if (!generatedStaffPassword) {
      generatedStaffPassword = resolvePassword('SEED_STAFF_PASSWORD', 'staff');
    }
    return generatedStaffPassword;
  },
};

export const SEED_PLANS = [
  {
    id: 'annual-standard',
    name: 'Annual Chamber Standard',
    durationMonths: 12,
    priceBdt: 50000,
    seats: 10,
    features: ['cases', 'hearings', 'tasks', 'files', 'calendar', 'backup', 'audit'],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
  },
];

export const SEED_FIRMS = [
  {
    id: 'firm-bd-001',
    firmId: 'firm-bd-001',
    name: 'Rahman & Associates Chambers',
    barCouncilReg: 'BC-DHK-2012-9844',
    officeAddress: 'Suite 402, Supreme Court Bar Association Building, Ramna, Dhaka-1000',
    courtAffiliations: 'Supreme Court of Bangladesh (High Court & Appellate Division), Dhaka District & Sessions Judge Court',
    planId: 'annual-standard',
    contact: '+880 1711-000000',
    maxDevices: 100,
    devicePolicy: 'auto-approve' as const,
    allowOwnerDeviceRemoval: false,
    visibilityMode: 'open' as const,
    licenseStartsAt: new Date('2024-01-01T00:00:00.000Z'),
    licenseExpiresAt: new Date('2027-12-31T23:59:59.000Z'),
    status: 'active' as const,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const SEED_CLIENTS = [
  {
    id: 'client-001',
    firmId: 'firm-bd-001',
    name: 'Haji Mohammad Rafiqul Islam',
    nameBn: 'হাজী মোহাম্মদ রফিকুল ইসলাম',
    phone: '+880 1711-234567',
    email: 'rafiqul.islam@example.com',
    address: 'House 14, Road 5, Motijheel C/A, Dhaka-1000',
    notes: 'Longstanding family client. Title suit and land partition matters in Dhaka District Court.',
    archived: false,
    createdAt: new Date('2024-01-10T10:00:00.000Z'),
    updatedAt: new Date('2024-01-10T10:00:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'client-002',
    firmId: 'firm-bd-001',
    name: 'Begum Rokeya Sultana',
    nameBn: 'বেগম রোকেয়া সুলতানা',
    phone: '+880 1819-876543',
    email: 'rokeya.sultana@example.com',
    address: 'Flat 4B, Concord Tower, Dhanmondi 27, Dhaka-1209',
    notes: 'Civil Revision before High Court Division concerning property decree execution.',
    archived: false,
    createdAt: new Date('2024-01-15T11:30:00.000Z'),
    updatedAt: new Date('2024-01-15T11:30:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'client-003',
    firmId: 'firm-bd-001',
    name: 'Kabir Steel Mills Ltd.',
    nameBn: 'কবীর স্টিল মিলস লিমিটেড',
    phone: '+880 1912-345678',
    email: 'legal@kabirsteel.com.bd',
    address: 'Agrabad Commercial Area, Chattogram-4100',
    notes: 'Commercial recovery matter and Letter of Credit arbitration.',
    archived: false,
    createdAt: new Date('2024-02-01T09:00:00.000Z'),
    updatedAt: new Date('2024-02-01T09:00:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const SEED_CASES = [
  {
    id: 'case-001',
    firmId: 'firm-bd-001',
    clientId: 'client-001',
    fileSerial: 'F-2023-0045',
    caseNumber: 'Title Suit No. 45/2023',
    court: '1st Joint District Judge Court, Dhaka',
    matterType: 'Civil / Land Title Partition',
    description: 'Partition suit regarding inherited ancestral commercial property at Motijheel C/A.',
    plaintiff: 'Haji Mohammad Rafiqul Islam & Others',
    defendant: 'Azizur Rahman & 4 Others',
    ourRole: 'Plaintiff',
    plaintiffLawyer: 'Adv. Mahbubur Rahman',
    defendantLawyer: 'Adv. Shamsul Huda',
    responsibleLawyerId: 'user-owner-001',
    status: 'ongoing' as const,
    restricted: false,
    nextHearingAt: new Date('2026-10-15T04:30:00.000Z'),
    createdAt: new Date('2024-01-12T10:00:00.000Z'),
    updatedAt: new Date('2024-01-12T10:00:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'case-002',
    firmId: 'firm-bd-001',
    clientId: 'client-002',
    fileSerial: 'F-2023-0089',
    caseNumber: 'Special Criminal Revision No. 12/2024',
    court: 'High Court Division, Supreme Court of Bangladesh',
    matterType: 'Criminal Revision',
    description: 'Confidential corporate revision challenging interlocutory freezing order under Money Laundering Prevention Act.',
    plaintiff: 'State',
    defendant: 'Directors, Kabir Steel Mills Ltd',
    ourRole: 'Petitioner',
    plaintiffLawyer: 'Deputy Attorney General',
    defendantLawyer: 'Adv. Mahbubur Rahman',
    responsibleLawyerId: 'user-owner-001',
    status: 'ongoing' as const,
    restricted: true,
    nextHearingAt: new Date('2026-11-04T05:00:00.000Z'),
    createdAt: new Date('2024-02-15T11:00:00.000Z'),
    updatedAt: new Date('2024-02-15T11:00:00.000Z'),
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const ALL_PERMISSIONS = [
  'cases.view',
  'cases.create',
  'cases.edit',
  'cases.delete',
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
  'settings.manage',
  'users.manage',
  'restricted.view',
  'data.export',
];

export const DEFAULT_STAFF_PERMISSIONS = [
  'cases.view',
  'hearings.update',
  'clients.view',
  'appointments.view',
  'tasks.view',
  'tasks.complete',
  'files.view',
];

export async function getSeedUsers() {
  const salt = await bcrypt.genSalt(10);
  const ownerHash = await bcrypt.hash(SEED_PASSWORDS.owner, salt);
  const staffHash = await bcrypt.hash(SEED_PASSWORDS.staff, salt);

  return [
    {
      id: 'user-owner-001',
      firmId: 'firm-bd-001',
      name: 'Adv. Mahbubur Rahman',
      email: 'owner@firm.bd',
      passwordHash: ownerHash,
      role: 'Owner' as const,
      jobType: 'lawyer_senior' as const,
      jobTitleLabel: 'Senior Advocate & Head of Chamber',
      reportsToUserId: null,
      permissions: ALL_PERMISSIONS,
      language: 'en' as const,
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    },
    {
      id: 'user-staff-002',
      firmId: 'firm-bd-001',
      name: 'Adv. Nusrat Jahan',
      email: 'staff@firm.bd',
      passwordHash: staffHash,
      role: 'Staff' as const,
      jobType: 'other' as const,
      jobTitleLabel: 'Associate',
      reportsToUserId: null,
      permissions: DEFAULT_STAFF_PERMISSIONS,
      language: 'en' as const,
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    },
  ];
}

export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: Database seeding is forbidden in production environment (NODE_ENV=production).');
    process.exit(1);
  }
}

export async function seedDatabase(databaseUrl?: string): Promise<void> {
  assertNotProduction();

  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.log('[Seed] No DATABASE_URL provided, skipping PostgreSQL database seed.');
    return;
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    console.log('[Seed] Seeding PostgreSQL database...');

    for (const plan of SEED_PLANS) {
      await client.query(
        `INSERT INTO plans (id, name, duration_months, price_bdt, seats, features, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [plan.id, plan.name, plan.durationMonths, plan.priceBdt, plan.seats, JSON.stringify(plan.features), plan.createdAt, plan.updatedAt, plan.createdBy, plan.updatedBy]
      );
    }

    for (const firm of SEED_FIRMS) {
      await client.query(
        `INSERT INTO firms (id, firm_id, name, bar_council_reg, office_address, court_affiliations, plan_id, contact, max_devices, device_policy, allow_owner_device_removal, license_starts_at, license_expires_at, status, visibility_mode, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET
           max_devices = EXCLUDED.max_devices,
           device_policy = EXCLUDED.device_policy,
           allow_owner_device_removal = EXCLUDED.allow_owner_device_removal,
           visibility_mode = EXCLUDED.visibility_mode,
           license_expires_at = EXCLUDED.license_expires_at,
           status = EXCLUDED.status`,
        [firm.id, firm.firmId, firm.name, firm.barCouncilReg, firm.officeAddress, firm.courtAffiliations, firm.planId, firm.contact, firm.maxDevices, firm.devicePolicy, firm.allowOwnerDeviceRemoval, firm.licenseStartsAt, firm.licenseExpiresAt, firm.status, firm.visibilityMode, firm.createdAt, firm.updatedAt, firm.createdBy, firm.updatedBy]
      );
    }

    const users = await getSeedUsers();
    for (const user of users) {
      await client.query(
        `INSERT INTO users (id, firm_id, name, email, password_hash, role, job_type, job_title_label, reports_to_user_id, permissions, language, active, failed_login_attempts, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           permissions = EXCLUDED.permissions,
           active = EXCLUDED.active,
           failed_login_attempts = 0,
           locked_until = NULL`,
        [user.id, user.firmId, user.name, user.email, user.passwordHash, user.role, user.jobType, user.jobTitleLabel, user.reportsToUserId, JSON.stringify(user.permissions), user.language, user.active, user.failedLoginAttempts, user.createdAt, user.updatedAt, user.createdBy, user.updatedBy]
      );
    }

    for (const c of SEED_CLIENTS) {
      await client.query(
        `INSERT INTO clients (id, firm_id, name, name_bn, phone, email, address, notes, archived, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.firmId, c.name, c.nameBn, c.phone, c.email, c.address, c.notes, c.archived, c.createdAt, c.updatedAt, c.createdBy, c.updatedBy]
      );
    }

    for (const cs of SEED_CASES) {
      await client.query(
        `INSERT INTO cases (id, firm_id, client_id, file_serial, case_number, court, matter_type, description, plaintiff, defendant, our_role, plaintiff_lawyer, defendant_lawyer, responsible_lawyer_id, status, restricted, next_hearing_at, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (id) DO NOTHING`,
        [cs.id, cs.firmId, cs.clientId, cs.fileSerial, cs.caseNumber, cs.court, cs.matterType, cs.description, cs.plaintiff, cs.defendant, cs.ourRole, cs.plaintiffLawyer, cs.defendantLawyer, cs.responsibleLawyerId, cs.status, cs.restricted, cs.nextHearingAt, cs.createdAt, cs.updatedAt, cs.createdBy, cs.updatedBy]
      );
    }

    console.log('[Seed] Database seeded successfully.');
  } catch (err) {
    console.error('[Seed] Failed to seed database:', err);
    throw err;
  } finally {
    await client.end();
  }
}

const isMain =
  Boolean(process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js'));

if (isMain) {
  assertNotProduction();
  seedDatabase().catch((err) => {
    console.error('[Seed] Seeding failed:', err);
    process.exit(1);
  });
}
