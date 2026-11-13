import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { findYtDlpBinary, getRandomStealthUserAgent, sanitizeVideoId } from '@/lib/audioResolver';
import { cookieManager, executeWithCookieFallback } from '@/lib/cookieRotator';
import { metadataCache } from '@/lib/cache';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

interface ParsedYouTubeTarget {
  type: 'playlist' | 'video';
  id: string;
  url: string;
}

/**
 * Accurately parses YouTube URLs or IDs, identifying whether the input
 * is a playlist or a single video (such as a 1-hour full album mix or cover song).
 */
function parseYouTubeTarget(input: string): ParsedYouTubeTarget | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. YouTube playlist URL (playlist?list=... or music.youtube.com/playlist?list=...)
  const listParamMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  const isWatchUrl = trimmed.includes('/watch?v=') || trimmed.includes('/watch?');

  if (listParamMatch && listParamMatch[1] && (!isWatchUrl || trimmed.includes('playlist?list='))) {
    return {
      type: 'playlist',
      id: listParamMatch[1],
      url: `https://www.youtube.com/playlist?list=${listParamMatch[1]}`,
    };
  }

  // 2. Direct Playlist ID starting with PL, OLAK, RD, etc. (usually >= 12 chars)
  if (/^(PL|OLAK|RD|UU|FL|LL)[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return {
      type: 'playlist',
      id: trimmed,
      url: `https://www.youtube.com/playlist?list=${trimmed}`,
    };
  }

  // 3. YouTube single video URL (supports watch?v=, youtu.be, shorts, music.youtube, embed, etc.)
  const videoMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  if (videoMatch && videoMatch[1]) {
    // If it also has &list=, but user entered a specific watch URL without playlist?, treat as video
    return {
      type: 'video',
      id: videoMatch[1],
      url: `https://www.youtube.com/watch?v=${videoMatch[1]}`,
    };
  }

  // 4. Raw 11-char Video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      type: 'video',
      id: trimmed,
      url: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  // 5. Fallback: Any other string >= 12 chars might be a playlist ID
  if (/^[a-zA-Z0-9_-]{12,}$/.test(trimmed)) {
    return {
      type: 'playlist',
      id: trimmed,
      url: `https://www.youtube.com/playlist?list=${trimmed}`,
    };
  }

  return null;
}

/**
 * Extracts and sorts authentic YouTube thumbnails by resolution,
 * guaranteeing crisp, high-resolution cover art for player, queue, and lockscreen.
 */
