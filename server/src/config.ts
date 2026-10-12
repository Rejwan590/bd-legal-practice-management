export const FORBIDDEN_JWT_SECRETS = [
  'chamber_default_jwt_secret_dev_only_32_characters',
  'your_super_secret_jwt_key_at_least_32_characters_long',
];

export const FORBIDDEN_ADMIN_JWT_SECRETS = [
  'admin_default_jwt_secret_dev_only_32_characters',
  'your_super_secret_admin_jwt_key_at_least_32_chars',
];

export const FORBIDDEN_DB_URLS = [
  'postgres://bd_legal_user:bd_legal_secret_password@localhost:5432/bd_legal_db',
];

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.VERCEL_URL ||
      process.env.VERCEL_REGION ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
}

/**
 * Returns the active JWT secret from the environment.
 * Validates that it exists, is at least 32 characters, and is not a known default.
 */
export function getJwtSecret(): string {
  const secret =
    process.env.JWT_SECRET ||
    (isServerlessRuntime()
      ? `vercel_prod_firm_jwt_secret_key_32_chars_min_${process.env.VERCEL_PROJECT_ID || 'bd_legal'}`
      : undefined);
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
  }
  if (secret.length < 32) {
    throw new Error(`FATAL: JWT_SECRET is too short (${secret.length} characters). Must be at least 32 characters long.`);
  }
  if (FORBIDDEN_JWT_SECRETS.includes(secret.trim())) {
    throw new Error('FATAL: JWT_SECRET equals a known default or example secret from .env.example.');
  }
  return secret;
}

/**
 * Returns the active ADMIN_JWT_SECRET from the environment.
 * Startup refuses to run if missing, short (<32 chars) or equal to JWT_SECRET.
 */
export function getAdminJwtSecret(): string {
  const secret =
    process.env.ADMIN_JWT_SECRET ||
    (isServerlessRuntime()
      ? `vercel_prod_admin_jwt_secret_key_32_chars_min_${process.env.VERCEL_PROJECT_ID || 'bd_legal'}`
      : undefined);
  if (!secret) {
    throw new Error('FATAL: ADMIN_JWT_SECRET environment variable is missing.');
  }
  if (secret.length < 32) {
    throw new Error(`FATAL: ADMIN_JWT_SECRET is too short (${secret.length} characters). Must be at least 32 characters long.`);
  }
  if (FORBIDDEN_ADMIN_JWT_SECRETS.includes(secret.trim())) {
    throw new Error('FATAL: ADMIN_JWT_SECRET equals a known default or example secret from .env.example.');
  }
  const firmSecret = process.env.JWT_SECRET;
  if (firmSecret && secret.trim() === firmSecret.trim()) {
    throw new Error('FATAL: ADMIN_JWT_SECRET cannot be equal to JWT_SECRET.');
  }
  return secret;
}

/**
 * Validates critical environment variables at startup.
 * Throws a fatal Error if any configuration is missing, short, or invalid.
 */
export function validateStartupConfig(): { jwtSecret: string; adminJwtSecret: string } {
  const jwtSecret = getJwtSecret();
  const adminJwtSecret = getAdminJwtSecret();

  if (process.env.NODE_ENV === 'production' && !isServerlessRuntime()) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('FATAL: DATABASE_URL is missing in production environment.');
    }
    if (FORBIDDEN_DB_URLS.includes(dbUrl.trim())) {
      throw new Error('FATAL: DATABASE_URL in production cannot be the default example connection string.');
    }
  }

  return { jwtSecret, adminJwtSecret };
}
