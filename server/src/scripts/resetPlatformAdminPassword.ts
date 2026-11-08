import readline from 'readline';
import { Writable } from 'stream';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';

try {
  await import('dotenv/config');
} catch {
  // Ignored in environments where dotenv is omitted
}

export const MIN_PASSWORD_LENGTH = 14;

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

export async function main() {
  console.log('\n=== Reset Platform Super Admin Password ===');
  console.log('NOTE: Credentials must be entered via interactive prompt.\n');

  try {
    const email = await prompt('Enter platform admin email: ');
    if (!email) {
      console.error('Error: Email cannot be empty.');
      process.exit(1);
    }

    const db = getDatabase();
    const admin = await db.getPlatformAdminByEmail(email.toLowerCase());
    if (!admin) {
      console.error(`\n[ERROR] Platform admin with email "${email}" not found.\n`);
      process.exit(1);
    }

    const newPassword = await prompt(`Enter new password (minimum ${MIN_PASSWORD_LENGTH} characters): `, true);
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      console.error(`\n[ERROR] Password must be at least ${MIN_PASSWORD_LENGTH} characters long.\n`);
      process.exit(1);
    }

    const confirmPassword = await prompt('Confirm new password: ', true);
    if (newPassword !== confirmPassword) {
      console.error('\n[ERROR] Passwords do not match. Aborting.\n');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.updatePlatformAdmin(admin.id, {
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
    });

    await recordAdminAudit({
      adminId: admin.id,
      action: 'PLATFORM_ADMIN_PASSWORD_RESET',
      new: {
        email: admin.email,
        resetAt: new Date().toISOString(),
      },
    });

    console.log(`\n[SUCCESS] Platform super admin password reset successfully!`);
    console.log(`Email: ${admin.email}`);
    console.log(`Failed login attempts cleared to 0.\n`);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[ERROR] Failed to reset password: ${message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('resetPlatformAdminPassword.ts') || process.argv[1].endsWith('resetPlatformAdminPassword.js'))) {
  main();
}
