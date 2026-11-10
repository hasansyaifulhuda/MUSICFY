import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { MemoryCache } from '@/lib/cache';
import { ytmusicClient } from '@/lib/ytmusicClient';
import { scrapeLyricsFromWeb } from '@/lib/lyricsScraper';
import { geminiService } from '@/lib/gemini';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  synced: boolean;
  lyrics: LyricLine[];
  provider?: string;
  candidateDuration?: number;
  autoOffset?: number;
}

// In-memory LRU cache for 24 hours (Only populated when lyrics are successfully found)
const lyricsCache = new MemoryCache<LyricsResult>(1000, 1000 * 60 * 60 * 24);

function parseTimestampToSeconds(
  minutesOrHours: string | number,
  secondsOrMinutes: string | number,
  fractionalOrSeconds?: string | number,
  optionalFractional?: string
): number {
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let fracStr = '';

  if (optionalFractional !== undefined) {
    hours = parseInt(String(minutesOrHours), 10) || 0;
    minutes = parseInt(String(secondsOrMinutes), 10) || 0;
    seconds = parseInt(String(fractionalOrSeconds), 10) || 0;
    fracStr = String(optionalFractional || '').trim();
  } else {
    minutes = parseInt(String(minutesOrHours), 10) || 0;
    seconds = parseInt(String(secondsOrMinutes), 10) || 0;
    fracStr = String(fractionalOrSeconds || '').trim();
  }

  let ms = 0;
  if (fracStr) {
    const standardizedMsStr = fracStr.padEnd(3, '0').slice(0, 3);
    ms = parseInt(standardizedMsStr, 10) || 0;
  }

  const totalMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
  return Math.max(0, totalMs / 1000);
}

/**
 * Robust LRC Parser:
 * Supports standard and non-standard timestamps:
 * [hh:mm:ss.xxx], [mm:ss.xxx], [mm:ss.xx], [mm:ss:xx], [mm:ss,xx], [m:ss.xx], [mm:ss]
 * Multiple timestamp tags per line: [00:10.00][00:20.00]Repeated lyric line
 * Offset tags: [offset:+/-ms]
 */