function extractThumbnails(
  videoId: string,
  rawThumbnails?: any[],
  directThumbnail?: string
): { url: string; width: number; height: number }[] {
  const result: { url: string; width: number; height: number }[] = [];

  if (Array.isArray(rawThumbnails) && rawThumbnails.length > 0) {
    const valid = rawThumbnails
      .filter((t) => t && typeof t.url === 'string' && t.url.startsWith('http'))
      .sort((a, b) => (a.width || 0) - (b.width || 0));

    for (const t of valid) {
      result.push({
        url: t.url,
        width: typeof t.width === 'number' ? t.width : 480,
        height: typeof t.height === 'number' ? t.height : 360,
      });
    }
  }

  // Ensure high-resolution fallbacks
  if (result.length === 0) {
    if (directThumbnail && typeof directThumbnail === 'string' && directThumbnail.startsWith('http')) {
      result.push({ url: directThumbnail, width: 640, height: 480 });
    }
    result.push({
      url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      width: 480,
      height: 360,
    });
    result.push({
      url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      width: 1280,
      height: 720,
    });
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = body.url || body.playlistUrl || body.id;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return createErrorResponse('URL atau ID YouTube wajib diisi.', 400);
    }

    const target = parseYouTubeTarget(rawUrl);
    if (!target) {
      return createErrorResponse(
        'Format link YouTube tidak valid. Gunakan link video (misal 1 jam album mix), link playlist, atau ID YouTube.',
        400
      );
    }

    // Check server memory cache (1 hour)
    const cacheKey = `yt-import:${target.type}:${target.id}`;
    const cached = metadataCache.get(cacheKey);
    if (cached) {
      return createSuccessResponse(cached, `Data ${target.type === 'video' ? 'trek audio' : 'playlist'} berhasil diambil dari cache`);
    }

    const ytDlpBin = findYtDlpBinary();

    // Execute yt-dlp metadata extraction with robust multi-cookie failover
    // If a cookie expires or hits a bot challenge, it automatically rotates to the next healthy cookie file
    const result = await executeWithCookieFallback(
      async (activeCookiePath) => {
        const args: string[] = [
          '-J',
          '--no-warnings',
          '--no-check-certificates',
          '--socket-timeout',
          '25',
          '--user-agent',
          getRandomStealthUserAgent(),
        ];

        if (target.type === 'video') {
          args.push('--no-playlist');
        } else {
          args.push('--flat-playlist', '--ignore-errors');
        }

        if (activeCookiePath) {
          args.push('--cookies', activeCookiePath);
        }

        args.push(target.url);

        const res = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
          const child = spawn(ytDlpBin, args, {
            env: {
              ...process.env,
              PATH: `/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let stdout = '';
          let stderr = '';
          const MAX_BUFFER = 25 * 1024 * 1024; // 25MB max buffer for safety
          const timeoutLimitMs = target.type === 'video' ? 30000 : 45000;

          const timeout = setTimeout(() => {
            try {
              child.kill('SIGTERM');
              setTimeout(() => {
                try {
                  if (!child.killed) child.kill('SIGKILL');
                } catch {}
              }, 1000).unref();
            } catch {}
            reject(new Error(`Waktu ekstraksi melebihi batas (timeout ${Math.round(timeoutLimitMs / 1000)} detik).`));
          }, timeoutLimitMs);

          child.stdout.on('data', (chunk) => {
            if (stdout.length < MAX_BUFFER) stdout += chunk.toString();
          });

          child.stderr.on('data', (chunk) => {
            if (stderr.length < MAX_BUFFER) stderr += chunk.toString();
          });

          child.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          child.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ stdout, stderr, code });
          });
        });

        if (!res.stdout || res.stdout.trim().length === 0) {
          const err = new Error(`Ekstraksi kosong (code ${res.code}): ${res.stderr.slice(0, 150)}`);
          (err as any).stderr = res.stderr;
          throw err;
        }

        return res;
      },
      { operationName: `Import-${target.type}` }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch {
      return createErrorResponse('Gagal membaca respons metadata dari YouTube.', 500);
    }

    // =========================================================================
    // CASE A: SINGLE VIDEO (1-Hour Mix, Full Album, Cover Song, Single Track)
    // =========================================================================
    if (target.type === 'video' || (parsed && parsed._type !== 'playlist' && parsed.id && !parsed.entries)) {
      const videoId = parsed.id || target.id;
      const name = parsed.title || 'Judul Tidak Diketahui';
      const artist = parsed.uploader || parsed.channel || parsed.creator || 'Artis YouTube';
      const duration = typeof parsed.duration === 'number' && parsed.duration > 0 ? Math.round(parsed.duration) : 0;
      const thumbnails = extractThumbnails(videoId, parsed.thumbnails, parsed.thumbnail);
      const thumbnail =
        parsed.thumbnail ||
        thumbnails[thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      const isLongAudio =
        duration > 600 ||
        /(?:full\s*album|mix|nonstop|1\s*hour|1\s*jam|2\s*hour|live\s*set|compilation|dj\s*set|mashup)/i.test(name);

      const trackItem = {
        videoId,
        name,
        artist,
        duration,
        thumbnails,
      };

      const responsePayload = {
        type: 'video',
        id: videoId,
        title: name,
        artist,
        description: parsed.description || '',
        thumbnail,
        totalTracks: 1,
        duration,
        isLongAudio,
        tracks: [trackItem],
      };

      metadataCache.set(cacheKey, responsePayload, 3600);
      return createSuccessResponse(
        responsePayload,
        isLongAudio
          ? `Berhasil mengekstrak audio durasi panjang (${Math.round(duration / 60)} menit)`
          : `Berhasil mengekstrak trek "${name}"`
      );
    }

    // =========================================================================
    // CASE B: PLAYLIST (Multi-Track YouTube Playlist)
    // =========================================================================
    const playlistTitle = parsed.title || 'Playlist YouTube';
    const playlistDesc = parsed.description || '';
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];

    const tracks = rawEntries
      .filter((entry: any) => entry && entry.id && entry.title && entry.title !== '[Private video]' && entry.title !== '[Deleted video]')
      .map((entry: any) => {
        const videoId = entry.id;
        const name = entry.title || 'Judul Tidak Diketahui';
        const artist = entry.uploader || entry.channel || entry.artist || 'Artis Tidak Diketahui';
        const duration = typeof entry.duration === 'number' && entry.duration > 0 ? Math.round(entry.duration) : 0;
        const thumbnails = extractThumbnails(videoId, entry.thumbnails, entry.thumbnail);

        return {
          videoId,
          name,
          artist,
          duration,
          thumbnails,
        };
      });

    if (tracks.length === 0) {
      return createErrorResponse(
        'Playlist YouTube tidak memiliki lagu yang dapat diputar (kosong atau video privat).',
        400
      );
    }

    const playlistThumbnail =
      Array.isArray(parsed.thumbnails) && parsed.thumbnails.length > 0
        ? parsed.thumbnails[parsed.thumbnails.length - 1].url
        : tracks[0]?.thumbnails?.[tracks[0].thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${tracks[0].videoId}/hqdefault.jpg`;

    const responsePayload = {
      type: 'playlist',
      id: target.id,
      title: playlistTitle,
      description: playlistDesc,
      thumbnail: playlistThumbnail,
      totalTracks: tracks.length,
      tracks,
    };

    // Cache result in server memory for 1 hour
    metadataCache.set(cacheKey, responsePayload, 3600);

    return createSuccessResponse(responsePayload, `Berhasil mengekstrak ${tracks.length} lagu dari YouTube`);
  } catch (error: any) {
    console.error('[PlaylistImportAPI] Error extracting metadata:', error);
    return createErrorResponse(error?.message || 'Terjadi kesalahan sistem saat mengimpor dari YouTube.', 500);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') || searchParams.get('id');

  if (!url) {
    return createErrorResponse('Parameter "url" atau "id" wajib disertakan.', 400);
  }

  // Delegate to POST handler
  return POST(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  );
}
