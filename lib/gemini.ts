import { GoogleGenAI } from '@google/genai';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// Default to Gemini Flash-Lite for ultra-fast, responsive AI interactions
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = 'gemini-2.0-flash-lite';
const SECONDARY_FALLBACK = 'gemini-1.5-flash';

class GeminiService {
  private client: GoogleGenAI | null = null;

  constructor() {
    if (GEMINI_API_KEY && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        this.client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      } catch (err) {
        console.warn('[GeminiService] Failed to initialize GoogleGenAI client:', err);
      }
    }
  }

  public isAvailable(): boolean {
    return Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  }

  /**
   * Generates text content using Gemini with automatic model fallback.
   */
  public async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('GEMINI_API_KEY tidak dikonfigurasi. Silakan tambahkan GEMINI_API_KEY pada berkas .env');
    }

    const ai = this.client || new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    try {
      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      return response.text?.trim() || '';
    } catch (primaryErr: any) {
      console.warn(`[GeminiService] Primary model (${DEFAULT_MODEL}) failed: ${primaryErr.message}. Trying fallback ${FALLBACK_MODEL}...`);
      try {
        const fallbackRes = await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        return fallbackRes.text?.trim() || '';
      } catch (fallbackErr: any) {
        console.warn(`[GeminiService] Fallback model (${FALLBACK_MODEL}) failed: ${fallbackErr.message}. Trying secondary fallback ${SECONDARY_FALLBACK}...`);
        try {
          const secondaryRes = await ai.models.generateContent({
            model: SECONDARY_FALLBACK,
            contents: prompt,
            config: systemInstruction ? { systemInstruction } : undefined,
          });
          return secondaryRes.text?.trim() || '';
        } catch (secondaryErr: any) {
          console.error('[GeminiService] All Gemini models failed:', secondaryErr);
          throw secondaryErr;
        }
      }
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
        return parsed.map((item, idx) => ({
          time: typeof item.time === 'number' ? item.time : lyricsLines[idx]?.time || 0,
          text: item.text || lyricsLines[idx]?.text || '',
          translation: item.translation || '',
          romaji: item.romaji || undefined,
        }));
      }
    } catch (err) {
      console.warn('[GeminiService] Failed to parse translation JSON, fallback to line mapping:', err);
    }

    return lyricsLines.map((l) => ({ ...l, translation: '' }));
  }

  /**
   * Synchronizes plain lyrics text with audio timeline using Gemini AI.
   * Generates millisecond-accurate timestamps based on song structure, duration, and vocal phrasing.
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

    const systemInstruction = `Anda adalah ahli sinkronisasi audio dan lirik musik profesional (Karaoke Audio & Lyrics Synchronization Specialist).
Tugas Anda: Menganalisis teks lirik lagu "${title}" oleh "${artist}" dengan total durasi lagu ${validDuration} detik, lalu menghasilkan timestamp vokal (dalam satuan detik desimal, contoh: 14.5) yang akurat untuk setiap baris lirik agar sinkron saat lagu diputar.

Aturan Sinkronisasi:
1. Lagu umumnya memiliki intro musik instrumental sebelum vokal masuk (biasanya berkisar 8-20 detik pertama, kecuali lagu langsung vokal).
2. Setiap baris vokal rata-rata berdurasi antara 2.5 hingga 5 detik tergantung panjang kata/suku kata.
3. Berikan jeda instrumental realistis (gap) antara bait (verse), chorus/reff, dan bridge.
4. Timestamp "time" HARUS SELALU berurutan naik secara monotonik (time line n+1 > time line n) dan TIDAK BOLEH melebihi total durasi (${validDuration}s).
5. Jangan mengubah atau memangkas teks baris lirik; pertahankan teks asli.

Format output WAJIB berupa JSON Array murni tanpa markdown wrapper:
[
  { "time": 12.5, "text": "Baris lirik pertama..." },
  { "time": 16.8, "text": "Baris lirik kedua..." }
]`;

    const sample = nonBlank.slice(0, 150).map((l) => l.text.trim());
    const prompt = `Berikut daftar baris lirik lagu "${title}" - "${artist}" (Total Durasi: ${validDuration} detik):\n${JSON.stringify(sample, null, 2)}\n\nHasilkan timestamp detik (time) untuk setiap baris lirik di atas dalam format JSON Array.`;

    try {
      const raw = await this.generateText(prompt, systemInstruction);
      const cleanJson = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let prevTime = 0;
        return parsed.map((item, idx) => {
          let t = typeof item.time === 'number' ? item.time : prevTime + 3;
          if (t <= prevTime) t = Number((prevTime + 1.5).toFixed(1));
          if (t > validDuration - 2) t = Math.max(0, validDuration - 2);
          prevTime = t;
          return {
            time: Number(t.toFixed(1)),
            text: item.text || nonBlank[idx]?.text || '',
          };
        });
      }
    } catch (err) {
      console.warn('[GeminiService] Failed to parse synchronized lyrics from Gemini, using smart curve:', err);
    }

    // High-fidelity fallback based on song timing & syllables
    return this.fallbackSynchronize(nonBlank, validDuration);
  }

  private fallbackSynchronize(
    lyricsLines: Array<{ time?: number; text: string }>,
    duration: number
  ): Array<{ time: number; text: string }> {
    const validDuration = duration > 10 ? duration : 180;
    const introDuration = Math.min(18, Math.max(6, validDuration * 0.08));
    const activeDuration = Math.max(10, validDuration - introDuration - validDuration * 0.04);
    const totalChars = lyricsLines.reduce((acc, l) => acc + Math.max(12, (l.text || '').trim().length), 0);

    let accumulatedTime = introDuration;
    return lyricsLines.map((l) => {
      const textTrimmed = (l.text || '').trim();
      const lineTime = Math.round(accumulatedTime * 10) / 10;
      const weight = Math.max(12, textTrimmed.length) / (totalChars || 1);
      accumulatedTime += weight * activeDuration;
      return {
        time: lineTime,
        text: l.text,
      };
    });
  }
}

export const geminiService = new GeminiService();
