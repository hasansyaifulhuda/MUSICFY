import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { geminiService, classifyGeminiError, GeminiError } from '@/lib/gemini';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), 'storage', 'lyrics_translations');

// In-flight request deduplication to prevent duplicate concurrent Gemini AI calls for the same song
const inFlightTranslations = new Map<string, Promise<any>>();

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

  if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
    return createErrorResponse('Parameter "id" wajib disertakan.', 400);
  }

  ensureCacheDir();
  const filePath = getCachePath(videoId.trim());

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
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
    }
  } catch (err) {
    console.warn('[LyricsTranslate] Error reading translation cache:', err);
  }

  // Return standard success payload with data: null on cache miss to avoid 404 errors in logs
  return createSuccessResponse(
    null,
    'Lirik terjemahan belum tersedia di cache.',
    200,
    {
      'X-Cache': 'MISS-DISK',
    }
  );
}

/**
 * Translates lyrics into Indonesian and provides Romaji for CJK tracks via Gemini AI,
 * saving results permanently to local VPS disk cache.
 * POST /api/lyrics/translate
 * Body: { videoId: string, title?: string, artist?: string, lyrics: LyricLine[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { videoId, title, artist, lyrics } = body;

    if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
      return createErrorResponse('Field "videoId" wajib disertakan.', 400);
    }

    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      return createErrorResponse('Array "lyrics" wajib disertakan dan tidak boleh kosong.', 400);
    }

    const safeId = videoId.trim();
    ensureCacheDir();
    const filePath = getCachePath(safeId);

    // 1. Fast-path: Check permanent disk cache
    if (fs.existsSync(filePath)) {
      try {
        const cachedRaw = fs.readFileSync(filePath, 'utf-8');
        const cachedData = JSON.parse(cachedRaw);
        if (Array.isArray(cachedData) && cachedData.length > 0) {
          return createSuccessResponse(
            cachedData,
            'Lirik terjemahan berhasil diambil dari cache permanen server.',
            200,
            {
              'X-Cache': 'HIT-DISK',
              'Cache-Control': 'public, s-maxage=604800, max-age=604800',
            }
          );
        }
      } catch {}
    }

    // 2. Check if Gemini AI API key is configured
    if (!geminiService.hasApiKey()) {
      return createErrorResponse(
        'GEMINI_API_KEY belum dikonfigurasi pada environment server (.env.local / .env).',
        401,
        { code: 'API_KEY_MISSING', available: false }
      );
    }

    // 3. Process translation with in-flight deduplication
    let translationPromise = inFlightTranslations.get(safeId);
    if (!translationPromise) {
      console.info(`[LyricsTranslate] 🤖 Translating lyrics for "${title || safeId}" via Gemini AI (${geminiService.getModel()})...`);
      translationPromise = geminiService.translateLyrics(
        lyrics,
        title || 'Unknown Title',
        artist || 'Unknown Artist'
      );
      inFlightTranslations.set(safeId, translationPromise);
    } else {
      console.info(`[LyricsTranslate] ⏳ Reusing in-flight Gemini translation for "${title || safeId}"...`);
    }

    let translatedLyrics;
    try {
      translatedLyrics = await translationPromise;
    } finally {
      inFlightTranslations.delete(safeId);
    }

    // 4. Validate translation quality - DO NOT cache or return fake/empty translations
    const hasValidTranslations =
      Array.isArray(translatedLyrics) &&
      translatedLyrics.some((l) => typeof l?.translation === 'string' && l.translation.trim().length > 0);

    if (!hasValidTranslations) {
      return createErrorResponse(
        'Layanan AI tidak dapat menghasilkan terjemahan untuk lirik ini.',
        502,
        { code: 'TRANSLATION_EMPTY' }
      );
    }

    // 5. Save permanently to VPS disk cache
    try {
      fs.writeFileSync(filePath, JSON.stringify(translatedLyrics, null, 2), 'utf-8');
      console.info(`[LyricsTranslate] 💾 Successfully cached translation for "${safeId}" at ${filePath}`);
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
    const classified = error instanceof GeminiError ? error : classifyGeminiError(error);
    console.error(`[LyricsTranslate] Translation failed (${classified.code}, status ${classified.status}):`, classified.message);

    return createErrorResponse(classified.message, classified.status, {
      code: classified.code,
      retryable: classified.retryable,
    });
  }
}
