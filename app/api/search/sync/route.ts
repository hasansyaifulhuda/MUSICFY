import { NextResponse } from 'next/server';
import { meilisearch } from '@/lib/meilisearch';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

/**
 * Meilisearch Health & Diagnostic Endpoint
 * GET /api/search/sync
 */
export async function GET() {
  try {
    const stats = await meilisearch.getStats();
    return createSuccessResponse(
      stats,
      stats.healthy
        ? 'Meilisearch engine online dan siap melayani pencarian turbo (<50ms).'
        : 'Meilisearch engine offline. Sistem otomatis menggunakan multi-tier fallback (YouTube Music & iTunes).',
      200
    );
  } catch (err: any) {
    return createErrorResponse(err.message || 'Gagal memeriksa status Meilisearch', 500);
  }
}

/**
 * Meilisearch Batch Track Indexing Endpoint
 * POST /api/search/sync
 * Body: { tracks: Track[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tracks = body.tracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      // Trigger index configuration verification
      const index = await meilisearch.getTracksIndex();
      return createSuccessResponse(
        { configured: Boolean(index) },
        'Indeks Meilisearch berhasil diinisialisasi dan disinkronkan.',
        200
      );
    }

    await meilisearch.indexTracks(tracks);
    const stats = await meilisearch.getStats();

    return createSuccessResponse(
      {
        indexedCount: tracks.length,
        totalDocuments: stats.numberOfDocuments,
      },
      `Berhasil mengindeks ${tracks.length} lagu ke Meilisearch.`,
      200
    );
  } catch (err: any) {
    return createErrorResponse(err.message || 'Gagal menyinkronkan data ke Meilisearch', 500);
  }
}

