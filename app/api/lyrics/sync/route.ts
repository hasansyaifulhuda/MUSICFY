import { createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

/**
 * Fitur sinkronisasi lirik otomatis berbasis AI telah dinonaktifkan karena estimasi
 * timestamp AI tidak memiliki akurasi gelombang suara vokal (akustik).
 * Lirik tersinkronisasi kini mengandalkan berkas LRC resmi/akustik (LRCLIB & YouTube Music).
 */
export async function GET() {
  return createErrorResponse('Fitur sinkronisasi otomatis AI telah dinonaktifkan.', 410);
}

export async function POST() {
  return createErrorResponse('Fitur sinkronisasi otomatis AI telah dinonaktifkan.', 410);
}
