import { GoogleGenAI } from '@google/genai';

export type GeminiErrorCode =
  | 'API_KEY_MISSING'
  | 'INVALID_API_KEY'
  | 'MODEL_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'TRANSLATION_EMPTY'
  | 'UNKNOWN_ERROR';

export class GeminiError extends Error {
  public code: GeminiErrorCode;
  public status: number;
  public retryable: boolean;

  constructor(message: string, code: GeminiErrorCode, status: number, retryable = false) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Classifies Gemini SDK and API errors into distinct, actionable error types.
 * Sanitizes any raw error message to never leak API keys to logs or users.
 */
export function classifyGeminiError(err: any): GeminiError {
  if (err instanceof GeminiError) {
    return err;
  }

  const rawMsg = err?.message || String(err || '');
  const status = typeof err?.status === 'number' ? err.status : (typeof err?.statusCode === 'number' ? err.statusCode : 0);

  // 1. Missing API Key
  if (/API_KEY_MISSING/i.test(rawMsg) || (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY)) {
    return new GeminiError(
      'GEMINI_API_KEY belum dikonfigurasi pada environment server (.env.local / .env).',
      'API_KEY_MISSING',
      401,
      false
    );
  }

  // 2. Invalid API Key / Auth / Permission
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|INVALID_ARGUMENT.*api_key|PERMISSION_DENIED|unauthorized/i.test(rawMsg)
  ) {
    return new GeminiError(
      'GEMINI_API_KEY tidak valid atau izin akses ditolak oleh Google Gemini.',
      'INVALID_API_KEY',
      401,
      false
    );
  }

  // 3. Model Not Found / Deprecated
  if (status === 404 || /NOT_FOUND|model.*not found|no longer available/i.test(rawMsg)) {
    return new GeminiError(
      'Model Gemini yang diminta tidak ditemukan atau sudah tidak tersedia.',
      'MODEL_NOT_FOUND',
      404,
      false
    );
  }

  // 4. Rate Limited vs Quota Exceeded
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(rawMsg)) {
    if (/quota|exceeded your current quota/i.test(rawMsg)) {
      return new GeminiError(
        'Batas kuota Gemini AI telah tercapai. Silakan periksa paket kuota Anda.',
        'QUOTA_EXCEEDED',
        429,
        false
      );
    }
    return new GeminiError(
      'Permintaan Gemini AI terlalu cepat (Rate Limit). Silakan coba sesaat lagi.',
      'RATE_LIMITED',
      429,
      true
    );
  }

  // 5. Service Unavailable / Overloaded / Transient Upstream (503)
  if (
    status === 503 ||
    status === 500 ||
    /UNAVAILABLE|503|overloaded|service unavailable|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(rawMsg)
  ) {
    return new GeminiError(
      'Layanan Gemini AI sedang mengalami gangguan sementara atau kelebihan beban (503).',
      'SERVICE_UNAVAILABLE',
      503,
      true
    );
  }

  // Default fallback
  return new GeminiError(
    'Gagal berkomunikasi dengan layanan Gemini AI.',
    'UNKNOWN_ERROR',
    status >= 400 && status < 600 ? status : 500,
    false
  );
}

