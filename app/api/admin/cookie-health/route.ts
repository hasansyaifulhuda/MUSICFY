import { NextResponse } from 'next/server';
import { cookieManager } from '@/lib/cookieRotator';
import { isValidAdminToken } from '@/lib/adminAuth';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

/**
 * Checks whether an incoming request is an internal VPS local call (e.g. from curl via SSH terminal)
 * or has an authorized administrator bearer token / cookie.
 */
function isAuthorizedOrLocal(request: Request): boolean {
  // 1. Check local loopback invocation (VPS terminal SSH / curl localhost)
  const host = (request.headers.get('host') || '').toLowerCase();
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const isLoopbackHost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
  const isLoopbackIp = forwardedFor === '127.0.0.1' || forwardedFor === '::1' || forwardedFor === '';

  if (isLoopbackHost && isLoopbackIp) {
    return true;
  }

  // 2. Check Admin Bearer Token or Cookie
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenFromCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('musicfy_admin_token='))
    ?.split('=')[1];

  const token = tokenFromHeader || tokenFromCookie;
  return isValidAdminToken(token);
}

/**
 * GET /api/admin/cookie-health
 * Displays live yt-dlp cookie health, active slots, failover status, and alerts.
 * Outputs clean ASCII table for terminal/curl or structured JSON for web UI.
 */
export async function GET(request: Request) {
  if (!isAuthorizedOrLocal(request)) {
    return createErrorResponse(
      'Akses ditolak. Endpoint kesehatan cookie hanya dapat diakses langsung dari VPS localhost atau administrator terotentikasi.',
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  const acceptHeader = (request.headers.get('accept') || '').toLowerCase();
  const format = searchParams.get('format')?.toLowerCase();

  const isCurl = userAgent.includes('curl') || userAgent.includes('wget') || userAgent.includes('httpie');
  const wantsText = format === 'text' || acceptHeader.includes('text/plain') || isCurl;

  if (wantsText && format !== 'json') {
    const useColors = isCurl || searchParams.get('color') === '1';
    const textReport = cookieManager.generateAsciiStatusReport(useColors);
    return new Response(textReport + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const poolStatus = cookieManager.getPoolStatus();
  return createSuccessResponse(
    poolStatus,
    'Status kesehatan pool cookie yt-dlp berhasil dimuat.',
    200
  );
}

/**
 * POST /api/admin/cookie-health
 * Supports resetting a blocked cookie status or triggering a manual disk rescan.
 */
export async function POST(request: Request) {
  if (!isAuthorizedOrLocal(request)) {
    return createErrorResponse('Akses ditolak.', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'rescan';

    if (action === 'reset' && body.filename) {
      const success = cookieManager.resetCookieStatus(body.filename);
      if (success) {
        return createSuccessResponse(
          cookieManager.getPoolStatus(),
          `Status berkas cookie '${body.filename}' berhasil di-reset ke HEALTHY.`
        );
      } else {
        return createErrorResponse(`Berkas cookie '${body.filename}' tidak ditemukan di pool aktif.`, 404);
      }
    }

    if (action === 'rescan') {
      cookieManager.scanCookieFiles(true);
      return createSuccessResponse(
        cookieManager.getPoolStatus(),
        'Pemindaian ulang berkas cookie di direktori root VPS berhasil dilakukan.'
      );
    }

    if (action === 'test_alert' || action === 'simulate_failure') {
      const targetFile = body.filename || 'cookies1.txt';
      const reason = body.reason || "Sign in to confirm you're not a bot";
      cookieManager.reportCookieFailure(targetFile, reason);
      return createSuccessResponse(
        cookieManager.getPoolStatus(),
        `Simulasi alert pada '${targetFile}' berhasil dijalankan.`
      );
    }

    return createErrorResponse(`Aksi '${action}' tidak dikenali. Gunakan 'reset', 'rescan', atau 'test_alert'.`, 400);
  } catch (err: any) {
    return createErrorResponse(err?.message || 'Gagal memproses aksi cookie', 500);
  }
}
