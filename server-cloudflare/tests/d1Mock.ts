import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createInMemoryD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');

  // Load and apply initial D1 migration
  let migrationPath = path.resolve('server-cloudflare/migrations/0000_complete_magneto.sql');
  if (!fs.existsSync(migrationPath)) {
    migrationPath = path.resolve('migrations/0000_complete_magneto.sql');
  }
  if (fs.existsSync(migrationPath)) {
    const ddl = fs.readFileSync(migrationPath, 'utf8');
    const statements = ddl.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  }

  function createPreparedStatement(sqlText: string, boundParams: any[] = []): D1PreparedStatement {
    return {
      bind(...values: any[]) {
        const cleanValues = values.map((v) => {
          if (typeof v === 'boolean') return v ? 1 : 0;
          if (v === undefined) return null;
          return v;
        });
        return createPreparedStatement(sqlText, cleanValues);
      },
      async all<T = unknown>() {
        const stmt = sqlite.prepare(sqlText);
        const rows = stmt.all(...boundParams) as T[];
        return {
          results: rows,
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: rows.length, rows_written: 0 },
        };
      },
      async first<T = unknown>(colName?: string) {
        const stmt = sqlite.prepare(sqlText);
        const row = stmt.get(...boundParams) as any;
        if (!row) return null;
        if (colName) return row[colName] as T;
        return row as T;
      },
      async run() {
        const stmt = sqlite.prepare(sqlText);
        const info = stmt.run(...boundParams);
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
            rows_read: 0,
            rows_written: Number(info.changes),
          },
        };
      },
      async raw<T = unknown>() {
        const stmt = sqlite.prepare(sqlText);
        const rows = stmt.all(...boundParams) as Record<string, any>[];
        // Cloudflare D1 .raw() returns array of arrays: [[val1, val2], [val1, val2]]
        return rows.map((r) => Object.values(r)) as T[];
      },
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(query: string) {
      return createPreparedStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      sqlite.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const res = await s.all();
          results.push(res);
        }
        sqlite.exec('COMMIT');
        return results as D1Result<T>[];
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
    dump() {
      throw new Error('Not implemented');
    },
  } as unknown as D1Database;
}
