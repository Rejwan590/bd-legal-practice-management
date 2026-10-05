import { parseArgs } from 'util';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';

export async function executeAdminLicenseChange(args: {
  firmId: string;
  months?: number;
  status?: 'active' | 'suspended';
}) {
  if (process.env.ADMIN_CONFIRM !== 'yes') {
    throw new Error('ADMIN_CONFIRM=yes environment variable is required to execute license changes.');
  }

  const { firmId, months, status } = args;
  if (!firmId) {
    throw new Error('--firm <id> is required.');
  }

  if (months !== undefined) {
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      throw new Error('--months must be an integer between 1 and 36.');
    }
  }

  if (status !== undefined) {
    if (status !== 'active' && status !== 'suspended') {
      throw new Error('--status must be either "active" or "suspended".');
    }
  }

  if (months === undefined && status === undefined) {
    throw new Error('At least one of --months <1-36> or --status <active|suspended> must be specified.');
  }

  const db = getDatabase();
  const firm = await db.getFirm(firmId);
  if (!firm) {
    throw new Error(`Firm not found with id: ${firmId}`);
  }

  const updates: Partial<schema.Firm> = {};
  const oldValues = {
    status: firm.status,
    licenseExpiresAt: firm.licenseExpiresAt,
  };

  if (months !== undefined) {
    const currentExpiry = new Date(firm.licenseExpiresAt);
    const now = new Date();
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + months);
    updates.licenseExpiresAt = newExpiry;
    if (!status && firm.status !== 'active') {
      updates.status = 'active';
    }
  }

  if (status !== undefined) {
    updates.status = status;
  }

  const updatedFirm = await db.updateFirm(firmId, updates);

  await recordAudit({
    firmId,
    userId: 'system-admin',
    userName: 'system-admin',
    entity: 'Firm',
    entityId: firmId,
    action: 'ADMIN_LICENSE_UPDATE',
    oldValue: oldValues,
    newValue: updates,
  });

  return updatedFirm;
}

async function main() {
  const { values } = parseArgs({
    options: {
      firm: { type: 'string' },
      months: { type: 'string' },
      status: { type: 'string' },
    },
    allowPositionals: false,
  });

  const firmId = values.firm || '';
  const months = values.months !== undefined ? parseInt(values.months, 10) : undefined;
  const status = values.status as 'active' | 'suspended' | undefined;

  try {
    const updated = await executeAdminLicenseChange({ firmId, months, status });
    console.log(`Success: License updated for firm ${firmId}.`);
    console.log(`  New Status: ${updated.status}`);
    console.log(`  New Expiry: ${new Date(updated.licenseExpiresAt).toISOString()}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

// If executed directly from CLI
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  main();
}
