import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { generateAdminAccessToken } from '../middleware/adminAuth.js';

// Pre-computed dummy hash to defend against timing attacks when admin is not found
const DUMMY_ADMIN_HASH = '$2a$10$wT8m9L4oW7e8A5k5u5w5e.k5u5w5e.k5u5w5e.k5u5w5e.k5u5w5e';

export const ADMIN_LOCKOUT_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface AdminLoginResult {
  status: number;
  data?: {
    admin: schema.PlatformAdmin;
    token: string;
  };
  error?: string;
  code?: string;
  message?: string;
}

export async function loginPlatformAdmin(
  emailInput: string,
  passwordInput: string
): Promise<AdminLoginResult> {
  const email = (emailInput || '').trim().toLowerCase();
  const password = passwordInput || '';

  if (!email || !password) {
    return {
      status: 400,
      error: 'BadRequest',
      message: 'Email and password are required.',
    };
  }

  const db = getDatabase();
  const admin = await db.getPlatformAdminByEmail(email);

  if (!admin) {
    // Constant-time dummy hash comparison against timing attack user enumeration
    await bcrypt.compare(password, DUMMY_ADMIN_HASH);
    return {
      status: 401,
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    };
  }

  // Check lockout
  if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
    return {
      status: 429,
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: 'Too many attempts, try again later',
    };
  }

  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

  if (!isPasswordValid) {
    const nextAttempts = (admin.failedAttempts || 0) + 1;
    let lockedUntil: Date | null = null;

    if (nextAttempts >= ADMIN_LOCKOUT_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + ADMIN_LOCKOUT_DURATION_MS);
    }

    await db.incrementPlatformAdminFailedLogin(admin.id, lockedUntil);

    return {
      status: 401,
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    };
  }

  if (!admin.active) {
    return {
      status: 401,
      error: 'Unauthorized',
      message: 'Platform admin account is inactive.',
    };
  }

  // Successful login -> reset failed attempts
  await db.resetPlatformAdminFailedLogin(admin.id);

  const token = generateAdminAccessToken(admin);

  return {
    status: 200,
    data: {
      admin,
      token,
    },
  };
}
