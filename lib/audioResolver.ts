import { spawn } from 'child_process';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { streamCache } from '@/lib/cache';
import { getYtDlpHeaderArgs, getRandomBrowserProfile } from '@/lib/stealthHeaders';
import { streamQueue, QueuePriority } from '@/lib/requestQueue';
import { retryWithBackoff, isRetryableError } from '@/lib/retry';
import { COOKIE_INVALID_PATTERNS, isCookieError, cookieRotator } from '@/lib/cookieRotator';

export interface ResolvedAudioStream {
  videoId: string;
  url: string;
  title: string;
  duration?: number;
  ext: string;
  acodec?: string;
  abr?: number;
  filesize?: number;
  httpHeaders: Record<string, string>;
  cached?: boolean;
  expiresAt?: number;
}

export interface CookieHealthStatus {
  hasFile: boolean;
  isValid: boolean;
  lastChecked: number | null;
  lastWarning: string | null;
}

// Global in-memory cookie health tracker for server diagnostics
export const cookieHealthState: CookieHealthStatus = {
  hasFile: false,
  isValid: true,
  lastChecked: null,
  lastWarning: null,
};

// Curated rotation pool of realistic desktop browser User-Agents (Chrome 131+, Safari 18, Firefox 133, Edge 131)
const STEALTH_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

export function getRandomStealthUserAgent(): string {
  return STEALTH_USER_AGENTS[Math.floor(Math.random() * STEALTH_USER_AGENTS.length)];
}

/**
 * Returns the environment with all needed binary directories prepended to PATH.
 * Guarantees yt-dlp, deno (EJS challenge solver), and ffmpeg are accessible on VPS / container.
 */
function getExtendedEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || '/root';
  const customBinDirs: string[] = [];
  if (process.env.FFMPEG_PATH) {
    customBinDirs.push(path.dirname(process.env.FFMPEG_PATH));
  }
  if (process.env.DENO_PATH) {
    customBinDirs.push(path.dirname(process.env.DENO_PATH));
  }
  if (process.env.YTDLP_PATH && process.env.YTDLP_PATH !== 'yt-dlp') {
    customBinDirs.push(path.dirname(process.env.YTDLP_PATH));
  }

  const binPaths = [
    ...customBinDirs,
    path.join(home, '.local', 'bin'),
    path.join(home, '.deno', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const existingPath = process.env.PATH || '';
  const mergedPath = Array.from(new Set([...binPaths, ...existingPath.split(':')]))
    .filter(Boolean)
    .join(':');

  return {
    ...process.env,
    PATH: mergedPath,
  };
}

/**
 * Locates the yt-dlp executable path, honoring process.env.YTDLP_PATH if configured.
 */
export function findYtDlpBinary(): string {
  if (process.env.YTDLP_PATH) {
    const custom = process.env.YTDLP_PATH.trim();
    if (custom === 'yt-dlp') return 'yt-dlp';
    try {
      if (fs.existsSync(custom) && fs.statSync(custom).isFile()) {
        return custom;
      }
    } catch {}
  }

  const home = process.env.HOME || '/root';
  const candidates = [
    path.join(home, '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp',
  ];

  for (const c of candidates) {
    if (c === 'yt-dlp') return 'yt-dlp';
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return c;
      }
    } catch {}
  }
  return 'yt-dlp';
}

/**
 * Validates and normalizes YouTube video ID, iTunes synthetic ID, or URL.
 * Strictly prevents command injection by rejecting any non-conforming characters.
 */
