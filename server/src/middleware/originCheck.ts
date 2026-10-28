import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF / Origin Protection Middleware
 *
 * For non-GET/HEAD/OPTIONS requests on protected API and auth routes, verifies that
 * the incoming Origin header (or Referer as fallback) matches one of the configured
 * CORS_ORIGIN values. Blocks foreign origins and missing origins on cookie-authenticated
 * mutating requests with HTTP 403 Forbidden.
 */
export function originCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Safe methods are unaffected
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 2. Health check route is never blocked
  if (
    req.path === '/health' ||
    req.path === '/api/v1/health' ||
    req.originalUrl.includes('/health')
  ) {
    return next();
  }

  // 3. Resolve configured CORS origins
  const isProduction = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:3000,http://localhost:3001');
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // 4. Resolve Origin or Referer fallback
  const originHeader = req.headers.origin as string | undefined;
  let requestOrigin = originHeader;

  if (!requestOrigin && req.headers.referer) {
    try {
      requestOrigin = new URL(req.headers.referer).origin;
    } catch {
      requestOrigin = undefined;
    }
  }

  // 5. If Origin or Referer is present, it MUST match one of the allowed origins
  if (requestOrigin) {
    if (allowedOrigins.includes(requestOrigin)) {
      return next();
    }
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cross-origin request rejected: Origin does not match allowed CORS_ORIGIN.',
    });
  }

  // 6. If Origin and Referer are MISSING:
  const hasCookieAuth = Boolean(
    req.cookies?.access_token ||
    req.cookies?.admin_access_token ||
    (typeof req.headers.cookie === 'string' &&
      (req.headers.cookie.includes('access_token=') ||
        req.headers.cookie.includes('admin_access_token=')))
  );

  const isSameSiteNone = (process.env.COOKIE_SAMESITE || '').trim().toLowerCase() === 'none';

  // In production, or cross-site mode (SameSite=none), cookie-authenticated mutations require Origin/Referer
  if (hasCookieAuth && (isProduction || isSameSiteNone)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin or Referer header required for cookie-authenticated mutating requests.',
    });
  }

  // In production, all mutating requests require Origin/Referer
  if (isProduction && allowedOrigins.length > 0) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Origin or Referer header required for mutating requests in production.',
    });
  }

  return next();
}
