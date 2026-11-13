import { NextResponse } from 'next/server';
import { geminiService } from '@/lib/gemini';
import { meilisearch } from '@/lib/meilisearch';
import { ytmusicClient } from '@/lib/ytmusicClient';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';
import { searchLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { buildAppUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = searchLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || !query.trim()) {
    return createErrorResponse('Parameter query "q" wajib disertakan.', 400);
  }

  const cleanQuery = query.trim();

  try {
    // 1. Check if Gemini AI is configured
    if (!geminiService.isAvailable()) {
      // Fallback directly to normal search if Gemini key is missing
      const fallbackTracks = await ytmusicClient.searchSongs(cleanQuery).catch(() => []);
      return createSuccessResponse(
        {
          interpretation: {
            primaryQuery: cleanQuery,
            candidates: [cleanQuery],
            explanation: 'Pencarian langsung menggunakan kata kunci Anda (Gemini API belum dikonfigurasi).',
          },
          tracks: fallbackTracks,
        },
        'Pencarian berhasil diselesaikan (mode fallback)',
        200
      );
    }

    // 2. Interpret natural language or vague recollection via Gemini
    const interpretation = await geminiService.interpretNaturalLanguageSearch(cleanQuery);

    // 3. Search candidate tracks across Meilisearch and YouTube Music
    let resolvedTracks: any[] = [];
    const searchTarget = interpretation.primaryQuery || interpretation.candidates[0] || cleanQuery;

    // Check Meilisearch first
    try {
      const meiliHits = await meilisearch.searchTracks(searchTarget, { limit: 15 });
      if (Array.isArray(meiliHits) && meiliHits.length > 0) {
        resolvedTracks = meiliHits;
      }
    } catch {}

    // If Meilisearch doesn't have sufficient results, search YouTube Music
    if (resolvedTracks.length < 5) {
      try {
        const ytResults = await ytmusicClient.searchSongs(searchTarget);
        if (Array.isArray(ytResults) && ytResults.length > 0) {
          const existingIds = new Set(resolvedTracks.map((t) => t.videoId));
          const newYt = ytResults.filter((t: any) => !existingIds.has(t.videoId));
          resolvedTracks = [...resolvedTracks, ...newYt];
          // Auto-index into Meilisearch
          meilisearch.indexTracks(ytResults).catch(() => {});
        }
      } catch (err) {
        console.warn('[AiSearchRoute] YouTube search failed for candidate query:', err);
      }
    }

    return createSuccessResponse(
      {
        interpretation,
        tracks: resolvedTracks,
      },
      'Pencarian bahasa alami berbasis AI berhasil diproses',
      200
    );
  } catch (error: any) {
    console.error('[AiSearchRoute] Error executing natural language search:', error);
    return createErrorResponse(
      error?.message || 'Terjadi kesalahan sistem saat memproses pencarian AI.',
      500
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = body.query || body.q;

    if (!query || !String(query).trim()) {
      return createErrorResponse('Field "query" wajib disertakan.', 400);
    }

    const dummyReq = new Request(buildAppUrl(`/api/ai/search?q=${encodeURIComponent(query)}`), {
      headers: request.headers,
    });
    return GET(dummyReq);
  } catch (err: any) {
    return createErrorResponse(err.message || 'Gagal memproses request POST pencarian AI', 500);
  }
}
