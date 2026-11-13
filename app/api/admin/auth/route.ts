import { NextResponse } from 'next/server';
import {
  generateAdminToken,
  isValidAdminToken,
  isAdminConfigured,
  verifyAdminPassword,
  ADMIN_USERNAME,
} from '@/lib/adminAuth';
import {
  getClientIp,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  logAdminActivity,
} from '@/lib/adminSecurity';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

/**
 * Check admin authentication status
 * GET /api/admin/auth
 */
export async function GET(request: Request) {
  const isConfigured = isAdminConfigured();
  if (!isConfigured) {
    return createSuccessResponse(
      { authenticated: false, configured: false, username: null },
      'ADMIN_PASSWORD belum dikonfigurasi di file .env server.',
      200
    );
  }

  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenFromCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('musicfy_admin_token='))
    ?.split('=')[1];

  const token = tokenFromHeader || tokenFromCookie;
  const authenticated = isValidAdminToken(token);

  return createSuccessResponse(
    {
      authenticated,
      configured: true,
      username: authenticated ? ADMIN_USERNAME : null,
    },
    authenticated ? 'Admin terautentikasi' : 'Belum login sebagai admin',
    200
  );
}

/**
 * Verify admin credentials with brute-force protection
 * POST /api/admin/auth
 * Body: { password: string, username?: string }
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);

  try {
    if (!isAdminConfigured()) {
      return createErrorResponse(
        'Mode Admin dinonaktifkan: ADMIN_PASSWORD belum dikonfigurasi pada berkas .env server.',
        503
      );
    }

    // 1. Rate Limiting / Brute-force protection
    const rateLimit = checkLoginRateLimit(ip);
    if (rateLimit.isBlocked) {
      logAdminActivity({
        type: 'SECURITY_ALERT',
        message: `Percobaan login ditolak: IP ${ip} terkunci selama ${rateLimit.lockoutExpiresInSeconds} detik.`,
        ip,
        severity: 'critical',
        details: { lockoutRemainingSeconds: rateLimit.lockoutExpiresInSeconds },
      });

      return createErrorResponse(
        `Terlalu banyak percobaan login gagal. Akun dikunci sementara demi keamanan. Coba lagi dalam ${Math.ceil(
          rateLimit.lockoutExpiresInSeconds / 60
        )} menit.`,
        429
      );
    }

    const body = await request.json().catch(() => ({}));
    const password = body.password;
    const requestedUsername = (body.username || ADMIN_USERNAME).trim();

    if (!password || typeof password !== 'string') {
      return createErrorResponse('Kata sandi admin wajib diisi.', 400);
    }

    // 2. Validate Password
    const isValid = verifyAdminPassword(password.trim());

    if (!isValid) {
      const statusAfterFailure = recordFailedLogin(ip);

      logAdminActivity({
        type: 'LOGIN_FAILURE',
        message: `Percobaan login gagal untuk user '${requestedUsername}' dari IP ${ip}. Sisa percobaan: ${statusAfterFailure.remainingAttempts}.`,
        ip,
        severity: statusAfterFailure.remainingAttempts === 0 ? 'critical' : 'warning',
        details: { remainingAttempts: statusAfterFailure.remainingAttempts },
      });

      const message = statusAfterFailure.remainingAttempts > 0
        ? `Kata sandi salah. Sisa kesempatan sebelum diblokir: ${statusAfterFailure.remainingAttempts} kali.`
        : 'Kata sandi salah. Terlalu banyak kegagalan, akses diblokir selama 15 menit.';

      return createErrorResponse(message, 401);
    }

    // 3. Successful Authentication
    recordSuccessfulLogin(ip);
    const token = generateAdminToken(ADMIN_USERNAME);

    logAdminActivity({
      type: 'LOGIN_SUCCESS',
      message: `Administrator '${ADMIN_USERNAME}' berhasil login dari IP ${ip}.`,
      ip,
      severity: 'info',
    });

    const response = createSuccessResponse(
      {
        authenticated: true,
        username: ADMIN_USERNAME,
        token,
      },
      'Autentikasi administrator berhasil. Mengalihkan ke Dashboard...',
      200
    );

    // Set secure HttpOnly session cookie
    const isHttps = request.url.startsWith('https://');
    response.headers.set(
      'Set-Cookie',
      `musicfy_admin_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; ${isHttps ? 'Secure;' : ''}`
    );

    return response;
  } catch (err: any) {
    console.error('[AdminAuth] Error during login verification:', err);
    return createErrorResponse(err.message || 'Gagal memproses autentikasi admin', 500);
  }
}

/**
 * Terminate admin session (Logout)
 * DELETE /api/admin/auth
 */
export async function DELETE(request: Request) {
  const ip = getClientIp(request);

  logAdminActivity({
    type: 'LOGOUT',
    message: `Administrator '${ADMIN_USERNAME}' telah logout dari IP ${ip}.`,
    ip,
    severity: 'info',
  });

  const response = createSuccessResponse(
    { authenticated: false },
    'Sesi administrator berhasil diakhiri.',
    200
  );

  // Clear cookie immediately
  response.headers.set(
    'Set-Cookie',
    'musicfy_admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );

  return response;
}