export function sanitizeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Exactly 11-char YouTube ID (alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle iTunes fallback synthetic IDs (e.g. itunes:123456789)
  if (/^itunes:\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Handle standard YouTube URLs
  const urlPatterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export interface CookieValidationResult {
  hasFile: boolean;
  filePath: string;
  fileSizeBytes: number;
  totalLines: number;
  youtubeCookiesCount: number;
  hasAuthSession: boolean;
  activeCookiesCount: number;
  expiredCookiesCount: number;
  earliestExpiryDate: Date | null;
  latestExpiryDate: Date | null;
  isValid: boolean;
  status: 'OPTIMAL' | 'DEGRADED' | 'EXPIRED' | 'MISSING' | 'INVALID_FORMAT';
  message: string;
}

/**
 * Validates the root cookies.txt file on server boot.
 * Checks format, session keys, and expiration timestamps.
 */
export function validateCookiesFile(): CookieValidationResult {
  const cookiesPath = path.join(process.cwd(), 'cookies.txt');
  if (!fs.existsSync(cookiesPath)) {
    return {
      hasFile: false,
      filePath: cookiesPath,
      fileSizeBytes: 0,
      totalLines: 0,
      youtubeCookiesCount: 0,
      hasAuthSession: false,
      activeCookiesCount: 0,
      expiredCookiesCount: 0,
      earliestExpiryDate: null,
      latestExpiryDate: null,
      isValid: false,
      status: 'MISSING',
      message: 'File cookies.txt tidak ditemukan di root project VPS.',
    };
  }

  try {
    const stat = fs.statSync(cookiesPath);
    if (!stat.isFile() || stat.size === 0) {
      return {
        hasFile: true,
        filePath: cookiesPath,
        fileSizeBytes: stat.size,
        totalLines: 0,
        youtubeCookiesCount: 0,
        hasAuthSession: false,
        activeCookiesCount: 0,
        expiredCookiesCount: 0,
        earliestExpiryDate: null,
        latestExpiryDate: null,
        isValid: false,
        status: 'INVALID_FORMAT',
        message: 'File cookies.txt kosong (0 bytes).',
      };
    }

    const content = fs.readFileSync(cookiesPath, 'utf-8');
    const lines = content.split('\n');

    let youtubeCookiesCount = 0;
    let activeCookiesCount = 0;
    let expiredCookiesCount = 0;
    let earliestExpiry: number | null = null;
    let latestExpiry: number | null = null;
    const authKeysFound = new Set<string>();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const criticalAuthKeys = new Set([
      '__Secure-3PSID',
      '__Secure-1PSID',
      'LOGIN_INFO',
      'SAPISID',
      'SID',
      'HSID',
      'SSID',
      'VISITOR_INFO1_LIVE',
    ]);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split('\t');
      if (parts.length >= 7) {
        const [domain, , , , expiryStr, name] = parts;
        if (domain.includes('youtube.com') || domain.includes('google.com')) {
          youtubeCookiesCount++;
          if (criticalAuthKeys.has(name)) {
            authKeysFound.add(name);
          }

          const expiry = parseInt(expiryStr, 10);
          if (!isNaN(expiry) && expiry > 0) {
            if (expiry < nowSeconds) {
              expiredCookiesCount++;
            } else {
              activeCookiesCount++;
              if (earliestExpiry === null || expiry < earliestExpiry) earliestExpiry = expiry;
              if (latestExpiry === null || expiry > latestExpiry) latestExpiry = expiry;
            }
          } else {
            // Session cookie (expiry 0)
            activeCookiesCount++;
          }
        }
      }
    }

    const hasAuthSession =
      authKeysFound.has('LOGIN_INFO') ||
      authKeysFound.has('__Secure-3PSID') ||
      authKeysFound.has('SID');

    let status: CookieValidationResult['status'] = 'OPTIMAL';
    let message = 'File cookies.txt valid dan sesi YouTube aktif.';

    if (youtubeCookiesCount === 0) {
      status = 'INVALID_FORMAT';
      message = 'Tidak ditemukan entri cookie untuk domain .youtube.com.';
    } else if (activeCookiesCount === 0 && expiredCookiesCount > 0) {
      status = 'EXPIRED';
      message = 'Seluruh cookie YouTube telah kedaluwarsa. Harap perbarui cookies.txt!';
    } else if (!hasAuthSession) {
      status = 'DEGRADED';
      message = 'Cookie YouTube ditemukan tetapi tidak memiliki sesi login (LOGIN_INFO / __Secure-3PSID).';
    }

    const result: CookieValidationResult = {
      hasFile: true,
      filePath: cookiesPath,
      fileSizeBytes: stat.size,
      totalLines: lines.length,
      youtubeCookiesCount,
      hasAuthSession,
      activeCookiesCount,
      expiredCookiesCount,
      earliestExpiryDate: earliestExpiry ? new Date(earliestExpiry * 1000) : null,
      latestExpiryDate: latestExpiry ? new Date(latestExpiry * 1000) : null,
      isValid: status === 'OPTIMAL' || status === 'DEGRADED',
      status,
      message,
    };

    return result;
  } catch (err: any) {
    return {
      hasFile: true,
      filePath: cookiesPath,
      fileSizeBytes: 0,
      totalLines: 0,
      youtubeCookiesCount: 0,
      hasAuthSession: false,
      activeCookiesCount: 0,
      expiredCookiesCount: 0,
      earliestExpiryDate: null,
      latestExpiryDate: null,
      isValid: false,
      status: 'INVALID_FORMAT',
      message: `Gagal membaca cookies.txt: ${err?.message || err}`,
    };
  }
}

let hasLoggedStartupBanner = false;

/**
 * Diagnostic logger that prints an informative banner on server start.
 */
export function logStartupCookieDiagnostic() {
  if (hasLoggedStartupBanner) return;
  hasLoggedStartupBanner = true;

  const result = validateCookiesFile();
  cookieHealthState.hasFile = result.hasFile;
  cookieHealthState.isValid = result.isValid;
  cookieHealthState.lastChecked = Date.now();

  const expiryFormatted = result.latestExpiryDate
    ? result.latestExpiryDate.toISOString().split('T')[0]
    : 'N/A';

  if (result.status === 'OPTIMAL') {
    console.info('\n' + [
      '╔══════════════════════════════════════════════════════════════════════════════╗',
      '║ 🛡️  [COOKIE VALIDATOR] Status Pemeriksaan cookies.txt Root VPS               ║',
      '╠══════════════════════════════════════════════════════════════════════════════╣',
      `║ File     : ${(result.filePath.slice(-40) + ' (' + Math.round(result.fileSizeBytes / 1024) + ' KB)').padEnd(65)} ║`,
      `║ Sesi YT  : AKTIF (${result.youtubeCookiesCount} cookie, LOGIN_INFO, __Secure-3PSID terverifikasi)`.padEnd(79) + '║',
      `║ Masa Exp : Aktif s/d ${expiryFormatted} (${result.activeCookiesCount} aktif)`.padEnd(79) + '║',
      '║ Status   : [OPTIMAL] Siap digunakan untuk pemutaran audio stealth            ║',
      '╚══════════════════════════════════════════════════════════════════════════════╝',
    ].join('\n') + '\n');
  } else {
    console.warn('\n' + [
      '╔══════════════════════════════════════════════════════════════════════════════╗',
      '║ ⚠️  [COOKIE VALIDATOR] Peringatan Kondisi cookies.txt Root VPS              ║',
      '╠══════════════════════════════════════════════════════════════════════════════╣',
      `║ Status   : [${result.status}] ${result.message}`.slice(0, 78).padEnd(79) + '║',
      '║ Fallback : Beralih otomatis ke multi-tier mobile/visionos tanpa cookies      ║',
      '║ Solusi   : Update berkas cookies.txt jika ingin kualitas m4a 128kbps penuh   ║',
      '╚══════════════════════════════════════════════════════════════════════════════╝',
    ].join('\n') + '\n');
  }
}

// Automatically trigger startup verification on module load
try {
  logStartupCookieDiagnostic();
} catch {}

/**
 * Safely retrieves the next active cookie file using multi-cookie round-robin rotation.
 * Checks cookies1.txt - cookies5.txt and falls back to cookies.txt.
 */
export function getCookiesPath(): string | null {
  try {
    const rotatedPath = cookieRotator.getNextCookiePath();
    if (rotatedPath) {
      cookieHealthState.hasFile = true;
      return rotatedPath;
    }
  } catch (err) {
    console.warn('[AudioResolver] Warning retrieving rotated cookie:', err);
  }
  cookieHealthState.hasFile = false;
  return null;
}

/**
 * Formats and prints an eye-catching VPS terminal alert when cookie failure is detected.
 */
function logCookieWarningBanner(reason: string) {
  cookieHealthState.isValid = false;
  cookieHealthState.lastChecked = Date.now();
  cookieHealthState.lastWarning = reason;

  console.warn('\n' + [
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║ ⚠️  [COOKIES ALERT] YouTube Session Invalidation / Bot Check Detected!      ║',
    '╠══════════════════════════════════════════════════════════════════════════════╣',
    `║ Reason   : ${reason.slice(0, 65).padEnd(65)} ║`,
    '║ Fallback : Beralih otomatis ke resolver mobile/visionos tanpa cookies        ║',
    '║ Action   : Silakan refresh/update berkas cookies.txt di root project VPS     ║',
    '╚══════════════════════════════════════════════════════════════════════════════╝',
  ].join('\n') + '\n');
}

/**
 * Configurable yt-dlp stream resolution timeout (default: 60s, min 60-120s recommended).
 * Setting AUDIO_RESOLVER_TIMEOUT_MS to '0' or 'none' removes the timeout limit.
 */
const defaultResolverTimeoutMs = (() => {
  const envTimeout = process.env.AUDIO_RESOLVER_TIMEOUT_MS;
  if (envTimeout === '0' || envTimeout === 'none' || envTimeout === 'false') {
    return 0; // Disabled / unlimited
  }
  const parsed = parseInt(envTimeout || '60000', 10);
  return isNaN(parsed) ? 60000 : parsed;
})();

/**
 * Executes yt-dlp via child_process.spawn with:
 * - Array arguments (shell: false, immune to command injection)
 * - Extended 60-second default timeout (or disabled) with SIGTERM + SIGKILL escalation
 * - Rich server-side console logging for debugging VPS execution
 * - Memory leak prevention: listener detachments & buffer capping
 */
function runYtDlpProcess(
  args: string[],
  timeoutMs = defaultResolverTimeoutMs,
  resourceKey = ''
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const execute = () =>
    new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const startTime = Date.now();
      const ytDlpBin = findYtDlpBinary();
      const env = getExtendedEnv();

      const child = spawn(ytDlpBin, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const MAX_BUFFER = 5 * 1024 * 1024; // 5MB buffer cap

      let timer: NodeJS.Timeout | null = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            const elapsed = Date.now() - startTime;
            console.error(
              `[AudioResolver] ⏱️ TIMEOUT: yt-dlp stream resolution exceeded ${timeoutMs}ms (elapsed: ${elapsed}ms) for PID ${child.pid}!\n` +
              `Binary: ${ytDlpBin}\n` +
              `Args: ${args.slice(0, 8).join(' ')} ...\n` +
              `Stderr snapshot at timeout:\n${stderr.trim() || '(no stderr produced)'}`
            );

            try {
              child.stdout?.removeAllListeners();
              child.stderr?.removeAllListeners();
            } catch {}

            try {
              child.kill('SIGTERM');
              const forceKillTimer = setTimeout(() => {
                try {
                  if (!child.killed) {
                    child.kill('SIGKILL');
                  }
                } catch {}
              }, 1000);
              if (forceKillTimer.unref) forceKillTimer.unref();
            } catch {}

            const timeoutError: any = new Error(`yt-dlp execution timed out after ${timeoutMs}ms (elapsed: ${elapsed}ms)`);
            timeoutError.code = 'ETIMEDOUT';
            timeoutError.stderr = stderr;
            timeoutError.stdout = stdout;
            reject(timeoutError);
          }
        }, timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        if (stdout.length < MAX_BUFFER) {
          stdout += chunk.toString();
        }
      });

      child.stderr.on('data', (chunk) => {
        if (stderr.length < MAX_BUFFER) {
          stderr += chunk.toString();
        }
      });

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          child.stdout?.removeAllListeners();
          child.stderr?.removeAllListeners();
          child.removeAllListeners();
        } catch {}
      };

      child.on('error', (err: any) => {
        if (!settled) {
          settled = true;
          cleanup();
          console.error(
            `[AudioResolver] ❌ Error spawning yt-dlp binary "${ytDlpBin}": ${err.message}\n` +
            (stderr.trim() ? `Stderr:\n${stderr.trim()}` : '')
          );
          err.stderr = stderr;
          err.stdout = stdout;
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ stdout, stderr, code });
        }
      });
    });

  return streamQueue.enqueue(resourceKey, execute, {
    priority: QueuePriority.STREAM,
    timeoutMs: timeoutMs > 0 ? timeoutMs + 15000 : 120000,
  });
}

