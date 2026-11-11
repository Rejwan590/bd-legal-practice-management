import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

const ITERATIONS = 100000;
const KEY_LEN_BYTES = 64;
const HASH_PREFIX = '$pbkdf2-sha512$v=1';

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-512' },
    passwordKey,
    KEY_LEN_BYTES * 8
  );
  const toHex = (buf) => Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${HASH_PREFIX}$i=${ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(derivedBits))}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function promptQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function runD1SqlFile(sqlText, isRemote) {
  const tmpFile = path.join(os.tmpdir(), `bdlegal-d1-seed-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sqlText, 'utf8');
  try {
    const targetFlag = isRemote ? '--remote' : '--local';
    const cwd = path.resolve(import.meta.dirname, '..');
    const wranglerEntry = path.join(cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const out = execFileSync(
      process.execPath,
      [wranglerEntry, 'd1', 'execute', 'bdlegal-d1-prod', targetFlag, '--file', tmpFile],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return out;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

async function main() {
  const isRemote = !process.argv.includes('--local');
  const seedPlans = process.argv.includes('--plans');
  const createAdmin = process.argv.includes('--create-admin');

  if (!seedPlans && !createAdmin) {
    console.log('Usage: node scripts/seedRemote.mjs [--plans] [--create-admin --email <email> [--password <pass>]] [--remote|--local]');
    process.exit(1);
  }

  const sqlStatements = [];

  if (seedPlans) {
    const featuresJson = JSON.stringify(['cases', 'hearings', 'tasks', 'files', 'calendar', 'backup', 'audit']);
    const plans = [
      ['solo', 'Solo', 1, 599, 2, 2, 2, 'active'],
      ['chamber', 'Chamber', 1, 1299, 5, 5, 5, 'active'],
      ['professional', 'Professional', 1, 2499, 12, 12, 10, 'active'],
      ['annual-standard', 'Chambers Annual License (Legacy)', 12, 50000, 10, 10, 5, 'archived'],
    ];

    for (const [id, name, duration, price, seats, incUsers, incDevices, status] of plans) {
      sqlStatements.push(
        `INSERT OR IGNORE INTO plans (id, name, duration_months, price_bdt, seats, included_users, included_devices, extra_user_price_bdt, extra_device_price_bdt, status, features, created_at, updated_at, created_by, updated_by) VALUES (${sqlString(id)}, ${sqlString(name)}, ${duration}, ${price}, ${seats}, ${incUsers}, ${incDevices}, 100, 100, ${sqlString(status)}, ${sqlString(featuresJson)}, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 'system', 'system');`
      );
    }
  }

  if (createAdmin) {
    let email = getArg('--email') || process.env.ADMIN_EMAIL || '';
    if (!email) {
      email = (await promptQuestion('Platform Admin Email: ')).trim();
    }
    if (!email || !email.includes('@')) {
      throw new Error('Valid platform admin email required.');
    }

    let password = getArg('--password') || process.env.ADMIN_PASSWORD || '';
    if (!password) {
      password = (await promptQuestion('Platform Admin Password (min 14 chars): ')).trim();
    }
    if (password.length < 14) {
      throw new Error('Platform admin password must be at least 14 characters (Rule 15).');
    }

    const adminId = crypto.randomUUID();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    sqlStatements.push(
      `INSERT INTO platform_admins (id, email, password_hash, active, failed_attempts, created_at, updated_at) VALUES (${sqlString(adminId)}, ${sqlString(email.toLowerCase())}, ${sqlString(hash)}, 1, 0, ${sqlString(now)}, ${sqlString(now)}) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, active = 1, failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at;`
    );
  }

  console.log(`Applying ${sqlStatements.length} statement(s) to bdlegal-d1-prod (${isRemote ? 'remote' : 'local'})...`);
  const output = runD1SqlFile(sqlStatements.join('\n'), isRemote);
  console.log(output);
  console.log('Done.');
}

main().catch((err) => {
  console.error('[seedRemote Error]', err.message);
  process.exit(1);
});
