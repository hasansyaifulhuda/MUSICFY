import { NextResponse } from 'next/server';
import { recordVisitorHeartbeat } from '@/lib/visitorTracker';
import { getClientIp } from '@/lib/adminSecurity';
import { createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userAgent = request.headers.get('user-agent') || '';
    const ip = getClientIp(request);
    const country =
      request.headers.get('cf-ipcountry') ||
      request.headers.get('x-vercel-ip-country') ||
      'ID';

    const visitorId = body.visitorId || `anon_${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const pagePath = body.path || '/';
    const accountName = body.accountName || undefined;
    const isNewPageView = Boolean(body.isNewPageView);

    const session = recordVisitorHeartbeat({
      visitorId,
      path: pagePath,
      userAgent,
      ip,
      country,
      accountName,
      isNewPageView,
    });

    return createSuccessResponse(
      { isOnline: true, visitorId: session.visitorId },
      'Heartbeat diterima',
      200
    );
  } catch (err: any) {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
