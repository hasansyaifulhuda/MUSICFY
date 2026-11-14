import { NextResponse } from 'next/server';
import { resolveAudioStream, sanitizeVideoId, createYtDlpProgressiveStream } from '@/lib/audioResolver';
import { audioCache } from '@/lib/audioCache';
import { streamCache } from '@/lib/cache';
import { streamLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { cookieManager } from '@/lib/cookieRotator';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // 3-minute execution limit for long streaming tasks

export async function GET(request: Request) {
  // 1. In-Memory Rate Limiting Layer
  const clientIp = getClientIp(request);
  const rateLimit = streamLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  // 2. Query Parameter & Sanitization Layer
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id') || searchParams.get('videoId') || searchParams.get('url');

  if (!rawId) {
    return createErrorResponse(
      'Parameter "id" wajib disertakan (contoh: /api/stream?id=dQw4w9WgXcQ)',
      400
    );
  }

  const videoId = sanitizeVideoId(rawId);
  if (!videoId) {
    return createErrorResponse(
      'Format ID video atau URL YouTube tidak valid. Gunakan 11 karakter ID atau URL YouTube resmi.',
      400
    );
  }

  const isJsonRequested =
    searchParams.get('format') === 'json' ||
    searchParams.get('json') === 'true' ||
    searchParams.get('info') === 'true' ||
    request.headers.get('accept')?.includes('application/json');

  const isRedirectRequested = searchParams.get('redirect') === 'true';
  const isDownloadRequested = searchParams.get('download') === 'true' || searchParams.get('dl') === 'true';
  const rawTitle = searchParams.get('title') || `${videoId}.mp3`;
  const customTitle = rawTitle.endsWith('.mp3') ? rawTitle : `${rawTitle}.mp3`;
  const rawQuality = searchParams.get('quality') || searchParams.get('q') || 'auto';
  const quality = rawQuality === 'low' || rawQuality === 'high' || rawQuality === 'normal' ? rawQuality : 'auto';

  try {
    // -------------------------------------------------------------
    // Tier 1: Check Server-Side VPS Audio Cache (Instant 0ms Hit)
    // -------------------------------------------------------------
    const cachedDisk = audioCache.getCachedAudio(videoId);

    if (cachedDisk) {
      // 1A. JSON Metadata for Cached Audio
      if (isJsonRequested) {
        const resolvedTitle =
          searchParams.get('title')?.replace(/\.mp3$/i, '').trim() ||
          streamCache.get(videoId)?.title ||
          videoId;

        return createSuccessResponse(
          {
            videoId,
            title: resolvedTitle,
            streamUrl: `/api/stream?id=${encodeURIComponent(videoId)}`,
            format: 'mp3',
            acodec: 'mp3',
            bitrate: 192,
            filesize: cachedDisk.size,
            cached: true,
            source: 'vps-disk',
          },
          'Audio stream resolved from VPS disk cache',
          200,
          {
            'Cache-Control': 'public, s-maxage=86400, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT',
            'X-Audio-Source': 'vps-disk',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          }
        );
      }

      // 1B. Serve Audio File Directly from VPS Disk (with HTTP Range Seeking & Optional Download Disposition)
      return audioCache.serveCachedAudio(request, cachedDisk.filePath, videoId, {
        asAttachment: isDownloadRequested,
        filename: customTitle,
      });
    }

    // -------------------------------------------------------------
    // Explicit Download Request Handling (Full File Attachment)
    // -------------------------------------------------------------
    if (isDownloadRequested && !videoId.startsWith('itunes:')) {
      try {
        const cachedFilePath = await audioCache.ensureAudioCached(videoId);
        return audioCache.serveCachedAudio(request, cachedFilePath, videoId, {
          asAttachment: true,
          filename: customTitle,
        });
      } catch (dlErr: any) {
        console.error(`[StreamRoute] ❌ Full download caching failed for "${videoId}":`, dlErr?.message || dlErr);
        // Fallback to streaming proxy with attachment disposition below
      }
    }

    // -------------------------------------------------------------
    // Tier 2: PROGRESSIVE ON-THE-FLY CHUNK STREAMING (YouTube-Style)
    // Zero waiting for 100% download. Starts playback instantly!
    // -------------------------------------------------------------
    const isMemCached = streamCache.has(videoId);
    let stream;
    try {
      stream = await resolveAudioStream(videoId, quality);
    } catch (resolveErr) {
      console.warn(`[StreamRoute] Direct resolution failed for "${videoId}". Falling back to on-the-fly pipe:`, resolveErr);
      // Fallback directly to real-time yt-dlp stdout pipe
      const progressivePipe = createYtDlpProgressiveStream(videoId, request.signal);
      const pipeHeaders = new Headers();
      pipeHeaders.set('Content-Type', progressivePipe.contentType);
      pipeHeaders.set('Transfer-Encoding', 'chunked');
      pipeHeaders.set('Cache-Control', 'no-cache');
      pipeHeaders.set('Access-Control-Allow-Origin', '*');
      pipeHeaders.set('X-Playback-Mode', 'progressive-ytdlp-pipe');
      pipeHeaders.set('X-RateLimit-Remaining', String(rateLimit.remaining));
      return new Response(progressivePipe.stream, {
        status: 200,
        headers: pipeHeaders,
      });
    }

    // 2A. JSON Metadata Response
    if (isJsonRequested) {
      return createSuccessResponse(
        {
          videoId: stream.videoId,
          title: stream.title,
          duration: stream.duration,
          streamUrl: stream.url,
          format: stream.ext,
          acodec: stream.acodec,
          bitrate: stream.abr,
          filesize: stream.filesize,
          cached: isMemCached,
          source: 'upstream-cdn',
        },
        'Audio stream URL resolved successfully',
        200,
        {
          'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': isMemCached ? 'MEM-HIT' : 'MISS',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        }
      );
    }

    // 2B. 302 Redirection Response
    if (isRedirectRequested) {
      return NextResponse.redirect(stream.url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, s-maxage=7200',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 2C. Live Progressive Streaming Proxy Mode (High Resilience & Byte Range Seeking)
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        stream.httpHeaders['User-Agent'] ||
        request.headers.get('user-agent') ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(stream.url, {
        headers: upstreamHeaders,
        signal: request.signal,
      });

      // Self-healing: if cached CDN URL has expired (403 Forbidden / 410 Gone), purge and re-resolve immediately
      if (upstreamResponse.status === 403 || upstreamResponse.status === 410) {
        console.warn(`[StreamRoute] Upstream URL expired (${upstreamResponse.status}) for ${videoId}. Purging cache and re-resolving fresh URL...`);
        streamCache.delete(videoId);
        try {
          const freshStream = await resolveAudioStream(videoId, quality, true);
          const retryResponse = await fetch(freshStream.url, {
            headers: upstreamHeaders,
            signal: request.signal,
          });
          if (retryResponse.ok || retryResponse.status === 206) {
            upstreamResponse = retryResponse;
          }
        } catch (reResolveErr) {
          console.warn(`[StreamRoute] Re-resolution failed for ${videoId}:`, reResolveErr);
        }
      }
    } catch (fetchErr: any) {
      console.warn(`[StreamRoute] Upstream fetch threw for ${videoId}, engaging on-the-fly pipe fallback:`, fetchErr?.message || fetchErr);
      const progressivePipe = createYtDlpProgressiveStream(videoId, request.signal);
      const pipeHeaders = new Headers();
      pipeHeaders.set('Content-Type', progressivePipe.contentType);
      pipeHeaders.set('Accept-Ranges', 'bytes');
      pipeHeaders.set('Transfer-Encoding', 'chunked');
      pipeHeaders.set('Cache-Control', 'no-cache');
      pipeHeaders.set('Access-Control-Allow-Origin', '*');
      pipeHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      pipeHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
      pipeHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
      pipeHeaders.set('X-Playback-Mode', 'progressive-ytdlp-pipe');
      return new Response(progressivePipe.stream, {
        status: 200,
        headers: pipeHeaders,
      });
    }

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      console.warn(
        `[StreamRoute] Upstream fetch returned status ${upstreamResponse.status} for ${videoId}. Engaging on-the-fly yt-dlp pipe fallback.`
      );
      const progressivePipe = createYtDlpProgressiveStream(videoId, request.signal);
      const pipeHeaders = new Headers();
      pipeHeaders.set('Content-Type', progressivePipe.contentType);
      pipeHeaders.set('Accept-Ranges', 'bytes');
      pipeHeaders.set('Transfer-Encoding', 'chunked');
      pipeHeaders.set('Cache-Control', 'no-cache');
      pipeHeaders.set('Access-Control-Allow-Origin', '*');
      pipeHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      pipeHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
      pipeHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
      pipeHeaders.set('X-Playback-Mode', 'progressive-ytdlp-pipe');
      return new Response(progressivePipe.stream, {
        status: 200,
        headers: pipeHeaders,
      });
    }

    const rawContentType = upstreamResponse.headers.get('content-type') || '';
    if (rawContentType.includes('text/html') || rawContentType.includes('application/json')) {
      console.warn(
        `[StreamRoute] Upstream returned non-audio content-type "${rawContentType}" for ${videoId}. Engaging on-the-fly yt-dlp pipe fallback.`
      );
      const progressivePipe = createYtDlpProgressiveStream(videoId, request.signal);
      const pipeHeaders = new Headers();
      pipeHeaders.set('Content-Type', progressivePipe.contentType);
      pipeHeaders.set('Accept-Ranges', 'bytes');
      pipeHeaders.set('Transfer-Encoding', 'chunked');
      pipeHeaders.set('Cache-Control', 'no-cache');
      pipeHeaders.set('Access-Control-Allow-Origin', '*');
      pipeHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      pipeHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
      pipeHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
      pipeHeaders.set('X-Playback-Mode', 'progressive-ytdlp-pipe');
      return new Response(progressivePipe.stream, {
        status: 200,
        headers: pipeHeaders,
      });
    }

    if (!upstreamResponse.body) {
      console.warn(`[StreamRoute] Upstream body is null for ${videoId}. Engaging on-the-fly yt-dlp pipe fallback.`);
      const progressivePipe = createYtDlpProgressiveStream(videoId, request.signal);
      const pipeHeaders = new Headers();
      pipeHeaders.set('Content-Type', progressivePipe.contentType);
      pipeHeaders.set('Accept-Ranges', 'bytes');
      pipeHeaders.set('Transfer-Encoding', 'chunked');
      pipeHeaders.set('Cache-Control', 'no-cache');
      pipeHeaders.set('Access-Control-Allow-Origin', '*');
      pipeHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      pipeHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
      pipeHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
      pipeHeaders.set('X-Playback-Mode', 'progressive-ytdlp-pipe');
      return new Response(progressivePipe.stream, {
        status: 200,
        headers: pipeHeaders,
      });
    }

    const responseHeaders = new Headers();
    const contentType = rawContentType || (stream.ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400, stale-while-revalidate=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    responseHeaders.set('X-Playback-Mode', 'progressive-chunk');
    responseHeaders.set('X-Cache', isMemCached ? 'MEM-PROXY' : 'PROGRESSIVE-PROXY');
    responseHeaders.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    responseHeaders.set('X-Cookie-Active', cookieManager.getPoolStatus().currentActiveFilename || 'standard');

    if (isDownloadRequested) {
      const safeDlName = customTitle.replace(/[/\\?%*:|"<>]/g, '_');
      responseHeaders.set('Content-Disposition', `attachment; filename="${safeDlName}"`);
    }

    const contentRange = upstreamResponse.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const contentLength = upstreamResponse.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(
      `[StreamRoute] ❌ Critical error resolving audio for id "${videoId}":\n` +
      (error?.stack || error?.message || error)
    );
    const statusCode =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : error?.code === 'ETIMEDOUT'
        ? 504
        : 500;

    return createErrorResponse(
      error?.message || 'Gagal memproses audio stream: Terkendala koneksi server ke sumber audio.',
      statusCode,
      { videoId, retryable: true, details: error?.message }
    );
  }
}

export async function HEAD(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = streamLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
    });
  }

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id') || searchParams.get('videoId');

  if (!rawId) {
    return new Response(null, { status: 400 });
  }

  const videoId = sanitizeVideoId(rawId);
  if (!videoId) {
    return new Response(null, { status: 400 });
  }

  // 1. Fast-Path: Check VPS Disk Cache
  const cachedDisk = audioCache.getCachedAudio(videoId);
  if (cachedDisk) {
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(cachedDisk.size));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Cache', 'HIT');
    headers.set('X-Audio-Source', 'vps-disk');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    return new Response(null, { status: 200, headers });
  }

  // 2. Upstream Metadata Check
  try {
    const rawQuality = searchParams.get('quality') || searchParams.get('q') || 'auto';
    const quality = rawQuality === 'low' || rawQuality === 'high' || rawQuality === 'normal' ? rawQuality : 'auto';
    const stream = await resolveAudioStream(videoId, quality);
    const headers = new Headers();
    headers.set('Content-Type', stream.ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
    headers.set('Accept-Ranges', 'bytes');
    if (stream.filesize) {
      headers.set('Content-Length', String(stream.filesize));
    }
    headers.set('Cache-Control', 'public, max-age=14400');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));

    return new Response(null, { status: 200, headers });
  } catch {
    return new Response(null, { status: 503, headers: { 'Retry-After': '3' } });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Authorization, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
