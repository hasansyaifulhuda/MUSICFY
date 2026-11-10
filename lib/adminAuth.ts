import crypto from 'crypto';

export const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'shanz').trim();
export const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
export const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH || '').trim();
export const ADMIN_SESSION_SECRET = (
  process.env.ADMIN_SESSION_SECRET ||
  process.env.ADMIN_JWT_SECRET ||
  process.env.ADMIN_SECRET_SALT ||
  'musicfy_vps_superadmin_entropy_key_2026'
).trim();

/**
 * Checks whether Admin Mode has been configured on this server.
 */
export function isAdminConfigured(): boolean {
  return ADMIN_PASSWORD.length > 0 || ADMIN_PASSWORD_HASH.length > 0;
}

/**
 * Verifies the provided password against environment variable credentials.
 * Supports:
 * 1. Constant-time plain text comparison against ADMIN_PASSWORD
 * 2. Hash verification against ADMIN_PASSWORD_HASH (SHA256, PBKDF2, or Scrypt)
 */
export function verifyAdminPassword(passwordAttempt: string): boolean {
  if (!isAdminConfigured() || !passwordAttempt) {
    return false;
  }

  // 1. Direct constant-time comparison if ADMIN_PASSWORD is set
  if (ADMIN_PASSWORD) {
    const attemptBuffer = Buffer.from(passwordAttempt);
    const targetBuffer = Buffer.from(ADMIN_PASSWORD);

    if (attemptBuffer.length === targetBuffer.length) {
      if (crypto.timingSafeEqual(attemptBuffer, targetBuffer)) {
        return true;
      }
    }
  }

  // 2. Hash verification if ADMIN_PASSWORD_HASH is set
  if (ADMIN_PASSWORD_HASH) {
    // Format: "sha256:hash" or "pbkdf2:salt:hash" or raw hash
    if (ADMIN_PASSWORD_HASH.startsWith('sha256:')) {
      const targetHash = ADMIN_PASSWORD_HASH.slice(7);
      const computed = crypto.createHash('sha256').update(passwordAttempt).digest('hex');
      const b1 = Buffer.from(computed);
      const b2 = Buffer.from(targetHash);
      if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
        return true;
      }
    } else if (ADMIN_PASSWORD_HASH.startsWith('pbkdf2:')) {
      const parts = ADMIN_PASSWORD_HASH.split(':');
      if (parts.length === 3) {
        const salt = parts[1];
        const targetHash = parts[2];
        const computed = crypto.pbkdf2Sync(passwordAttempt, salt, 10000, 32, 'sha256').toString('hex');
        const b1 = Buffer.from(computed);
        const b2 = Buffer.from(targetHash);
        if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
          return true;
        }
      }
    } else {
      // Raw sha256
      const computed = crypto.createHash('sha256').update(passwordAttempt).digest('hex');
      const b1 = Buffer.from(computed);
      const b2 = Buffer.from(ADMIN_PASSWORD_HASH);
      if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

export interface AdminSessionPayload {
  u: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Generates a signed, tamper-proof session token for authenticated admins (24h lifespan).
 */
export function generateAdminToken(username = ADMIN_USERNAME): string {
  if (!isAdminConfigured()) return '';

  const now = Date.now();
  const payload: AdminSessionPayload = {
    u: username,
    iat: now,
    exp: now + 24 * 60 * 60 * 1000, // 24 hours
    jti: crypto.randomBytes(8).toString('hex'),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Validates an incoming admin session token.
 * Also maintains backward compatibility with legacy daily tokens.
 */
export function isValidAdminToken(token: string | null | undefined): boolean {
  if (!token || !isAdminConfigured()) return false;

  // 1. Check signed payload token (format: payload.signature)
  if (token.includes('.')) {
    const [payloadB64, providedSig] = token.split('.');
    if (!payloadB64 || !providedSig) return false;

    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');

    const b1 = Buffer.from(providedSig);
    const b2 = Buffer.from(expectedSig);

    if (b1.length !== b2.length || !crypto.timingSafeEqual(b1, b2)) {
      return false;
    }

    try {
      const payloadRaw = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      const payload: AdminSessionPayload = JSON.parse(payloadRaw);

      if (Date.now() > payload.exp) {
        return false; // Expired
      }

      return true;
    } catch {
      return false;
    }
  }

  // 2. Legacy fallback token validation
  const salt = ADMIN_SESSION_SECRET;
  const dailyDate = new Date().toISOString().slice(0, 10);
  const legacyExpected = crypto
    .createHmac('sha256', salt)
    .update(`${ADMIN_PASSWORD}:${dailyDate}`)
    .digest('hex');

  const b1 = Buffer.from(token);
  const b2 = Buffer.from(legacyExpected);

  if (b1.length !== b2.length) return false;
  return crypto.timingSafeEqual(b1, b2);
}

/**
 * Extracts and verifies the admin session from an incoming HTTP request.
 */
export function getAdminSessionFromRequest(request: Request): {
  authenticated: boolean;
  username: string;
} {
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const cookieHeader = request.headers.get('cookie') || '';
  const tokenFromCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('musicfy_admin_token='))
    ?.split('=')[1];

  const token = tokenFromHeader || tokenFromCookie;
  const valid = isValidAdminToken(token);

  return {
    authenticated: valid,
    username: valid ? ADMIN_USERNAME : '',
  };
}
