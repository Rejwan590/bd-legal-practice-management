import { sign, verify } from 'hono/jwt';

export interface UserJwtPayload {
  userId: string;
  firmId: string;
  role: 'Owner' | 'Staff';
  email: string;
  exp: number;
}

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  exp: number;
}

export async function signUserToken(payload: Omit<UserJwtPayload, 'exp'>, secret: string, expiresInSeconds = 7 * 24 * 60 * 60): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return sign({ ...payload, exp }, secret, 'HS256');
}

export async function verifyUserToken(token: string, secret: string): Promise<UserJwtPayload | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    return payload as unknown as UserJwtPayload;
  } catch {
    return null;
  }
}

export async function signAdminToken(payload: Omit<AdminJwtPayload, 'exp'>, secret: string, expiresInSeconds = 8 * 60 * 60): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return sign({ ...payload, exp }, secret, 'HS256');
}

export async function verifyAdminToken(token: string, secret: string): Promise<AdminJwtPayload | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    return payload as unknown as AdminJwtPayload;
  } catch {
    return null;
  }
}
