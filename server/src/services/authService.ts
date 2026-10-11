import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/client.js';
import { generateAccessToken } from '../middleware/auth.js';
import { recordAudit } from './auditService.js';
import * as schema from '../db/schema.js';

// Pre-computed constant-time bcrypt comparison hash for non-existent users (salt rounds = 10)
const DUMMY_HASH = '$2a$10$wT8mQ3p0K7vIuL/R.c4WaeU7o87XQvL1L3qXv9t5Y5Uu4cWp6eQGq';

interface ThrottleState {
  failedAttempts: number;
  nextAllowedAt: number;
}

const ipThrottles = new Map<string, ThrottleState>();
const accountThrottles = new Map<string, ThrottleState>();

/**
 * Calculates exponential backoff delay in milliseconds.
 * - Attempts < 5: 0ms delay (retries allowed immediately)
 * - Attempt 5: 1s delay
 * - Attempt 6: 2s delay
 * - Attempt 7: 4s delay
 * - Attempt 8: 8s delay
 * ... capped at 15 minutes (900 seconds)
 */
export function calculateBackoffMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  const delaySec = Math.pow(2, failedAttempts - 5);
  const maxSec = 15 * 60; // 15 minutes
  return Math.min(delaySec, maxSec) * 1000;
}

export function resetLoginThrottles(ip?: string, email?: string): void {
  if (ip) {
    ipThrottles.delete(ip);
  } else if (!email) {
    ipThrottles.clear();
  }
  if (email) {
    accountThrottles.delete(email.toLowerCase().trim());
  } else if (!ip) {
    accountThrottles.clear();
  }
}

export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one number.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one special character.' };
  }
  return { isValid: true };
}

