import { Router, Response } from 'express';
import { loginUser } from '../services/authService.js';
import { authMiddleware, AuthenticatedRequest, revokeToken, generateAccessToken } from '../middleware/auth.js';
import { evaluateServerSubscription, enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { recordAudit } from '../services/auditService.js';

export const authRouter = Router();

// POST /login
authRouter.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, deviceName } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email and password are required.',
    });
  }

  const rawDeviceKey = req.cookies?.device_key;
  const userAgent = req.headers['user-agent'] as string | undefined;

  const result = await loginUser(email, password, req.ip, {
    rawDeviceKey,
    userAgent,
    deviceName,
  });

  // Always set or refresh the device_key httpOnly cookie if returned
  if ((result as any).deviceKey) {
    res.cookie('device_key', (result as any).deviceKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  }

  if (result.status !== 200) {
    return res.status(result.status).json({
      error: result.error,
      code: (result as any).code,
      message: result.message,
      device: (result as any).device,
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
    device: (result as any).device,
  });
});

// POST /logout
authRouter.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  // Invalidate token server-side
  const token = req.cookies?.access_token;
  if (token) {
    revokeToken(token);
  }

  // Clear access_token cookie (keep device_key so browser identity is preserved across logouts)
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
  const freshToken = generateAccessToken(req.user, req.device);
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
      jobType: req.user.jobType || (req.user.role === 'Owner' ? 'lawyer_senior' : 'other'),
      jobTitleLabel: req.user.jobTitleLabel ?? null,
      reportsToUserId: req.user.reportsToUserId ?? null,
      permissions: req.user.permissions,
      language: req.user.language,
      active: req.user.active,
      mustChangePassword: req.user.mustChangePassword,
    },
    firm: req.firm,
    subscription,
  });
});

// POST /change-password
authRouter.post(
  '/change-password',
  authMiddleware,
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Current password and new password are required.',
    });
  }

  const { validatePasswordStrength } = await import('../services/authService.js');
  const strength = validatePasswordStrength(newPassword);
  if (!strength.isValid) {
    return res.status(400).json({
      error: 'Bad Request',
      message: strength.message,
    });
  }

  const bcrypt = (await import('bcryptjs')).default;
  const isMatch = await bcrypt.compare(currentPassword, req.user!.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Current password is incorrect.',
    });
  }

  const { getDatabase } = await import('../db/client.js');
  const db = getDatabase();
  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);
  await db.updateUser(req.user!.id, {
    passwordHash: newHash,
    mustChangePassword: false,
  });

  return res.status(200).json({
    message: 'Password changed successfully.',
  });
});
