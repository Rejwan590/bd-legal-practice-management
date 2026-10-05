import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { firmsRouter } from './routes/firms.js';
import { auditRouter } from './routes/audit.js';
import { clientsRouter } from './routes/clients.js';
import { casesRouter } from './routes/cases.js';
import { adminAuthRouter } from './routes/adminAuth.js';
import { adminFirmsRouter } from './routes/adminFirms.js';
import { validateStartupConfig } from './config.js';

export function createApp() {
  validateStartupConfig();

  const app = express();

  // Basic security and parsing middlewares
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());

  // Mount health check at both root and /api/v1
  app.use('/api/v1', healthRouter);
  app.use('/', healthRouter);

  // Mount auth routes at both /auth and /api/v1/auth (per prompt specifications)
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // Mount platform super admin routes
  app.use('/api/admin/auth', adminAuthRouter);
  app.use('/api/admin/firms', adminFirmsRouter);

  // Domain resources under /api/v1
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/firms', firmsRouter);
  app.use('/api/v1/clients', clientsRouter);
  app.use('/api/v1/cases', casesRouter);
  app.use('/api/v1/audit-log', auditRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'NotFound', message: `Route ${req.method} ${req.path} not found` });
  });

  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'InternalServerError', message: 'An unexpected error occurred.' });
  });

  return app;
}
