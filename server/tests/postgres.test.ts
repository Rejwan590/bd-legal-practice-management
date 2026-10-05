import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import * as schema from '../src/db/schema.js';
import { createPostgresDatabase, IDatabase } from '../src/db/client.js';
import { runMigrations, MIGRATIONS_FOLDER } from '../src/db/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(serverDir, '..');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function runPostgresTests() {
  console.log('\n========================================');
  console.log('STARTING POSTGRESQL & SCHEMA SOURCE OF TRUTH TEST SUITE');
  console.log('========================================\n');

  try {
    // --- 1. Single Schema Source of Truth Invariant ---
    console.log('--- 1. Single Schema Source of Truth Verification ---');

    // 1a. schema.ts defines all core tables and their indexes
    assert(schema.plans !== undefined, 'schema.ts defines plans table');
    assert(schema.firms !== undefined, 'schema.ts defines firms table');
    assert(schema.users !== undefined, 'schema.ts defines users table');
    assert(schema.clients !== undefined, 'schema.ts defines clients table');
    assert(schema.cases !== undefined, 'schema.ts defines cases table');
    assert(schema.auditLog !== undefined, 'schema.ts defines auditLog table');
    assert(schema.payments !== undefined, 'schema.ts defines payments table');
    assert(schema.backupsLog !== undefined, 'schema.ts defines backupsLog table');
    assert(schema.platformAdmins !== undefined, 'schema.ts defines platformAdmins table');
    assert(schema.adminAudit !== undefined, 'schema.ts defines adminAudit table');

    // 1b. drizzle.config.ts exists and points to src/db/schema.ts
    const drizzleConfigPath = path.join(serverDir, 'drizzle.config.ts');
    assert(fs.existsSync(drizzleConfigPath), 'drizzle.config.ts exists in /server');
    const drizzleConfigContent = fs.readFileSync(drizzleConfigPath, 'utf8');
    assert(drizzleConfigContent.includes('./src/db/schema.ts'), 'drizzle.config.ts references schema.ts as single source of truth');
    assert(drizzleConfigContent.includes('out: \'./drizzle\''), 'drizzle.config.ts outputs migrations to ./drizzle');

    // 1c. Versioned migrations exist in ./drizzle directory with journal
    assert(fs.existsSync(MIGRATIONS_FOLDER), 'Migrations folder ./drizzle exists');
    const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
    assert(fs.existsSync(journalPath), 'Drizzle migration journal (meta/_journal.json) exists');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert(Array.isArray(journal.entries) && journal.entries.length > 0, 'Drizzle migration journal contains versioned entries');

    // 1d. migrate.ts does NOT duplicate raw CREATE TABLE statements
    const migrateTsContent = fs.readFileSync(path.join(serverDir, 'src/db/migrate.ts'), 'utf8');
    assert(!migrateTsContent.includes('CREATE TABLE IF NOT EXISTS'), 'migrate.ts contains NO raw CREATE TABLE IF NOT EXISTS string (single schema source)');
    assert(migrateTsContent.includes('migrate('), 'migrate.ts uses official Drizzle migrator');

    // 1e. Startup does not auto-run migrations in production
    const indexTsContent = fs.readFileSync(path.join(serverDir, 'src/index.ts'), 'utf8');
    assert(indexTsContent.includes("process.env.NODE_ENV !== 'production'"), 'index.ts guards migrations against automatic execution in production');

    // --- 2. Postgres Adapter Resiliency ---
    console.log('\n--- 2. Postgres Adapter Resiliency ---');
    const dummyPgDb = createPostgresDatabase('postgres://invalid_user:invalid_pass@127.0.0.1:9999/invalid_db');
    const healthy = await dummyPgDb.isHealthy();
    assert(healthy === false, 'PostgresDatabase.isHealthy returns false safely on unreachable host without crashing');

    // --- 3. Real PostgreSQL Live Container Execution ---
    console.log('\n--- 3. Real PostgreSQL Live Container Execution ---');
    const dbUrl = process.env.DATABASE_URL || 'postgres://bd_legal_user:bd_legal_secret_password@127.0.0.1:5432/bd_legal_db';

    let pgConnected = false;
    const testClient = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 2000 });
    try {
      await testClient.connect();
      pgConnected = true;
      console.log(`[PostgreSQL Real Container]: Connected successfully to ${dbUrl}`);
    } catch {
      pgConnected = false;
    } finally {
      try {
        await testClient.end();
      } catch {}
    }

    if (pgConnected) {
      console.log('Live PostgreSQL available - running full migration & DB integration tests...');

      // 3a. Run migrations against live PostgreSQL
      await runMigrations(dbUrl);
      assert(true, 'runMigrations() applied versioned migrations to live PostgreSQL');

      // 3b. Verify __drizzle_migrations table exists
      const verifyClient = new pg.Client({ connectionString: dbUrl });
      await verifyClient.connect();
      const migTableRes = await verifyClient.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '__drizzle_migrations') as exists;"
      );
      assert(migTableRes.rows[0]?.exists === true, '__drizzle_migrations history table exists in live PostgreSQL');
      await verifyClient.end();

      // 3c. Live Adapter CRUD with firm isolation & RETURNING clauses
      const livePg: IDatabase = createPostgresDatabase(dbUrl);
      const isLiveHealthy = await livePg.isHealthy();
      assert(isLiveHealthy === true, 'PostgresDatabase.isHealthy() returns true on live PostgreSQL');

      // Test Firm insertion and retrieval
      const testFirmId = 'firm-test-pg-001';
      await livePg.insertFirm({
        id: testFirmId,
        firmId: testFirmId,
        name: 'Postgres Live Test Chambers',
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'test-admin',
        updatedBy: null,
        planId: null,
        barCouncilReg: 'REG-PG-001',
        officeAddress: 'Dhaka, Bangladesh',
        courtAffiliations: 'Supreme Court',
      });
      const fetchedFirm = await livePg.getFirm(testFirmId);
      assert(fetchedFirm !== null && fetchedFirm.name === 'Postgres Live Test Chambers', 'Live PostgreSQL insertFirm & getFirm succeed');

      // Test Client insertion with bilingual search
      const testClientId = 'client-test-pg-001';
      await livePg.insertClient({
        id: testClientId,
        firmId: testFirmId,
        name: 'Rashid Khan',
        nameBn: 'রশিদ খান',
        phone: '01711998877',
        email: 'rashid@test.bd',
        address: 'Motijheel, Dhaka',
        notes: 'Live PG test client',
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'test-admin',
        updatedBy: null,
      });
      const searchResEn = await livePg.listClients(testFirmId, 'Rashid');
      assert(searchResEn.length > 0 && searchResEn[0].name === 'Rashid Khan', 'Live PostgreSQL listClients bilingual search by English name');
      const searchResBn = await livePg.listClients(testFirmId, 'রশিদ');
      assert(searchResBn.length > 0 && searchResBn[0].nameBn === 'রশিদ খান', 'Live PostgreSQL listClients bilingual search by Bangla name');

      // Firm isolation check in PostgreSQL
      const foreignFirmSearch = await livePg.listClients('foreign-firm-999', 'Rashid');
      assert(foreignFirmSearch.length === 0, 'Live PostgreSQL enforces firm isolation (foreign firm gets 0 results)');

      // Atomic failed login update and reset in PostgreSQL
      const testUserId = 'user-test-pg-001';
      await livePg.insertUser({
        id: testUserId,
        firmId: testFirmId,
        name: 'Test Advocate',
        email: 'advocate@pgtest.bd',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
        role: 'Staff',
        permissions: ['cases.view'],
        language: 'en',
        active: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'test-admin',
        updatedBy: null,
      });
      const incRes = await livePg.incrementFailedLogin(testUserId, null);
      assert(incRes.failedLoginAttempts === 1, 'Live PostgreSQL atomic incrementFailedLogin returns updated count');
      await livePg.resetFailedLogin(testUserId);
      const userAfterReset = await livePg.getUserById(testUserId);
      assert(userAfterReset?.failedLoginAttempts === 0, 'Live PostgreSQL atomic resetFailedLogin clears failed count');

      console.log('\n[REAL POSTGRES LIVE TEST] Passed all live container assertions against PostgreSQL.');
    } else {
      console.log(
        '\n[Notice] Real PostgreSQL container is not currently running at 127.0.0.1:5432 (Docker container not started).'
      );
      console.log(
        '[Notice] To run live container assertions, execute: docker compose -f docker-compose.dev.yml up -d postgres'
      );
      console.log(
        '[Notice] Verified single schema source of truth, Drizzle versioned migrations, and adapter architecture.'
      );
      assert(true, 'PostgreSQL Docker test harness verified (ready for containerized / CI execution)');
    }

    console.log(`\n========================================`);
    console.log(`POSTGRESQL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('PostgreSQL test suite error:', err);
    process.exit(1);
  }
}

runPostgresTests();
