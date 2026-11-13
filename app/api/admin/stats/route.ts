import { NextResponse } from 'next/server';
import { streamQueue, downloadQueue } from '@/lib/requestQueue';
import { meilisearch } from '@/lib/meilisearch';
import { cookieRotator } from '@/lib/cookieRotator';
import { audioCache } from '@/lib/audioCache';
import { isValidAdminToken } from '@/lib/adminAuth';
import { getVpsRealtimeStatus } from '@/lib/serverMetrics';
import { getVisitorAnalytics } from '@/lib/visitorTracker';
import { getAdminActivityLogs } from '@/lib/adminSecurity';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
    return createErrorResponse('Akses ditolak. Sesi administrator tidak valid atau telah kedaluwarsa.', 401);
  }

  try {
    // 1. VPS Specifications & Real-time Health
    const vpsData = getVpsRealtimeStatus();

    // 2. Visitor Analytics & Live Visitors List
    const visitorData = getVisitorAnalytics();

    // 3. Admin Activity Logs
    const activityLogs = getAdminActivityLogs(50);

    // 4. Subsystem Stats
    const diskCacheStats = audioCache.getStats();
    const meiliStats = await meilisearch.getStats().catch(() => ({
      healthy: false,
      host: 'http://127.0.0.1:7700',
      indexName: 'musicfy_tracks',
      numberOfDocuments: 0,
      isIndexing: false,
    }));

    const responsePayload = {
      timestamp: Date.now(),
      vps: vpsData,
      visitors: visitorData.summary,
      liveVisitors: visitorData.liveVisitors,
      logs: activityLogs,
      subsystems: {
        queues: {
          stream: streamQueue.getStats(),
          download: downloadQueue.getStats(),
        },
        audioCache: diskCacheStats,
        meilisearch: meiliStats,
        cookies: cookieRotator.getPoolStatus(),
        umami: {
          configured: Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID),
          websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID || null,
          dashboardUrl: process.env.UMAMI_DASHBOARD_URL || null,
        },
      },
    };

    return createSuccessResponse(
      responsePayload,
      'Data monitoring VPS & administrator berhasil diperbarui.',
      200
    );
  } catch (err: any) {
    console.error('[AdminStats] Error collecting server metrics:', err);
    return createErrorResponse(err.message || 'Gagal mengambil statistik administrator', 500);
  }
}
