import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';

import { Env } from './middleware/auth';
import { authRouter } from './routes/auth';
import { clientsRouter } from './routes/clients';
import { casesRouter } from './routes/cases';
import { hearingsRouter } from './routes/hearings';
import { accountsRouter } from './routes/accounts';
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
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      const allowedOrigins = [
        c.env.CORS_ORIGIN,
        'https://bd-legal-practice-management.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
      ].filter(Boolean);

      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Range', 'X-Total-Count', 'ETag'],
    credentials: true,
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// 4. Health Check Endpoint
app.get('/api/v1/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'production',
  });
});

// 5. Mount Sub-Routers
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/clients', clientsRouter);
app.route('/api/v1/cases', casesRouter);
app.route('/api/v1/hearings', hearingsRouter);
app.route('/api/v1/accounts', accountsRouter);
app.route('/api/admin', adminRouter);

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