function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];

  let offsetSeconds = 0;
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    const ms = parseInt(offsetMatch[1], 10);
    if (!isNaN(ms)) {
      offsetSeconds = ms / 1000;
    }
  }

  // Matches timestamps like [01:23.45], [01:23:45], [01:23,45], [01:23], [1:23.4]
  const tagRegex = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:,](\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip metadata headers
    if (/^\[(ti|ar|al|by|offset|length|re|ve|encoding):/i.test(trimmed)) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      let text = trimmed.replace(tagRegex, '').trim();
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      if (text) {
        for (const match of matches) {
          const hasHours = Boolean(match[1]);
          const totalSeconds = hasHours
            ? parseTimestampToSeconds(match[1], match[2], match[3], match[4]) + offsetSeconds
            : parseTimestampToSeconds(match[2], match[3], match[4]) + offsetSeconds;

          result.push({
            time: Math.max(0, Math.round(totalSeconds * 1000) / 1000),
            text,
          });
        }
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Cleanly formats plain lyrics text without artificial timestamps.
 */
function parsePlainLyrics(plainText: string, _totalDuration?: number): LyricLine[] {
  if (!plainText || typeof plainText !== 'string') return [];

  const rawLines = plainText
    .replaceAll('\r', '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  return rawLines.map((text) => ({
    time: 0,
    text,
  }));
}

/**
 * Normalizes diacritics and special accent characters:
 * e.g. "eńau" -> "enau", "café" -> "cafe", "Björk" -> "Bjork"
 */
function normalizeDiacritics(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Normalizes string for fuzzy similarity comparisons:
 * Removes diacritics, lowercase, removes all non-alphanumeric chars.
 */
function normalizeForComparison(str: string): string {
  return normalizeDiacritics(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clean track title and artist from YouTube noise, video labels,
 * collaborative tags, Indonesian keywords, and channel metadata.
 */
function cleanMetadata(rawTitle: string, rawArtist: string) {
  let cleanT = rawTitle || '';
  let cleanA = rawArtist || '';

  // 1. Strip leading track numbers like '01. ', '1 - ', '01 '
  cleanT = cleanT.replace(/^\s*\d{1,3}[\.\-\s]+\s*/, '');

  // 2. Strip trailing pipe or slash noise: e.g. '| Official Video', '|| Lirik Lagu', '/ Live at...'
  cleanT = cleanT.replace(
    /\s*[\|\/]{1,2}\s*(?:official|video|music|audio|lirik|lyric|live|klip|mv|visualizer|album|remix|hd|hq|4k|karaoke).*$/i,
    ''
  );
  cleanT = cleanT.replace(/\s*\|.*$/, '');

  // 3. Strip bracketed noise (English & Indonesian tags)
  const noisePattern =
    /\s*[\(\[\{](?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric|lyrics|lirik|mv|klip)|video\s*(?:klip|musik|lirik|resmi)|audio\s*(?:resmi|official)|lirik\s*(?:lagu|video|resmi)|klip\s*resmi|hd|hq|4k|remix|acoustic|akustik|live|version|versi|edit|karaoke|with\s+lyrics)[^\)\]\}]*[\)\]\}]/gi;
  cleanT = cleanT.replace(noisePattern, '');
  cleanA = cleanA.replace(noisePattern, '');

  // 4. Strip standalone Indonesian & English video tags
  cleanT = cleanT.replace(
    /\b(?:official\s*(?:music\s*)?video|video\s*(?:klip|musik|lirik|resmi)|audio\s*resmi|lirik\s*video|lirik\s*lagu)\b/gi,
    ''
  );

  // 5. Extract and strip featured collaborator tags
  let featArtist = '';
  const featMatch = cleanT.match(/\s*[\(\[\{]?(?:feat\.|ft\.|featuring)\s+([^\)\]\}]+)[\)\]\}]?/i);
  if (featMatch) {
    featArtist = featMatch[1].trim();
  }
  cleanT = cleanT.replace(/\s*[\(\[\{]?(?:feat\.|ft\.|featuring)\s+[^\)\]\}]+[\)\]\}]?/gi, '');
  cleanT = cleanT.replace(/\b(?:feat\.|ft\.|featuring)\b.*$/gi, '');

  // 6. Handle title containing 'Artist - Title' or 'Title - Artist'
  const separators = [' - ', ' – ', ' — '];
  for (const sep of separators) {
    if (cleanT.includes(sep)) {
      const parts = cleanT.split(sep);
      if (parts.length >= 2) {
        const p0 = parts[0].trim();
        const p1 = parts.slice(1).join(sep).trim();
        const isUnknownArtist =
          !cleanA ||
          cleanA.toLowerCase() === 'unknown artist' ||
          cleanA.toLowerCase() === 'artis' ||
          cleanA.toLowerCase() === 'various artists';

        if (isUnknownArtist) {
          cleanA = p0;
          cleanT = p1;
        } else if (cleanA.toLowerCase().includes(p0.toLowerCase()) || p0.toLowerCase().includes(cleanA.toLowerCase())) {
          cleanT = p1;
        } else {
          cleanT = p1;
        }
      }
      break;
    }
  }

  // 7. Extract primary artist (prioritize primary artist before comma, &, x, feat)
  let primaryArtist = cleanA
    .split(/[,&x\/]|(?:\b(?:feat\.|ft\.|featuring|x)\b)/i)[0]
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*Official$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/["'“”]/g, '')
    .trim();

  // Strip placeholder artists
  if (
    cleanA.toLowerCase() === 'unknown artist' ||
    cleanA.toLowerCase() === 'artis' ||
    cleanA.toLowerCase() === 'unknown'
  ) {
    cleanA = '';
    primaryArtist = '';
  }

  // Remove channel artifacts
  cleanA = cleanA.replace(/\s*-\s*Topic$/i, '').replace(/\s*Official$/i, '').replace(/VEVO$/i, '');

  cleanT = cleanT.replace(/["'“”]/g, '').replace(/\s+/g, ' ').trim();
  cleanA = cleanA.replace(/["'“”]/g, '').replace(/\s+/g, ' ').trim();

  // Simplified title without parentheticals or subtitles (for fallback passes)
  const simplifiedTitle = cleanT
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanTitle: cleanT || rawTitle,
    cleanArtist: cleanA,
    primaryArtist: primaryArtist || cleanA,
    featArtist,
    simplifiedTitle: simplifiedTitle || cleanT || rawTitle,
  };
}

/**
 * Duration-Centric Intelligent Candidate Scoring Algorithm:
 * Evaluates candidate suitability based on synced status, title match, artist match, and DURATION PROXIMITY.
 * Strictly penalizes duration mismatches (> 25s) to prevent mixing studio tracks with long music video cuts.
 */
function scoreCandidate(candidate: any, targetTitle: string, targetArtist: string, targetDuration: number): number {
  let score = 0;

  const hasSynced =
    candidate.syncedLyrics && typeof candidate.syncedLyrics === 'string' && candidate.syncedLyrics.trim().length > 20;
  const hasPlain =
    candidate.plainLyrics && typeof candidate.plainLyrics === 'string' && candidate.plainLyrics.trim().length > 20;

  if (hasSynced) {
    score += 80;
  } else if (hasPlain) {
    score += 15;
  } else {
    return -500; // No valid lyrics text
  }

  const candTitle = normalizeForComparison(candidate.trackName || candidate.name || '');
  const candArtist = normalizeForComparison(candidate.artistName || '');
  const normTargetTitle = normalizeForComparison(targetTitle);
  const normTargetArtist = normalizeForComparison(targetArtist);

  // Title match scoring
  if (normTargetTitle && candTitle) {
    if (candTitle === normTargetTitle) {
      score += 50;
    } else if (candTitle.includes(normTargetTitle) || normTargetTitle.includes(candTitle)) {
      score += 30;
    }
  }

  // Artist match scoring
  if (normTargetArtist && candArtist) {
    if (candArtist === normTargetArtist) {
      score += 40;
    } else if (candArtist.includes(normTargetArtist) || normTargetArtist.includes(candArtist)) {
      score += 25;
    }
  }

  // CRITICAL: DURATION SYNCHRONIZATION ACCURACY
  // High reward for close duration (studio versions), severe penalty for mismatched durations (video monologues/extended cuts)
  if (targetDuration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - targetDuration);
    if (diff <= 2) {
      score += 70; // Exact match (±2s)
    } else if (diff <= 5) {
      score += 50; // Very close match (±5s silence padding)
    } else if (diff <= 10) {
      score += 30; // Close match (±10s)
    } else if (diff <= 18) {
      score += 10;
    } else if (diff <= 30) {
      score -= 30; // Notable difference
    } else if (diff <= 60) {
      score -= 90; // Heavy penalty: likely extended or shortened version
    } else {
      score -= 160; // Severe penalty: completely wrong version (e.g. 442s vs 210s)
    }
  }

  return score;
}

/**
 * Robust fetch for LRCLIB with official client headers, 503 ServerOverloaded retry, and responsive timeout
 */
async function fetchLrclib(url: string, timeoutMs: number = 2200): Promise<any[]> {
  const headers = {
    'User-Agent': 'MusicFY/3.0 (Web Music Player; https://musicfy.app; contact: support@musicfy.app)',
    'Lrclib-Client': 'MusicFY-Player',
    Accept: 'application/json',
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const currentTimeout = attempt === 0 ? timeoutMs : 1200;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, currentTimeout);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object' && data.id) return [data];
      }

      // If LRCLIB is experiencing a momentary spike (503 ServerOverloaded), back off briefly and retry once
      if (res.status === 503 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      return [];
    } catch {
      clearTimeout(timer);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      return [];
    }
  }

  return [];
}

