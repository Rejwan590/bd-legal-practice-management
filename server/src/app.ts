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
import { adminDevicesRouter } from './routes/adminDevices.js';
import { devicesRouter } from './routes/devices.js';
import { validateStartupConfig } from './config.js';

export function createApp() {
  validateStartupConfig();

  const app = express();

  // Trust proxy configuration (do not hardcode: 0 default, 2 behind Cloudflare + Caddy)
  const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
  app.set('trust proxy', isNaN(trustProxyHops) ? 0 : trustProxyHops);

  // Basic security and parsing middlewares
  const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001';
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
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
  app.use('/api/admin', adminDevicesRouter);
  app.get('/api/admin/audit', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { adminAuthMiddleware } = await import('./middleware/adminAuth.js');
    return adminAuthMiddleware(req as any, res, async () => {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const { getDatabase } = await import('./db/client.js');
      const db = getDatabase();
      const logs = await db.listAdminAudit(limit, offset);
      res.json({ logs, limit, offset });
    });
  });

  // Domain resources under /api/v1
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/firms', firmsRouter);
  app.use('/api/v1/clients', clientsRouter);
  app.use('/api/v1/cases', casesRouter);
  app.use('/api/v1/devices', devicesRouter);
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
