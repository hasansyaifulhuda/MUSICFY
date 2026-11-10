/**
 * Backend Lyrics Web Scraper for MusicFY
 * Specializing in Indonesian and International lyrics extraction
 * (e.g. lirikonline.com, lyrics.ovh, etc.)
 */

export interface ScrapedLyrics {
  plainText: string;
  source: string;
}

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Normalizes text for comparison
 */
function normalizeString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Strips HTML tags and decodes common HTML entities
 */
function cleanHtmlContent(rawHtml: string): string {
  if (!rawHtml) return '';

  let text = rawHtml;

  // 1. Remove scripts and styles
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. Remove typical header/footer fluff in Indonesian lyrics sites
  text = text.replace(/<strong>\s*Berikut adalah Lirik[\s\S]*?<\/p>/gi, '');
  text = text.replace(/<p>\s*Berikut adalah Lirik[\s\S]*?<\/p>/gi, '');
  text = text.replace(/<strong>\s*Credits[\s\S]*$/gi, '');
  text = text.replace(/<p><strong>\s*Credits[\s\S]*$/gi, '');
  text = text.replace(/<div class="gmr-related[\s\S]*$/gi, '');

  // 3. Convert line breaks and paragraphs to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>\s*<p>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Decode HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#8211;/gi, '-')
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;/gi, '"')
    .replace(/&#8221;/gi, '"')
    .replace(/&#038;/gi, '&')
    .replace(/&#39;/gi, "'");

  // 6. Clean up line artifacts
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      // Filter out structural section tags like "Verse :", "Chorus :", "Intro :", "Outro :"
      if (/^(?:verse|chorus|reff|bridge|intro|outro)\s*[:\d]*$/i.test(l)) return false;
      return l.length > 0;
    });

  return lines.join('\n');
}

/**
 * Scrapes lyrics from lirikonline.com
 */
export async function scrapeLirikOnline(title: string, artist: string): Promise<ScrapedLyrics | null> {
  if (!title) return null;

  const queries = [
    artist ? `${title} ${artist}` : title,
    title,
  ];

  for (const q of queries) {
    try {
      const searchUrl = `https://www.lirikonline.com/?s=${encodeURIComponent(q.trim())}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': DESKTOP_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!searchRes.ok) continue;

      const html = await searchRes.text();

      // Find all candidate articles
      const articleRegex = /<h2 class="entry-title"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const candidates: Array<{ url: string; title: string; score: number }> = [];

      const normTargetTitle = normalizeString(title);
      const normTargetArtist = normalizeString(artist);

      let match: RegExpExecArray | null;
      while ((match = articleRegex.exec(html)) !== null) {
        const url = match[1];
        const postTitle = match[2].replace(/<[^>]+>/g, '').trim();
        const normPostTitle = normalizeString(postTitle);

        let score = 0;
        if (normTargetTitle && normPostTitle.includes(normTargetTitle)) score += 50;
        if (normTargetArtist && normPostTitle.includes(normTargetArtist)) score += 40;

        if (score > 0 || candidates.length === 0) {
          candidates.push({ url, title: postTitle, score });
        }
      }

      if (candidates.length === 0) continue;

      // Sort by relevance
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];

      // Fetch the post page
      const postRes = await fetch(best.url, {
        headers: {
          'User-Agent': DESKTOP_USER_AGENT,
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(3500),
      });

      if (!postRes.ok) continue;

      const postHtml = await postRes.text();
      const contentMatch = postHtml.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

      if (contentMatch && contentMatch[1]) {
        const cleaned = cleanHtmlContent(contentMatch[1]);
        if (cleaned && cleaned.length > 30) {
          return {
            plainText: cleaned,
            source: 'LirikOnline',
          };
        }
      }
    } catch (err: any) {
      console.warn(`[LyricsScraper] LirikOnline attempt for "${q}" error:`, err?.message || err);
    }
  }

  return null;
}

/**
 * Scrapes lyrics from Lyrics.ovh API
 */
export async function scrapeLyricsOvh(title: string, artist: string): Promise<ScrapedLyrics | null> {
  if (!title || !artist) return null;

  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2800),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.lyrics === 'string') {
        const clean = data.lyrics.replace(/^.*Paroles de la chanson.*\n?/im, '').trim();
        if (clean.length > 25) {
          return {
            plainText: clean,
            source: 'Lyrics.ovh',
          };
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Unified Multi-Provider Lyrics Web Scraper
 * Executes fallback chain across LirikOnline and secondary public lyric sources
 */
export async function scrapeLyricsFromWeb(
  cleanTitle: string,
  cleanArtist: string
): Promise<ScrapedLyrics | null> {
  // 1. Try LirikOnline (Specialized in Indonesian & Pop)
  const lirikOnlineResult = await scrapeLirikOnline(cleanTitle, cleanArtist);
  if (lirikOnlineResult) return lirikOnlineResult;

  // 2. Try Lyrics.ovh
  const ovhResult = await scrapeLyricsOvh(cleanTitle, cleanArtist);
  if (ovhResult) return ovhResult;

  return null;
}
