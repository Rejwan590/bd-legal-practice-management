import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';

import { Env } from './middleware/auth';
import { authRouter } from './routes/auth';
import { firmsRouter } from './routes/firms';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { casesRouter } from './routes/cases';
import { hearingsRouter } from './routes/hearings';
import { tasksRouter } from './routes/tasks';
import { appointmentsRouter } from './routes/appointments';
import { auditRouter } from './routes/audit';
import { devicesRouter } from './routes/devices';
import { accountsRouter } from './routes/accounts';
import { feeAgreementsRouter } from './routes/feeAgreements';
import { feePaymentsRouter } from './routes/feePayments';
import { expensesRouter } from './routes/expenses';
import { chamberExpensesRouter } from './routes/chamberExpenses';
import { adminRouter } from './routes/admin';

const app = new Hono<{ Bindings: Env }>();

// 1. Request ID & Structured Logging
app.use('*', requestId());
app.use('*', logger());

// 2. Security Headers (Helmet parity)
app.use('*', secureHeaders({
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
}));

// 3. Strict CORS Middleware with Dynamic Origin Verification
app.use('*', async (c, next) => {
  const envOrigins = (c.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      const allowedOrigins = [
        ...envOrigins,
        'https://bd-legal-practice-management.vercel.app',
        'https://bdlegal-app.pages.dev',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:5174',
      ];
      if (allowedOrigins.includes(origin)) return origin;
      // Allow Cloudflare Pages preview subdomains only for this Pages project.
      if (/^https:\/\/[a-z0-9-]+\.bdlegal-app\.pages\.dev$/.test(origin)) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Range', 'X-Total-Count', 'ETag'],
    credentials: true,
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// 4. Health Check Endpoints
const healthHandler = (c: any) =>
  c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'production',
  });

app.get('/api/v1/health', healthHandler);
app.get('/health', healthHandler);

// 5. Mount Sub-Routers (Full Express & REST Parity)
app.route('/auth', authRouter);
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/firms', firmsRouter);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/clients', clientsRouter);
app.route('/api/v1/cases', casesRouter);
app.route('/api/v1/hearings', hearingsRouter);
app.route('/api/v1/tasks', tasksRouter);
app.route('/api/v1/appointments', appointmentsRouter);
app.route('/api/v1/audit-log', auditRouter);
app.route('/api/v1/devices', devicesRouter);
app.route('/api/v1/accounts', accountsRouter);
app.route('/api/v1/fee-agreements', feeAgreementsRouter);
app.route('/api/v1/fee-payments', feePaymentsRouter);
app.route('/api/v1/expenses', expensesRouter);
app.route('/api/v1/chamber-expenses', chamberExpensesRouter);
app.route('/api/admin', adminRouter);
app.route('/api/v1/admin', adminRouter);

// 6. Global 404 Handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: `Route ${c.req.path} not found` }, 404);
});

// 7. Global Error Handler
app.onError((err, c) => {
  console.error('[Cloudflare Worker Exception]', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  }, 500);
});

export default app;