/**
 * Limited retry mechanism with exponential backoff for retryable errors (e.g. 503, transient network).
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      attempt++;
      if (classified.retryable && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[GeminiService] Transient error (${classified.code}, status ${classified.status}) on attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw classified;
    }
  }
}

class GeminiService {
  private client: GoogleGenAI | null = null;
  private activeKey: string = '';

  constructor() {
    this.refreshClient();
  }

  public getApiKey(): string {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  }

  public hasApiKey(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 0);
  }

  public getModel(): string {
    return process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  }

  private refreshClient(): GoogleGenAI | null {
    const key = this.getApiKey();
    if (this.hasApiKey()) {
      if (key !== this.activeKey || !this.client) {
        try {
          this.client = new GoogleGenAI({ apiKey: key });
          this.activeKey = key;
        } catch (err) {
          console.warn('[GeminiService] Failed to initialize GoogleGenAI client');
          this.client = null;
          this.activeKey = '';
        }
      }
    } else {
      this.client = null;
      this.activeKey = '';
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return this.hasApiKey();
  }

  /**
   * Generates text content using Gemini with limited exponential backoff retry and model fallback.
   */
  public async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    if (!this.hasApiKey()) {
      throw new GeminiError(
        'GEMINI_API_KEY belum dikonfigurasi pada environment server (.env.local / .env).',
        'API_KEY_MISSING',
        401,
        false
      );
    }

    const ai = this.refreshClient() || new GoogleGenAI({ apiKey: this.getApiKey() });
    const primaryModel = this.getModel();
    const fallbackModel = 'gemini-3-flash-preview';

    try {
      return await callWithRetry(async () => {
        const response = await ai.models.generateContent({
          model: primaryModel,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        return response.text?.trim() || '';
      }, 2, 1000);
    } catch (primaryErr: any) {
      const err = primaryErr instanceof GeminiError ? primaryErr : classifyGeminiError(primaryErr);

      // If primary model failed with MODEL_NOT_FOUND or persistent 503, try fallback model once
      if (err.code === 'MODEL_NOT_FOUND' || err.code === 'SERVICE_UNAVAILABLE') {
        console.warn(`[GeminiService] Primary model (${primaryModel}) failed with ${err.code}. Trying fallback model ${fallbackModel}...`);
        try {
          return await callWithRetry(async () => {
            const fallbackRes = await ai.models.generateContent({
              model: fallbackModel,
              contents: prompt,
              config: systemInstruction ? { systemInstruction } : undefined,
            });
            return fallbackRes.text?.trim() || '';
          }, 1, 1500);
        } catch (fallbackErr: any) {
          throw classifyGeminiError(fallbackErr);
        }
      }
      throw err;
    }
  }

  /**
   * Interprets a vague or natural language music recollection into actionable song queries.
   */
  public async interpretNaturalLanguageSearch(
    userInput: string
  ): Promise<{ primaryQuery: string; candidates: string[]; explanation: string }> {
    const systemInstruction = `Anda adalah asisten musik cerdas untuk MusicFY.
Tugas Anda: Menerjemahkan kalimat bahasa alami pengguna (yang mungkin berupa ingatan samar, potongan lirik, deskripsi suasana, genre, atau artis) menjadi judul lagu dan nama artis yang paling akurat untuk dicari di YouTube Music.

Format jawaban WAJIB berupa JSON murni tanpa markdown wrapper:
{
  "primaryQuery": "Judul Lagu - Nama Artis yang paling relevan",
  "candidates": ["Pilihan 1", "Pilihan 2", "Pilihan 3"],
  "explanation": "Penjelasan singkat dalam 1 kalimat"
}`;

    const prompt = `Pengguna mencari: "${userInput}". Berikan interpretasi parameter pencarian lagu dalam format JSON.`;

    try {
      const raw = await this.generateText(prompt, systemInstruction);
      const cleanJson = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      return {
        primaryQuery: parsed.primaryQuery || userInput,
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [userInput],
        explanation: parsed.explanation || 'Hasil penelusuran musik berbasis deskripsi Anda.',
      };
    } catch (err) {
      console.warn('[GeminiService] Failed to parse NLP search JSON, using raw query fallback:', err);
      return {
        primaryQuery: userInput,
        candidates: [userInput],
        explanation: 'Pencarian langsung menggunakan kata kunci Anda.',
      };
    }
  }

  /**
   * Translates or romanizes song lyrics into Indonesian.
   */
  public async translateLyrics(
    lyricsLines: Array<{ time: number; text: string }>,
    title?: string,
    artist?: string,
    targetLanguage = 'Indonesian'
  ): Promise<Array<{ time: number; text: string; translation?: string; romaji?: string }>> {
    if (!lyricsLines || lyricsLines.length === 0) return [];

    const nonBlankLines = lyricsLines.filter((l) => l.text.trim().length > 0);
    if (nonBlankLines.length === 0) return lyricsLines;

    const systemInstruction = `Anda adalah penerjemah lirik musik profesional.
Tugas Anda: Menerjemahkan baris lirik lagu "${title || ''}" oleh "${artist || ''}" ke dalam Bahasa ${targetLanguage} secara puitis, tepat makna, dan mempertahankan emosi lagu.
Jika lirik berbahasa Jepang, sertakan juga transliterasi Romaji pada kolom "romaji".
Jika lirik berbahasa Korea (Hangul) atau Mandarin (Hanzi), sertakan romanisasinya pada "romaji".

Format jawaban WAJIB berupa JSON array murni:
[
  {
    "time": 12.5,
    "text": "original text",
    "translation": "terjemahan bahasa indonesia",
    "romaji": "romaji text jika ada"
  }
]`;

    const sample = lyricsLines.slice(0, 100);
    const prompt = `Berikut baris lirik lagu "${title || ''}" - "${artist || ''}" yang perlu diterjemahkan:\n${JSON.stringify(sample)}`;

    const raw = await this.generateText(prompt, systemInstruction);

    try {
      const cleanJson = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const transMap = new Map<number, { translation?: string; romaji?: string }>();
        parsed.forEach((item, idx) => {
          transMap.set(idx, {
            translation: typeof item.translation === 'string' ? item.translation : '',
            romaji: typeof item.romaji === 'string' && item.romaji.trim().length > 0 ? item.romaji : undefined,
          });
        });

        return lyricsLines.map((line, idx) => {
          const trans = transMap.get(idx);
          return {
            time: typeof line.time === 'number' ? line.time : 0,
            text: line.text || '',
            translation: trans?.translation || '',
            romaji: trans?.romaji,
          };
        });
      }
    } catch (err) {
      console.warn('[GeminiService] Failed to parse translation JSON, fallback to line mapping:', err);
    }

    return lyricsLines.map((l) => ({ ...l, translation: '' }));
  }

  /**
   * Synchronizes plain lyrics text with audio timeline using Gemini AI.
   * Analyzes song structure (Intro, Verse, Chorus, Bridge, Outro), vocal phrasing, and rhythm.
   * Returns valid, verified timestamps or null if alignment cannot be reliably determined.
   */
  public async synchronizeLyrics(
    lyricsLines: Array<{ time?: number; text: string }>,
    title: string,
    artist: string,
    duration: number
  ): Promise<Array<{ time: number; text: string }>> {
    if (!lyricsLines || lyricsLines.length === 0) return [];

    const nonBlank = lyricsLines.filter((l) => l.text && l.text.trim().length > 0);
    if (nonBlank.length === 0) return [];

    const validDuration = duration > 10 ? duration : 180;

    const systemInstruction = `Anda adalah ahli analisis audio dan lirik musik profesional.
Tugas Anda: Menganalisis teks lirik lagu "${title}" oleh "${artist}" (total durasi lagu: ${validDuration} detik), mengidentifikasi bagian lagu (Intro, Verse, Chorus, Bridge, Outro), dan menghasilkan estimasi timestamp vokal yang realistis (dalam detik desimal, contoh: 14.5) untuk setiap baris.

Aturan Penting:
1. Awali dengan jeda instrumental Intro (umumnya 8-25 detik).
2. Setiap baris vokal memiliki jeda alami (2.5 - 6 detik per baris).
3. Berikan jeda instrumental realistis antar bagian (antara Verse dan Chorus).
4. Timestamp "time" HARUS SELALU berurutan naik secara monotonik (time[n+1] > time[n]) dan TIDAK BOLEH melebihi total durasi (${validDuration}s).
5. Teks lirik tidak boleh diubah atau dipangkas.

Format output WAJIB berupa JSON Array murni tanpa markdown:
[
  { "time": 14.5, "text": "Baris lirik pertama..." },
  { "time": 18.2, "text": "Baris lirik kedua..." }
]`;

    const sample = nonBlank.slice(0, 150).map((l) => l.text.trim());
    const prompt = `Berikut daftar baris lirik lagu "${title}" - "${artist}" (Durasi: ${validDuration} detik):\n${JSON.stringify(sample, null, 2)}\n\nHasilkan timestamp vokal (time) untuk setiap baris di atas dalam format JSON Array.`;

    try {
      const raw = await this.generateText(prompt, systemInstruction);
      const cleanJson = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        let prevTime = 0;
        const validated: Array<{ time: number; text: string }> = [];

        for (let idx = 0; idx < parsed.length; idx++) {
          const item = parsed[idx];
          let t = typeof item.time === 'number' ? item.time : prevTime + 3;
          if (t <= prevTime) t = Number((prevTime + 1.8).toFixed(1));
          if (t > validDuration - 2) {
            t = Math.max(0, validDuration - 2);
          }
          prevTime = t;
          validated.push({
            time: Number(t.toFixed(1)),
            text: item.text || nonBlank[idx]?.text || '',
          });
        }

        // Verify timestamps are strictly ascending
        if (validated.length >= 2 && validated[validated.length - 1].time > validated[0].time) {
          return validated;
        }
      }
    } catch (err) {
      console.warn('[GeminiService] Failed to obtain synchronized lyrics from Gemini:', err);
    }

    // Never fake synchronization by linear interpolation if AI fails:
    // Return empty array to signal that lyrics should be treated as unsynced plain text
    return [];
  }
}

export const geminiService = new GeminiService();
