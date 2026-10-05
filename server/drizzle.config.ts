import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://bd_legal_user:bd_legal_secret_password@127.0.0.1:5432/bd_legal_db',
  },
  strict: true,
  verbose: true,
});
