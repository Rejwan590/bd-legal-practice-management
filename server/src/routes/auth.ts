import { Router, Response } from 'express';
import { loginUser } from '../services/authService.js';
import { authMiddleware, AuthenticatedRequest, revokeToken, generateAccessToken } from '../middleware/auth.js';
import { evaluateServerSubscription } from '../middleware/subscription.js';
import { recordAudit } from '../services/auditService.js';

export const authRouter = Router();

// POST /login
authRouter.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email and password are required.',
    });
  }

  const result = await loginUser(email, password, req.ip);

  if (result.status !== 200) {
    return res.status(result.status).json({
      error: result.error,
      code: (result as any).code,
      message: result.message,
    });
  }

  // Set httpOnly access token cookie
  res.cookie('access_token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  return res.status(200).json({
    user: result.user,
    firm: result.firm,
    subscription: result.firm ? evaluateServerSubscription(result.firm) : null,
  });
});

// POST /logout
authRouter.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  // Invalidate token server-side
  const token = req.cookies?.access_token;
  if (token) {
    revokeToken(token);
  }

  // Clear cookie
  res.clearCookie('access_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return res.status(200).json({ message: 'Logged out successfully' });
});

// GET /me
authRouter.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !req.firm) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Slide session: re-issue fresh access_token cookie to prevent sudden 15-minute logouts
  const freshToken = generateAccessToken(req.user);
  res.cookie('access_token', freshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });

  const subscription = evaluateServerSubscription(req.firm);

  return res.status(200).json({
    user: {
      id: req.user.id,
      firmId: req.user.firmId,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      permissions: req.user.permissions,
      language: req.user.language,
      active: req.user.active,
    },
    firm: req.firm,
    subscription,
  });
});
