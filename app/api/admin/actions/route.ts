import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isValidAdminToken, ADMIN_USERNAME } from '@/lib/adminAuth';
import { audioCache } from '@/lib/audioCache';
import { logAdminActivity, getClientIp } from '@/lib/adminSecurity';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenFromCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('musicfy_admin_token='))
    ?.split('=')[1];

  const token = tokenFromHeader || tokenFromCookie;
  if (!isValidAdminToken(token)) {
    return createErrorResponse('Akses ditolak. Sesi administrator tidak valid.', 401);
  }

  const ip = getClientIp(request);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (!action) {
      return createErrorResponse('Field "action" wajib disertakan.', 400);
    }

    if (action === 'clear_audio_cache') {
      audioCache.clear();
      logAdminActivity({
        type: 'CACHE_CLEAR',
        message: `Administrator '${ADMIN_USERNAME}' membersihkan disk cache audio dari IP ${ip}.`,
        ip,
        severity: 'info',
        details: { action: 'clear_audio_cache' },
      });
      return createSuccessResponse({ success: true }, 'Disk cache audio berhasil dibersihkan.', 200);
    }

    if (action === 'clear_lyrics_cache') {
      const lyricsSyncDir = path.join(process.cwd(), 'storage', 'lyrics_synced');
      let deletedCount = 0;
      if (fs.existsSync(lyricsSyncDir)) {
        const files = fs.readdirSync(lyricsSyncDir);
        for (const f of files) {
          try {
            fs.unlinkSync(path.join(lyricsSyncDir, f));
            deletedCount++;
          } catch {}
        }
      }
      logAdminActivity({
        type: 'CACHE_CLEAR',
        message: `Administrator '${ADMIN_USERNAME}' menghapus ${deletedCount} file cache lirik sinkron dari IP ${ip}.`,
        ip,
        severity: 'info',
        details: { action: 'clear_lyrics_cache', deletedFiles: deletedCount },
      });
      return createSuccessResponse({ deletedCount }, `${deletedCount} file cache lirik berhasil dihapus.`, 200);
    }

    if (action === 'test_alert') {
      logAdminActivity({
        type: 'SECURITY_ALERT',
        message: `Uji coba peringatan keamanan sistem dipicu secara manual oleh Administrator '${ADMIN_USERNAME}'.`,
        ip,
        severity: 'warning',
        details: { trigger: 'manual_test' },
      });
      return createSuccessResponse({ testSuccess: true }, 'Uji coba peringatan keamanan berhasil dicatat.', 200);
    }

    return createErrorResponse(`Aksi "${action}" tidak dikenal.`, 400);
  } catch (err: any) {
    return createErrorResponse(err.message || 'Gagal memproses aksi administrator', 500);
  }
}