/**
 * Resolves an iTunes track ID to an artist/title query for YouTube search resolution.
 */
async function resolveItunesToQuery(itunesId: string): Promise<string | null> {
  const numericId = itunesId.replace('itunes:', '').trim();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(numericId)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      return `${track.artistName} - ${track.trackName}`;
    }
  } catch (err) {
    console.warn('[AudioResolver] Error looking up iTunes track:', err);
  }
  return null;
}

/**
 * Resolves direct audio stream for a given YouTube Video ID or iTunes fallback ID.
 * Multi-Tier Strategy:
 *   1. Check in-memory LRU Cache (0ms return on cache hit).
 *   2. For iTunes ID, resolve track metadata to YouTube search query.
 *   3. Primary yt-dlp execution using local cookies.txt & modern desktop User-Agent spoofing.
 *   4. Cookie Health Detection: Inspects stderr for cookie invalidation signatures.
 *   5. Fallback execution without cookies using visionos/android client if primary fails.
 */
export async function resolveAudioStream(
  videoIdOrUrl: string,
  quality: string = 'auto',
  forceFresh: boolean = false
): Promise<ResolvedAudioStream> {
  const rawId = sanitizeVideoId(videoIdOrUrl);
  if (!rawId) {
    throw new Error('Invalid track ID or URL format');
  }

  // 1. In-Memory Cache Lookup with Quality Differentiation
  const cacheKey = quality && quality !== 'auto' ? `${rawId}:${quality}` : rawId;
  if (forceFresh) {
    streamCache.delete(cacheKey);
    streamCache.delete(rawId);
  }
  return await streamCache.getOrFetch(cacheKey, async () => {
    let targetArg: string;
    let actualVideoId = rawId;

    if (rawId.startsWith('itunes:')) {
      const query = await resolveItunesToQuery(rawId);
      if (!query) {
        throw new Error(`Could not resolve iTunes catalog entry ${rawId}`);
      }
      targetArg = `ytsearch1:${query.replace(/['"]/g, '')}`;
    } else {
      targetArg = `https://www.youtube.com/watch?v=${rawId}`;
    }

    const cookiesPath = getCookiesPath();
    const baseAudioFormat =
      quality === 'low'
        ? 'bestaudio[abr<=96]/worstaudio[ext=m4a]/bestaudio[ext=m4a]/best'
        : quality === 'high'
        ? 'bestaudio[abr>=160]/bestaudio[ext=m4a]/bestaudio/best'
        : 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best';
    const stealthUserAgent = getRandomStealthUserAgent();

    // -------------------------------------------------------------
    // Attempt 1: Multi-Cookie Rotation & Failover with yt-dlp
    // Iterates through healthy cookies (cookies.txt, cookies1.txt, cookies2.txt, etc.)
    // If one cookie fails or hits bot detection, immediately tries the next cookie!
    // -------------------------------------------------------------
    const candidateCookiePaths = cookieRotator.getHealthyCookiePaths();

    if (candidateCookiePaths.length > 0) {
      const maxCookieAttempts = Math.min(candidateCookiePaths.length, 4);

      for (let attemptIdx = 0; attemptIdx < maxCookieAttempts; attemptIdx++) {
        const currentCookiePath = candidateCookiePaths[attemptIdx];
        const cookieFileName = path.basename(currentCookiePath);
        let attemptFailedDueToCookies = false;

        const primaryHeaderArgs = getYtDlpHeaderArgs();
        const primaryArgs = [
          '--no-warnings',
          '--no-playlist',
          '--no-check-certificates',
          '--socket-timeout',
          '30',
          ...primaryHeaderArgs,
          '--remote-components',
          'ejs:github',
          '-f',
          baseAudioFormat,
          '-j',
          '--cookies',
          currentCookiePath,
          targetArg,
        ];

        try {
          console.info(
            `[AudioResolver] 🎧 Resolving audio for ${actualVideoId} using cookie "${cookieFileName}" (Attempt ${attemptIdx + 1}/${maxCookieAttempts})...`
          );

          const res = await retryWithBackoff(
            () => runYtDlpProcess(primaryArgs, defaultResolverTimeoutMs, `stream:${actualVideoId}`),
            {
              maxRetries: 1,
              initialDelayMs: 400,
              shouldRetry: (err) => isRetryableError(err) && !attemptFailedDueToCookies,
            }
          );

          if (res.code === 0 && res.stdout.trim()) {
            const metadata = JSON.parse(res.stdout);
            if (metadata.url) {
              cookieHealthState.isValid = true;
              cookieHealthState.lastChecked = Date.now();
              cookieRotator.reportCookieSuccess(currentCookiePath);

              actualVideoId = metadata.id || actualVideoId;
              const result: ResolvedAudioStream = {
                videoId: actualVideoId,
                url: metadata.url,
                title: metadata.title || 'Unknown Track',
                duration: metadata.duration,
                ext: metadata.ext || 'm4a',
                acodec: metadata.acodec,
                abr: metadata.abr,
                filesize: metadata.filesize || metadata.filesize_approx,
                httpHeaders: metadata.http_headers || {
                  'User-Agent': stealthUserAgent,
                  Accept: '*/*',
                },
                cached: false,
              };

              if (rawId !== actualVideoId) {
                streamCache.set(actualVideoId, result);
              }

              return result;
            }
          }

          // Check if stderr contains cookie invalidation/expiration signatures
          for (const pattern of COOKIE_INVALID_PATTERNS) {
            if (pattern.test(res.stderr)) {
              attemptFailedDueToCookies = true;
              cookieRotator.reportCookieFailure(currentCookiePath, res.stderr);
              break;
            }
          }

          if (attemptFailedDueToCookies) {
            console.warn(
              `[AudioResolver] ⚠️ Cookie "${cookieFileName}" ditolak/invalid. Beralih ke cookie berikutnya dalam daftar...`
            );
            continue;
          } else {
            console.warn(
              `[AudioResolver] ⚠️ Primary yt-dlp attempt failed with cookie "${cookieFileName}" (code ${res.code}). Mencoba cookie berikutnya...`
            );
            continue;
          }
        } catch (err: any) {
          console.warn(
            `[AudioResolver] ⚠️ Error with cookie "${cookieFileName}" for "${actualVideoId}": ${err?.message || err}. Mencoba cookie berikutnya...`
          );
          cookieRotator.reportCookieFailure(currentCookiePath, err?.message || 'Exception');
          continue;
        }
      }
    }

    // -------------------------------------------------------------
    // Attempt 2: Fallback without cookies (uses mobile/visionos clients)
    // -------------------------------------------------------------
    console.info(`[AudioResolver] 🔄 Triggering fallback resolver without cookies for ${rawId} (Timeout: ${defaultResolverTimeoutMs > 0 ? defaultResolverTimeoutMs + 'ms' : 'unlimited'})...`);
    const fallbackArgs = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--socket-timeout',
      '30',
      ...getYtDlpHeaderArgs(),
      '--extractor-args',
      'youtube:player_client=visionos,android,mweb',
      '-f',
      baseAudioFormat,
      '-j',
      targetArg,
    ];

    let fallbackRes: { stdout: string; stderr: string; code: number | null } | null = null;
    try {
      fallbackRes = await retryWithBackoff(
        () => runYtDlpProcess(fallbackArgs, defaultResolverTimeoutMs, `stream:fallback:${actualVideoId}`),
        {
          maxRetries: 2,
          initialDelayMs: 800,
          shouldRetry: (err) => isRetryableError(err),
        }
      );
    } catch (fallbackErr: any) {
      console.error(
        `[AudioResolver] ❌ Fallback yt-dlp attempt threw for "${actualVideoId}": ${fallbackErr?.message || fallbackErr}\n` +
        (fallbackErr?.stderr ? `Captured Stderr:\n${fallbackErr.stderr}\n` : '')
      );
    }

    if (fallbackRes && fallbackRes.code === 0 && fallbackRes.stdout.trim()) {
      const metadata = JSON.parse(fallbackRes.stdout);
      if (metadata.url) {
        actualVideoId = metadata.id || actualVideoId;
        const result: ResolvedAudioStream = {
          videoId: actualVideoId,
          url: metadata.url,
          title: metadata.title || 'Unknown Track',
          duration: metadata.duration,
          ext: metadata.ext || 'm4a',
          acodec: metadata.acodec,
          abr: metadata.abr,
          filesize: metadata.filesize || metadata.filesize_approx,
          httpHeaders: metadata.http_headers || {
            'User-Agent': stealthUserAgent,
            Accept: '*/*',
          },
          cached: false,
        };

        if (rawId !== actualVideoId) {
          streamCache.set(actualVideoId, result);
        }

        return result;
      }
    }

    if (fallbackRes && fallbackRes.code !== 0) {
      console.error(
        `[AudioResolver] ❌ Fallback yt-dlp attempt failed (code ${fallbackRes.code}) for "${actualVideoId}":\n` +
        `Stderr Output:\n${fallbackRes.stderr.trim() || '(no stderr produced)'}`
      );
    }

    // -------------------------------------------------------------
    // Attempt 3: Emergency Multi-Tier Fallback (Invidious / iTunes Preview / iOS Client)
    // -------------------------------------------------------------
    console.info(`[AudioResolver] Attempting Emergency Tier 3 fallback for ${rawId}...`);
    try {
      // 3A. iTunes Direct Audio Stream Preview Fallback
      if (rawId.startsWith('itunes:')) {
        const numericId = rawId.replace('itunes:', '').trim();
        const itunesRes = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(numericId)}`, {
          headers: { Accept: 'application/json' },
        });
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json();
          const track = itunesData.results?.[0];
          if (track?.previewUrl) {
            const result: ResolvedAudioStream = {
              videoId: rawId,
              url: track.previewUrl,
              title: `${track.artistName} - ${track.trackName}`,
              duration: 30,
              ext: 'm4a',
              acodec: 'aac',
              abr: 256,
              httpHeaders: {
                'User-Agent': getRandomStealthUserAgent(),
                Accept: '*/*',
              },
              cached: false,
            };
            streamCache.set(rawId, result);
            return result;
          }
        }
      }

      // 3B. Invidious Public Video API Audio Stream Mirror (3.5s timeout)
      const invidiousMirrors = [
        'https://invidious.nerdvpn.de',
        'https://inv.nadeko.net',
        'https://invidious.private.coffee',
      ];

      for (const mirror of invidiousMirrors) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const mirrorRes = await fetch(`${mirror}/api/v1/videos/${encodeURIComponent(actualVideoId)}`, {
            signal: controller.signal,
            headers: { 'User-Agent': getRandomStealthUserAgent() },
          });
          clearTimeout(timeout);

          if (mirrorRes.ok) {
            const mirrorData = await mirrorRes.json();
            const audioFormats = mirrorData.adaptiveFormats?.filter((f: any) =>
              typeof f.type === 'string' && f.type.startsWith('audio/')
            ) || [];

            if (audioFormats.length > 0) {
              const bestAudio = audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
              if (bestAudio?.url) {
                const result: ResolvedAudioStream = {
                  videoId: actualVideoId,
                  url: bestAudio.url,
                  title: mirrorData.title || 'Unknown Track',
                  duration: mirrorData.lengthSeconds,
                  ext: bestAudio.container || 'm4a',
                  acodec: bestAudio.encoding,
                  abr: Math.round((bestAudio.bitrate || 128000) / 1000),
                  httpHeaders: {
                    'User-Agent': getRandomStealthUserAgent(),
                    Accept: '*/*',
                  },
                  cached: false,
                };
                streamCache.set(actualVideoId, result);
                return result;
              }
            }
          }
        } catch {}
      }
    } catch (emergencyErr) {
      console.warn('[AudioResolver] Emergency fallback attempt encountered error:', emergencyErr);
    }

    throw new Error(
      `Gagal mengekstrak audio stream untuk ${rawId}. Semua jalur failover (cookies, multi-client, dan emergency mirror) tidak dapat mengakses konten ini.`
    );
  });
}

/**
 * Progressive On-the-Fly Audio Streamer via yt-dlp stdout pipe.
 *
 * Emits audio chunks in real-time as they arrive from YouTube, allowing
 * instant playback in the browser without waiting for 100% download.
 */
export function createYtDlpProgressiveStream(
  videoId: string,
  requestSignal?: AbortSignal
): { stream: ReadableStream<Uint8Array>; contentType: string; cleanup: () => void } {
  const cleanId = sanitizeVideoId(videoId) || videoId;
  const targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;
  const ytDlpBin = findYtDlpBinary();
  const cookiesPath = getCookiesPath();
  const stealthHeaders = getYtDlpHeaderArgs();

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--socket-timeout',
    '20',
    ...stealthHeaders,
    '--remote-components',
    'ejs:github',
    '-f',
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '-o',
    '-',
  ];

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }
  args.push(targetUrl);

  const env = getExtendedEnv();
  const child = spawn(ytDlpBin, args, {
    env: { ...env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const cleanup = () => {
    try {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL');
          } catch {}
        }, 1500).unref();
      }
    } catch {}
    try {
      child.stdout?.destroy();
      child.stderr?.destroy();
    } catch {}
  };

  if (requestSignal) {
    if (requestSignal.aborted) {
      cleanup();
    } else {
      requestSignal.addEventListener('abort', cleanup, { once: true });
    }
  }

  // Prevent zombie processes and memory leaks on stdout stream close
  child.stdout.on('end', cleanup);
  child.stdout.on('close', cleanup);
  child.on('close', () => {
    try {
      child.stdout?.destroy();
      child.stderr?.destroy();
    } catch {}
  });

  // Detect cookie failure during progressive pipe streaming
  child.stderr?.on('data', (chunk) => {
    const errText = chunk.toString();
    if (isCookieError(errText) && cookiesPath) {
      cookieRotator.reportCookieFailure(cookiesPath, errText);
      console.warn(`[ProgressiveStream] ⚠️ Cookie "${path.basename(cookiesPath)}" ditolak selama pipe streaming. Masuk masa cooldown.`);
    }
  });

  // Prevent uncaught errors on child process
  child.on('error', (err) => {
    console.warn(`[AudioResolver] Progressive yt-dlp child error for ${cleanId}:`, err.message);
    cleanup();
  });

  const webStream = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;

  return {
    stream: webStream,
    contentType: 'audio/mp4',
    cleanup,
  };
}
