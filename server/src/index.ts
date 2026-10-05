import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { validateStartupConfig } from './config.js';

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    // Validate configuration at startup (not at module import time)
    validateStartupConfig();

    // Migrations must be run as a separate command (npm run db:migrate in production).
    // In local development with a live DATABASE_URL, run migrations automatically for convenience.
    if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
      await runMigrations();
    }

    const app = createApp();
    app.listen(PORT, () => {
      console.log(`[BD Legal Server] Step 3.0 Foundation running on port ${PORT}`);
      console.log(`[BD Legal Server] Health check: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BD Legal Server] Fatal startup error:', message);
    process.exit(1);
  }
}

bootstrap();
