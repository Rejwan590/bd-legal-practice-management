import readline from 'readline';
import { Writable } from 'stream';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';
import * as schema from '../db/schema.js';

// Optional dotenv load for local development without requiring it in production environments (e.g. Azure App Service)
try {
  await import('dotenv/config');
} catch {
  // Ignored in environments where dotenv is omitted or DATABASE_URL comes from environment settings
}

export const MIN_PASSWORD_LENGTH = 14;

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export async function prompt(question: string, hideInput = false): Promise<string> {
  if (!hideInput) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  // When hideInput is true, suppress echoing characters to stdout while keeping prompt question visible
  const muted = { value: false };
  const mutableStdout = new Writable({
    write(chunk, encoding, callback) {
      if (!muted.value) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: Boolean(process.stdin.isTTY),
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted.value = true;
  });
}

/**
 * Creates a platform admin record in the database.
 * Enforces email validation, min 14 char password, bcrypt hashing, and single-execution per email.
 */
export async function createPlatformAdmin(
  emailInput: string,
  passwordInput: string
): Promise<schema.PlatformAdmin> {
  const email = (emailInput || '').trim().toLowerCase();
  const password = passwordInput || '';

  if (!email || !validateEmail(email)) {
    throw new Error('Invalid email address format.');
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const db = getDatabase();
  const existing = await db.getPlatformAdminByEmail(email);
  if (existing) {
    throw new Error(`Platform admin with email "${email}" already exists. Refusing duplicate creation.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newAdmin = await db.insertPlatformAdmin({
    email,
    passwordHash,
    active: true,
    failedAttempts: 0,
    lockedUntil: null,
  });

  // Record action in adminAudit
  await recordAdminAudit({
    adminId: newAdmin.id,
    action: 'PLATFORM_ADMIN_CREATED',
    new: {
      email: newAdmin.email,
      active: newAdmin.active,
    },
  });

  return newAdmin;
}

export async function main() {
  console.log('\n=== Create Platform Super Admin ===');
  console.log('NOTE: Credentials must be entered via interactive prompt (command arguments and files are ignored).\n');

  // Explicitly ignore any command-line arguments to strictly enforce interactive prompt input
  if (process.argv.length > 2) {
    console.warn('[Warning] Command line arguments detected and ignored. Credentials will only be read from prompts.\n');
  }

  try {
    const email = await prompt('Enter platform admin email: ');
    if (!email) {
      console.error('Error: Email cannot be empty.');
      process.exit(1);
    }

    const password = await prompt(`Enter platform admin password (minimum ${MIN_PASSWORD_LENGTH} characters): `, true);
    if (!password) {
      console.error('Error: Password cannot be empty.');
      process.exit(1);
    }

    const admin = await createPlatformAdmin(email, password);
    console.log(`\n[SUCCESS] Platform super admin created successfully!`);
    console.log(`ID:    ${admin.id}`);
    console.log(`Email: ${admin.email}\n`);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[ERROR] Failed to create platform admin: ${message}\n`);
    process.exit(1);
  }
}

// Auto-run if executed directly as a script
if (process.argv[1] && (process.argv[1].endsWith('createPlatformAdmin.ts') || process.argv[1].endsWith('createPlatformAdmin.js'))) {
  main();
}
