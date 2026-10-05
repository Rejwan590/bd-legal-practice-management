import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/**
 * Runs versioned Drizzle migrations against PostgreSQL using the official
 * Drizzle migrator. This maintains the __drizzle_migrations table as the
 * single migration history authority.
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.log('[Migrations] No DATABASE_URL provided, skipping PostgreSQL migrations.');
    return;
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    console.log('[Migrations] Running Drizzle versioned migrations on PostgreSQL...');
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('[Migrations] Drizzle migrations applied successfully with history table updated.');
  } catch (err) {
    console.error('[Migrations] Failed to run migrations:', err);
    throw err;
  } finally {
    await client.end();
  }
}

// Standalone CLI invocation
if (process.argv[1] && (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'))) {
  runMigrations()
    .then(() => {
      console.log('[Migrations] Migration command finished cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migrations] Migration process exited with error:', err);
      process.exit(1);
    });
}