/**
 * Strictly evaluates candidates and extracts the best MATCH with VALID SYNCED LYRICS.
 * Guarantees that only valid timestamped lyrics with at least 2 lines and matching duration are accepted.
 */
function extractBestSyncedLyrics(
  candidates: any[],
  targetTitle: string,
  targetArtist: string,
  duration: number
): LyricsResult | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const validSyncedCandidates = candidates.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.syncedLyrics === 'string' &&
      c.syncedLyrics.trim().length > 20
  );

  if (validSyncedCandidates.length === 0) return null;

  // Score all candidates with duration proximity
  const scored = validSyncedCandidates
    .map((cand) => ({
      candidate: cand,
      score: scoreCandidate(cand, targetTitle, targetArtist, duration),
    }))
    .sort((a, b) => b.score - a.score);

  for (const { candidate, score } of scored) {
    // If the score is negative or very low due to severe duration mismatch (>45s), reject it
    if (score < 40) continue;

    const parsed = parseLRC(candidate.syncedLyrics);
    const isValidSynced =
      parsed.length >= 2 &&
      parsed.every((l) => typeof l.time === 'number' && !isNaN(l.time) && isFinite(l.time) && l.time >= 0) &&
      parsed.some((l) => l.time > 0);

    if (isValidSynced) {
      const lastLineTime = parsed[parsed.length - 1]?.time || 0;
      // Safeguard: If audio duration is known and > 30s,
      // the lyrics must NOT exceed duration + 15s (prevents music video extended cuts)
      if (duration > 30 && lastLineTime > duration + 15) {
        continue;
      }

      return {
        synced: true,
        lyrics: parsed,
        provider: 'LRCLIB (Synced)',
        candidateDuration: candidate.duration,
      };
    }
  }

  return null;
}

