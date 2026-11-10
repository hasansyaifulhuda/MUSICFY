import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { geminiService } from '@/lib/gemini';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), 'storage', 'lyrics_translations');

function ensureCacheDir(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[LyricsTranslate] Warning creating cache directory:', err);
  }
}

function getCachePath(videoId: string): string {
  const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${safeId}.json`);
}

/**
 * Checks if translated lyrics exist in permanent server disk cache.
 * GET /api/lyrics/translate?id=videoId
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('id') || searchParams.get('videoId');

  if (!videoId) {
    return createErrorResponse('Parameter "id" wajib disertakan.', 400);
  }

  ensureCacheDir();
  const filePath = getCachePath(videoId);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return createSuccessResponse(
        parsed,
        'Lirik terjemahan berhasil dimuat dari cache disk server.',
        200,
        {
          'Cache-Control': 'public, s-maxage=604800, max-age=604800',
          'X-Cache': 'HIT-DISK',
        }
      );
    }
  } catch (err) {
    console.warn('[LyricsTranslate] Error reading translation cache:', err);
  }

  return createErrorResponse('Lirik terjemahan belum tersedia di cache.', 404);
}

/**
 * Translates lyrics into Indonesian and provides Romaji for CJK tracks via Gemini AI,
 * saving results permanently to local VPS disk cache.
 * POST /api/lyrics/translate
 * Body: { videoId: string, title: string, artist: string, lyrics: LyricLine[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { videoId, title, artist, lyrics } = body;

    if (!videoId) {
      return createErrorResponse('Field "videoId" wajib disertakan.', 400);
    }

    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      return createErrorResponse('Array "lyrics" wajib disertakan dan tidak boleh kosong.', 400);
    }

    ensureCacheDir();
    const filePath = getCachePath(videoId);

    // 1. Fast-path: Check permanent disk cache
    if (fs.existsSync(filePath)) {
      try {
        const cachedRaw = fs.readFileSync(filePath, 'utf-8');
        const cachedData = JSON.parse(cachedRaw);
        return createSuccessResponse(
          cachedData,
          'Lirik terjemahan berhasil diambil dari cache permanen server.',
          200,
          {
            'X-Cache': 'HIT-DISK',
            'Cache-Control': 'public, s-maxage=604800, max-age=604800',
          }
        );
      } catch {}
    }

    // 2. Check if Gemini AI is available
    if (!geminiService.isAvailable()) {
      return createErrorResponse(
        'Fitur terjemahan AI memerlukan GEMINI_API_KEY. Silakan tambahkan pada konfigurasi server .env.',
        503
      );
    }

    // 3. Process translation with Gemini AI
    console.info(`[LyricsTranslate] 🤖 Translating lyrics for "${title || videoId}" via Gemini AI...`);
    const translatedLyrics = await geminiService.translateLyrics(
      lyrics,
      title || 'Unknown Title',
      artist || 'Unknown Artist'
    );

    // 4. Save permanently to VPS disk cache
    try {
      fs.writeFileSync(filePath, JSON.stringify(translatedLyrics, null, 2), 'utf-8');
      console.info(`[LyricsTranslate] 💾 Successfully cached translation for "${videoId}" at ${filePath}`);
    } catch (writeErr) {
      console.warn('[LyricsTranslate] Warning writing translation to disk cache:', writeErr);
    }

    return createSuccessResponse(
      translatedLyrics,
      'Lirik berhasil diterjemahkan oleh Gemini AI.',
      200,
      {
        'X-Cache': 'MISS-GENERATED',
        'Cache-Control': 'public, s-maxage=604800, max-age=604800',
      }
    );
  } catch (error: any) {
    console.error('[LyricsTranslate] Unexpected translation error:', error);
    return createErrorResponse(
      error?.message || 'Gagal memproses terjemahan lirik AI.',
      500
    );
  }
}