export async function loginUser(
  email: string,
  password: string,
  ipAddress?: string,
  deviceOptions?: {
    rawDeviceKey?: string;
    userAgent?: string;
    deviceName?: string;
  }
) {
  const db = getDatabase();
  const trimmedEmail = email.trim().toLowerCase();
  const now = Date.now();

  // 1. Check IP Throttle
  if (ipAddress) {
    const ipRecord = ipThrottles.get(ipAddress);
    if (ipRecord && now < ipRecord.nextAllowedAt) {
      return {
        status: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many attempts, try again later',
      };
    }
  }

  // 2. Check Account Throttle (in-memory)
  const acctRecord = accountThrottles.get(trimmedEmail);
  if (acctRecord && now < acctRecord.nextAllowedAt) {
    return {
      status: 429,
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: 'Too many attempts, try again later',
    };
  }

  const user = await db.getUserByEmail(trimmedEmail);

  // 3. Unknown user -> constant-time dummy hash comparison & IP/account throttling
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);

    if (ipAddress) {
      const ipRecord = ipThrottles.get(ipAddress) || { failedAttempts: 0, nextAllowedAt: 0 };
      ipRecord.failedAttempts += 1;
      const delayMs = calculateBackoffMs(ipRecord.failedAttempts);
      ipRecord.nextAllowedAt = now + delayMs;
      ipThrottles.set(ipAddress, ipRecord);
    }

    const acct = accountThrottles.get(trimmedEmail) || { failedAttempts: 0, nextAllowedAt: 0 };
    acct.failedAttempts += 1;
    const acctDelay = calculateBackoffMs(acct.failedAttempts);
    acct.nextAllowedAt = now + acctDelay;
    accountThrottles.set(trimmedEmail, acct);

    return {
      status: 401,
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    };
  }

  // 4. Check persistent user.lockedUntil (database)
  if (user.lockedUntil && now < new Date(user.lockedUntil).getTime()) {
    return {
      status: 429,
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      message: 'Too many attempts, try again later',
    };
  }

  if (!user.active) {
    await bcrypt.compare(password, DUMMY_HASH);
    return {
      status: 401,
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    };
  }

  // 5. Verify password hash
  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    const nextAttempts = (user.failedLoginAttempts || 0) + 1;
    const delayMs = calculateBackoffMs(nextAttempts);
    const lockedUntil = delayMs > 0 ? new Date(now + delayMs) : null;

    // Single atomic UPDATE ... RETURNING statement
    const updated = await db.incrementFailedLogin(user.id, lockedUntil);

    accountThrottles.set(trimmedEmail, {
      failedAttempts: updated.failedLoginAttempts,
      nextAllowedAt: lockedUntil ? lockedUntil.getTime() : 0,
    });

    if (ipAddress) {
      const ipRecord = ipThrottles.get(ipAddress) || { failedAttempts: 0, nextAllowedAt: 0 };
      ipRecord.failedAttempts += 1;
      const ipDelay = calculateBackoffMs(ipRecord.failedAttempts);
      ipRecord.nextAllowedAt = now + ipDelay;
      ipThrottles.set(ipAddress, ipRecord);
    }

    await recordAudit({
      firmId: user.firmId,
      userId: user.id,
      userName: user.name,
      entity: 'Session',
      entityId: user.id,
      action: 'LOGIN_FAILED',
      oldValue: { failedAttempts: user.failedLoginAttempts },
      newValue: { failedAttempts: updated.failedLoginAttempts, lockedUntil, ipAddress },
    });

    return {
      status: 401,
      error: 'Invalid credentials',
      message: 'Invalid email or password.',
    };
  }

  // 6. Successful login -> Reset lock counters atomically
  await db.resetFailedLogin(user.id);
  accountThrottles.delete(trimmedEmail);
  if (ipAddress) {
    ipThrottles.delete(ipAddress);
  }

  const firm = await db.getFirm(user.firmId, true);
  if (!firm || firm.deletedAt) {
    return {
      status: 403,
      error: 'Forbidden',
      code: 'FIRM_NOT_FOUND',
      message: 'Chamber firm not found or has been deactivated.',
    };
  }

  if (firm.status === 'suspended') {
    return {
      status: 403,
      error: 'Forbidden',
      code: 'FIRM_SUSPENDED',
      message: 'Your chamber firm account has been suspended. Please contact support.',
    };
  }

  if (firm.status === 'disabled') {
    return {
      status: 403,
      error: 'Forbidden',
      code: 'FIRM_DISABLED',
      message: 'Your chamber firm account has been disabled. Please contact support.',
    };
  }

  // 7. Device authorization (Step D: web-app level browser install check)
  const { processDeviceLogin } = await import('./deviceService.js');
  const deviceResult = await processDeviceLogin({
    firmId: user.firmId,
    userId: user.id,
    rawDeviceKey: deviceOptions?.rawDeviceKey,
    userAgent: deviceOptions?.userAgent,
    customDeviceName: deviceOptions?.deviceName,
  });

  if (deviceResult.status !== 200) {
    return {
      status: deviceResult.status,
      error: deviceResult.error || 'Forbidden',
      code: deviceResult.code,
      message: deviceResult.message,
      deviceKey: deviceResult.deviceKey,
      device: deviceResult.device,
    };
  }

  const token = generateAccessToken(user, deviceResult.device);

  await recordAudit({
    firmId: user.firmId,
    userId: user.id,
    userName: user.name,
    entity: 'Session',
    entityId: user.id,
    action: 'LOGIN_SUCCESS',
    oldValue: null,
    newValue: { email: user.email, role: user.role, ipAddress, deviceId: deviceResult.device.id },
  });

  return {
    status: 200,
    user: {
      id: user.id,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      role: user.role,
      jobType: user.jobType || (user.role === 'Owner' ? 'lawyer_senior' : 'other'),
      jobTitleLabel: user.jobTitleLabel ?? null,
      reportsToUserId: user.reportsToUserId ?? null,
      permissions: user.permissions,
      language: user.language,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
    },
    firm,
    token,
    deviceKey: deviceResult.deviceKey,
    device: deviceResult.device,
  };
}