/**
 * Extracts plain lyrics ONLY as a last-resort fallback when NO synced lyrics exist.
 */
function extractBestPlainLyrics(
  candidates: any[],
  targetTitle: string,
  targetArtist: string,
  duration: number
): LyricsResult | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const validPlainCandidates = candidates.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.plainLyrics === 'string' &&
      c.plainLyrics.trim().length > 20
  );

  if (validPlainCandidates.length === 0) return null;

  const scored = validPlainCandidates
    .map((cand) => ({
      candidate: cand,
      score: scoreCandidate(cand, targetTitle, targetArtist, duration),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score > 20) {
    const best = scored[0].candidate;
    const parsed = parsePlainLyrics(best.plainLyrics, duration);
    if (parsed.length > 0) {
      return {
        synced: false,
        lyrics: parsed,
        provider: 'LRCLIB (Plain Fallback)',
        candidateDuration: best.duration,
      };
    }
  }

  return null;
}

/**
 * Transforms plain lyrics into synchronized timed lyrics using Gemini AI (Flash-Lite),
 * or falls back gracefully to plain lyrics if AI is unavailable.
 */
async function enrichPlainLyricsWithAI(
  rawLines: LyricLine[],
  title: string,
  artist: string,
  duration: number,
  sourceName: string
): Promise<LyricsResult> {
  if (geminiService.isAvailable() && duration > 15 && rawLines.length >= 2) {
    try {
      console.info(
        `[LyricsRoute] Converting plain lyrics to timed lyrics via Gemini AI for "${title}" - "${artist}" (${duration}s)...`
      );
      const timedLines = await geminiService.synchronizeLyrics(rawLines, title, artist, duration);
      if (timedLines && timedLines.length >= 2 && timedLines.some((l) => l.time > 0)) {
        return {
          synced: true,
          lyrics: timedLines,
          provider: `${sourceName} (Gemini AI Timed)`,
          candidateDuration: duration,
        };
      }
    } catch (aiErr: any) {
      console.warn(`[LyricsRoute] Gemini AI timing failed for "${title}":`, aiErr?.message || aiErr);
    }
  }

  return {
    synced: false,
    lyrics: rawLines,
    provider: sourceName,
    candidateDuration: duration,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || '';
  const rawTitle = searchParams.get('title') || '';
  const rawArtist = searchParams.get('artist') || '';
  const durationParam = searchParams.get('duration');
  const duration = durationParam ? parseFloat(durationParam) : 200;
  const force = searchParams.get('force') === 'true' || searchParams.get('force') === '1';

  if (!id && !rawTitle) {
    return createErrorResponse('Parameter "id" atau "title" wajib disertakan.', 400);
  }

  // Clean metadata from video tags, noise, and featured labels
  const { cleanTitle, cleanArtist, primaryArtist, featArtist, simplifiedTitle } = cleanMetadata(rawTitle, rawArtist);
  const cacheKey = `${id}_${cleanTitle}_${cleanArtist}`.toLowerCase();

  // 1. FAST-BAIL FOR LONG TRACKS (1-Hour Mix, Full Album, Compilation, DJ Set, Cover Mix)
  // Prevents heavy external scraping, API rate limits, or infinite loading on long tracks
  const isLongAudio =
    duration > 600 ||
    /(?:full\s*album|mix|nonstop|1\s*hour|1\s*jam|2\s*hour|live\s*set|compilation|dj\s*set|mashup)/i.test(
      rawTitle
    );

  if (isLongAudio) {
    return createSuccessResponse(
      {
        synced: false,
        lyrics: [],
        isLongAudio: true,
        provider: 'none',
      },
      'Lirik tidak tersedia untuk trek/album durasi panjang ini.',
      200,
      {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }
    );
  }

  // If forced retry requested, purge cached records
  if (force) {
    lyricsCache.delete(cacheKey);
    if (id) lyricsCache.delete(`vid:${id}`);
  }

  // Check in-memory cache
  if (!force) {
    const cached = lyricsCache.get(cacheKey) || (id ? lyricsCache.get(`vid:${id}`) : null);
    if (cached && Array.isArray(cached.lyrics) && cached.lyrics.length > 0) {
      return createSuccessResponse(cached, 'Lirik lagu berhasil dimuat (Cache)', 200, {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Cache': 'HIT',
      });
    }
  }

  // =========================================================================
  // MULTI-LAYER SEARCH MECHANISM (Strict Synced-Lyrics-First Priority)
  // Executes targeted queries across LRCLIB with duration tolerance.
  // =========================================================================

  const specificPromise = (async (): Promise<any[]> => {
    const urls: string[] = [];

    // Query with clean title and artist
    if (cleanArtist) {
      urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`);
      urls.push(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`);
    }

    // Query with primary artist (if collaboration or duet)
    if (primaryArtist && primaryArtist !== cleanArtist) {
      urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}`);
      urls.push(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`);
    }

    // Query with simplified title (stripped parentheticals / subtitles)
    if (simplifiedTitle && simplifiedTitle !== cleanTitle) {
      urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${simplifiedTitle} ${primaryArtist || cleanArtist}`)}`);
      urls.push(`https://lrclib.net/api/get?track_name=${encodeURIComponent(simplifiedTitle)}&artist_name=${encodeURIComponent(primaryArtist || cleanArtist)}`);
    }

    if (featArtist && cleanArtist) {
      urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist} ${featArtist}`)}`);
    }

    if (urls.length === 0) return [];
    const settled = await Promise.all(urls.map((u) => fetchLrclib(u, 2200)));
    return settled.flat();
  })();

  const broadPromise = (async (): Promise<any[]> => {
    const broadUrls: string[] = [
      `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`,
    ];
    if (simplifiedTitle && simplifiedTitle !== cleanTitle) {
      broadUrls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(simplifiedTitle)}`);
    }
    const settled = await Promise.all(broadUrls.map((u) => fetchLrclib(u, 2200)));
    return settled.flat();
  })();

  // Execute both queries concurrently
  const [candidates1, candidates2] = await Promise.all([specificPromise, broadPromise]);

  // -------------------------------------------------------------------------
  // PRIORITY CHECK 1: Specific search candidates with VALID SYNCED LYRICS
  // -------------------------------------------------------------------------
  const syncedResult1 = extractBestSyncedLyrics(candidates1, cleanTitle, cleanArtist, duration);
  if (syncedResult1) {
    lyricsCache.set(cacheKey, syncedResult1);
    if (id) lyricsCache.set(`vid:${id}`, syncedResult1);
    return createSuccessResponse(syncedResult1, 'Lirik lagu berhasil dimuat (Synced)', 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  // -------------------------------------------------------------------------
  // PRIORITY CHECK 2: Synced-First Fallback Search (Title Only across DB)
  // Evaluates database candidates with duration proximity scoring
  // -------------------------------------------------------------------------
  const syncedResult2 = extractBestSyncedLyrics(candidates2, cleanTitle, cleanArtist, duration);
  if (syncedResult2) {
    lyricsCache.set(cacheKey, syncedResult2);
    if (id) lyricsCache.set(`vid:${id}`, syncedResult2);
    return createSuccessResponse(syncedResult2, 'Lirik lagu berhasil dimuat (Fallback Synced)', 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  // -------------------------------------------------------------------------
  // PRIORITY 2: Backend Scraper (LirikOnline / Lyrics.ovh) & Plain Lyrics Sources
  // If synced lyrics were not found, search web scraper and secondary providers,
  // then convert plain text to timed lyrics via Gemini AI!
  // -------------------------------------------------------------------------
  let plainCandidatesText: { text: string; source: string } | null = null;

  // 2A. Check Web Scraper (LirikOnline / lyrics.ovh)
  try {
    const scraped = await scrapeLyricsFromWeb(cleanTitle, cleanArtist || primaryArtist);
    if (scraped && scraped.plainText && scraped.plainText.length > 30) {
      plainCandidatesText = { text: scraped.plainText, source: scraped.source };
    }
  } catch (scrapeErr: any) {
    console.warn('[LyricsRoute] Web scraper error:', scrapeErr?.message || scrapeErr);
  }

  // 2B. If scraper didn't find, check LRCLIB plain text candidates
  if (!plainCandidatesText) {
    const plainResult1 = extractBestPlainLyrics(candidates1, cleanTitle, cleanArtist, duration);
    if (plainResult1 && plainResult1.lyrics.length > 0) {
      const combinedText = plainResult1.lyrics.map((l) => l.text).join('\n');
      plainCandidatesText = { text: combinedText, source: 'LRCLIB' };
    }
  }

  if (!plainCandidatesText) {
    const plainResult2 = extractBestPlainLyrics(candidates2, cleanTitle, cleanArtist, duration);
    if (plainResult2 && plainResult2.lyrics.length > 0) {
      const combinedText = plainResult2.lyrics.map((l) => l.text).join('\n');
      plainCandidatesText = { text: combinedText, source: 'LRCLIB' };
    }
  }

  // 2C. If still not found, check YouTube Music Transcript
  if (!plainCandidatesText && id && id.length === 11) {
    try {
      const ready = await ytmusicClient.ensureInitialized();
      if (ready) {
        const ytmusic = ytmusicClient.getRawInstance();
        const watchPlaylistData = await (ytmusic as any).constructRequest('next', { videoId: id });
        const tabs =
          watchPlaylistData?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
            ?.watchNextTabbedResultsRenderer?.tabs;
        let lyricsId = null;

        if (tabs) {
          for (const tab of tabs) {
            const tabRenderer = tab.tabRenderer;
            if (
              tabRenderer?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
                ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS'
            ) {
              lyricsId = tabRenderer.endpoint.browseEndpoint.browseId;
              break;
            }
          }
        }

        if (lyricsId) {
          const lyricsData = await (ytmusic as any).constructRequest('browse', { browseId: lyricsId });
          const runs =
            lyricsData?.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs;
          let lyricsText = null;

          if (runs) {
            lyricsText = runs.map((r: any) => r.text).join('');
          }

          if (lyricsText && !lyricsText.includes('Lyrics not available') && lyricsText.trim().length > 20) {
            plainCandidatesText = { text: lyricsText, source: 'YouTube Music' };
          }
        }
      }
    } catch {}
  }

  // -------------------------------------------------------------------------
  // STAGE 3: Transform Plain Text to Timed Lyrics via Gemini AI
  // -------------------------------------------------------------------------
  if (plainCandidatesText) {
    const plainLines = parsePlainLyrics(plainCandidatesText.text, duration);
    if (plainLines.length > 0) {
      const enrichedResult = await enrichPlainLyricsWithAI(
        plainLines,
        cleanTitle,
        cleanArtist || primaryArtist,
        duration,
        plainCandidatesText.source
      );

      lyricsCache.set(cacheKey, enrichedResult);
      if (id) lyricsCache.set(`vid:${id}`, enrichedResult);

      const msg = enrichedResult.synced
        ? `Lirik lagu berhasil disinkronkan (${enrichedResult.provider})`
        : `Lirik lagu dimuat (${enrichedResult.provider})`;

      return createSuccessResponse(enrichedResult, msg, 200, {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      });
    }
  }

  // If no lyrics could be found across all layers:
  return createSuccessResponse(
    { synced: false, lyrics: [], isLongAudio: false, provider: 'none' },
    'Lirik lagu belum tersedia',
    200
  );
}
