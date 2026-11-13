import fs from 'fs';
import path from 'path';

// Patterns indicating YouTube has rejected or flagged a cookie file
export const COOKIE_INVALID_PATTERNS: RegExp[] = [
  /Sign in to confirm you(?:'|’)?re not a bot/i,
  /Sign in to confirm your age/i,
  /cookies are invalid/i,
  /Netscape cookie file/i,
  /Cookie file contains invalid line/i,
  /Private video\. Sign in/i,
  /Use --cookies-from-browser or --cookies/i,
  /HTTP Error 401/i,
  /HTTP Error 429/i,
  /Your account has been terminated/i,
  /login.*required/i,
  /cookies.*expired/i,
  /The playlist does not exist/i,
  /Video unavailable.*This video is only available to Music Premium members/i,
  /Unable to extract (?:uploader|video|player|initial) data/i,
  /This content isn't available/i,
  /confirm your identity/i,
  /CAPTCHA/i,
  /Sign in to access/i,
];

/**
 * Checks whether an error message or stderr output indicates an expired,
 * blocked, or bot-challenged YouTube cookie.
 */
export function isCookieError(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return COOKIE_INVALID_PATTERNS.some((pattern) => pattern.test(text));
}

export type CookieHealthStatus = 'HEALTHY' | 'COOLDOWN' | 'BLOCKED' | 'EMPTY';

export interface CookieAlertLog {
  timestamp: string;
  epochMs: number;
  filename: string;
  errorType: string;
  reason: string;
  action: string;
  status: CookieHealthStatus;
}

/**
 * Classifies the exact YouTube error type from stderr or exception text.
 */
export function classifyCookieError(errorText: string): {
  type: string;
  description: string;
  isFatalBlock: boolean;
} {
  const text = errorText || '';
  if (/Sign in to confirm you(?:'|’)?re not a bot|confirm your identity|CAPTCHA/i.test(text)) {
    return {
      type: 'BOT_CHALLENGE',
      description: "YouTube mendeteksi bot challenge ('Sign in to confirm you are not a bot')",
      isFatalBlock: true,
    };
  }
  if (/HTTP Error 429/i.test(text)) {
    return {
      type: 'RATE_LIMIT_429',
      description: 'Rate limit IP/Akun (HTTP Error 429: Too Many Requests)',
      isFatalBlock: false,
    };
  }
  if (/HTTP Error 401|cookies.*expired|Your account has been terminated|login.*required/i.test(text)) {
    return {
      type: 'TOKEN_EXPIRED',
      description: 'Sesi akun YouTube telah kedaluwarsa atau token dicabut (HTTP 401 / Expired)',
      isFatalBlock: true,
    };
  }
  if (/HTTP Error 403|Private video\. Sign in/i.test(text)) {
    return {
      type: 'ACCESS_FORBIDDEN_403',
      description: 'Akses ditolak untuk video ini dengan kredensial aktif (HTTP 403 / Forbidden)',
      isFatalBlock: false,
    };
  }
  if (/Netscape cookie file|Cookie file contains invalid line/i.test(text)) {
    return {
      type: 'MALFORMED_FORMAT',
      description: 'Sintaks berkas cookie rusak atau tidak sesuai standar Netscape',
      isFatalBlock: true,
    };
  }
  return {
    type: 'GENERIC_COOKIE_ERROR',
    description: 'Kegagalan otentikasi YouTube atau penolakan umum',
    isFatalBlock: false,
  };
}

export function getProjectRootDir(): string {
  const cwd = process.cwd();
  if (cwd.includes(path.join('.next', 'standalone'))) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

const LOG_DIR = path.join(getProjectRootDir(), 'logs');
const COOKIE_ALERT_LOG_FILE = path.join(LOG_DIR, 'cookie-health.log');

/**
 * Persistently logs cookie alert entries to VPS disk at logs/cookie-health.log.
 */
export function appendToCookieAlertLog(entry: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(COOKIE_ALERT_LOG_FILE, entry + '\n', 'utf-8');
  } catch {}
}

/**
 * Reads recent alerts from logs/cookie-health.log for administrative diagnostics.
 */
export function readRecentCookieAlertLogs(maxLines = 20): string[] {
  try {
    if (!fs.existsSync(COOKIE_ALERT_LOG_FILE)) return [];
    const content = fs.readFileSync(COOKIE_ALERT_LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export interface CookieSlot {
  filename: string;
  filePath: string;
  sizeBytes: number;
  isValid: boolean;
  status: CookieHealthStatus;
  lastChecked: number;
  lastModifiedMs: number;
  lastUsed: number;
  usageCount: number;
  failCount: number;
  consecutiveFails: number;
  cooldownUntil: number;
  lastError: string | null;
  lastErrorType: string | null;
  lastFailedAt: number | null;
  blockReason: string | null;
}

export interface CookiePoolStatus {
  totalDiscovered: number;
  activePoolSize: number;
  activeCookieFilenames: string[];
  currentActiveFilename: string | null;
  currentBatchCount: number;
  maxRequestsPerBatch: number;
  usingFallbackStandard: boolean;
  slots: CookieSlot[];
  lastScanTime: number;
  recentAlerts?: CookieAlertLog[];
}

/**
 * Intelligent & Proactive yt-dlp Cookie Manager
 * 1. Automatically discovers any 'cookie*.txt' or 'cookies*.txt' files in root.
 * 2. Proactively rotates cookie sessions every N requests (default: 5) to mimic natural user browsing.
 * 3. Graceful error recovery: automatic cooldown & immediate skip to next healthy cookie on bot challenge.
 * 4. Fallback: Always ensures safe fallback to cookies.txt or cookie-less execution.
 */
export class CookieManager {
  private slots: Map<string, CookieSlot> = new Map();
  private activeSlotKeys: string[] = [];
  private currentSlotIndex = 0;
  private currentBatchCount = 0;
  private currentBatchStartTime = Date.now();
  private maxRequestsPerBatch = 5; // Rotate proactively every 5 requests
  private maxBatchDurationMs = 15 * 60 * 1000; // or rotate every 15 minutes
  private lastScanTime = 0;
  private scanCacheTtlMs = 15000; // Auto-rescan directory every 15 seconds
  private hasLoggedBanner = false;
  private standardCookieName = 'cookies.txt';
  private selectionStrategy: 'rotate' | 'random' = 'rotate';
  private alertHistory: CookieAlertLog[] = [];

  constructor() {
    const envBatch = parseInt(process.env.COOKIE_ROTATION_BATCH_SIZE || '', 10);
    if (!isNaN(envBatch) && envBatch > 0) {
      this.maxRequestsPerBatch = envBatch;
    }

    const envStrategy = (process.env.COOKIE_SELECTION_STRATEGY || '').toLowerCase().trim();
    if (envStrategy === 'random' || envStrategy === 'shuffle') {
      this.selectionStrategy = 'random';
    }

    this.injectCookiesFromEnv();
    this.scanCookieFiles(true);
    this.logDiagnosticBanner();
  }

  /**
   * Injects cookies directly from environment variables (e.g. YT_COOKIES_BASE64 or YTDLP_COOKIES)
   * for zero-config deployments on cloud servers or Docker containers.
   */
  private injectCookiesFromEnv(): void {
    try {
      const rootDir = process.cwd();
      const rawEnv = process.env.YT_COOKIES_BASE64 || process.env.YTDLP_COOKIES;
      if (!rawEnv) return;

      const targetPath = path.join(rootDir, 'cookies_env.txt');
      let cookieContent = rawEnv;

      // Check if base64 encoded
      if (process.env.YT_COOKIES_BASE64 || /^[A-Za-z0-9+/=]+$/.test(rawEnv.trim())) {
        try {
          const decoded = Buffer.from(rawEnv.trim(), 'base64').toString('utf-8');
          if (decoded.includes('# Netscape HTTP Cookie File') || decoded.includes('.youtube.com')) {
            cookieContent = decoded;
          }
        } catch {}
      }

      if (cookieContent.length > 50) {
        fs.writeFileSync(targetPath, cookieContent, 'utf-8');
        console.info('[CookieManager] 🔑 Injected environment cookies into cookies_env.txt');
      }
    } catch (err) {
      console.warn('[CookieManager] Failed to inject cookies from environment:', err);
    }
  }

  /**
   * 1. Automatic Detection of All Cookie Files & Auto-Recovery on Admin Disk Update:
   * Scans root directory for any file matching /^cookie.*\.txt$/i (e.g. cookies.txt, cookies1.txt, cookies2.txt).
   * Automatically clears BLOCKED/COOLDOWN status if the file has been modified on disk by the administrator!
   */
  public scanCookieFiles(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastScanTime < this.scanCacheTtlMs && this.slots.size > 0) {
      return;
    }

    const scanDirs = Array.from(new Set([getProjectRootDir(), process.cwd()]));
    const discoveredFiles: string[] = [];

    try {
      for (const rootDir of scanDirs) {
        if (!fs.existsSync(rootDir)) continue;
        const entries = fs.readdirSync(rootDir);
        for (const entry of entries) {
          // Matches cookies.txt, cookies1.txt, cookies5.txt, cookie_alt.txt, cookie*.txt
          if (/^cookie.*\.txt$/i.test(entry)) {
            const fullPath = path.join(rootDir, entry);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isFile() && stat.size > 50) {
                if (!discoveredFiles.includes(entry)) {
                  discoveredFiles.push(entry);
                }
                const existing = this.slots.get(entry);
                if (existing) {
                  const isFileUpdated = stat.mtimeMs > (existing.lastModifiedMs || 0) + 1000;
                  existing.sizeBytes = stat.size;
                  existing.filePath = fullPath;
                  existing.lastChecked = now;

                  // Admin updated/uploaded fresh cookie file to VPS disk!
                  if (isFileUpdated) {
                    existing.lastModifiedMs = stat.mtimeMs;
                    if (existing.status === 'BLOCKED' || existing.status === 'COOLDOWN' || !existing.isValid) {
                      console.info(`\n[CookieManager] 🟢 Berkas cookie '${entry}' telah diperbarui di disk oleh Admin! Status dipulihkan ke HEALTHY.\n`);
                      appendToCookieAlertLog(
                        `[${new Date().toISOString()}] [RECOVERY] Berkas cookie '${entry}' telah diperbarui di disk. Status otomatis dipulihkan ke HEALTHY.`
                      );
                    }
                    existing.status = 'HEALTHY';
                    existing.isValid = true;
                    existing.failCount = 0;
                    existing.consecutiveFails = 0;
                    existing.cooldownUntil = 0;
                    existing.lastError = null;
                    existing.lastErrorType = null;
                    existing.blockReason = null;
                  }
                } else {
                  this.slots.set(entry, {
                    filename: entry,
                    filePath: fullPath,
                    sizeBytes: stat.size,
                    isValid: true,
                    status: 'HEALTHY',
                    lastChecked: now,
                    lastModifiedMs: stat.mtimeMs,
                    lastUsed: 0,
                    usageCount: 0,
                    failCount: 0,
                    consecutiveFails: 0,
                    cooldownUntil: 0,
                    lastError: null,
                    lastErrorType: null,
                    lastFailedAt: null,
                    blockReason: null,
                  });
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('[CookieManager] Error scanning root directory for cookie files:', err);
    }

    // Remove any slots that no longer exist on disk
    for (const [key] of this.slots) {
      if (!discoveredFiles.includes(key)) {
        this.slots.delete(key);
      }
    }

    // Sort slot keys naturally: cookies1.txt, cookies2.txt, ... then cookies.txt
    this.activeSlotKeys = Array.from(this.slots.keys()).sort((a, b) => {
      // Prioritize numbered multi-cookies (cookies1, cookies2...) before standard cookies.txt
      const isAStandard = a.toLowerCase() === 'cookies.txt';
      const isBStandard = b.toLowerCase() === 'cookies.txt';
      if (isAStandard && !isBStandard) return 1;
      if (!isAStandard && isBStandard) return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    this.lastScanTime = now;
  }

  /**
   * Retrieves list of all valid slots not currently under cooldown or blocked.
   */
  public getHealthySlots(): CookieSlot[] {
    this.scanCookieFiles();
    const now = Date.now();
    const healthy: CookieSlot[] = [];

    for (const key of this.activeSlotKeys) {
      const slot = this.slots.get(key);
      if (slot) {
        // If temporary cooldown expired, restore slot back to HEALTHY
        if (slot.status === 'COOLDOWN' && slot.cooldownUntil <= now) {
          slot.status = 'HEALTHY';
          slot.isValid = true;
          slot.blockReason = null;
        }

        if (slot.status === 'HEALTHY' && slot.isValid && slot.cooldownUntil <= now) {
          healthy.push(slot);
        }
      }
    }

    return healthy;
  }

  /**
   * Returns a fallback cookie path if all slots are currently under cooldown.
   * Picks the slot with the earliest cooldown expiration.
   */
  private getFallbackCookiePath(): string | null {
    const allSlots = Array.from(this.slots.values()).filter((s) => s.sizeBytes > 50);
    if (allSlots.length > 0) {
      allSlots.sort((a, b) => a.cooldownUntil - b.cooldownUntil);
      const earliest = allSlots[0];
      earliest.lastUsed = Date.now();
      earliest.usageCount++;
      return earliest.filePath;
    }
    return null;
  }

  /**
   * Random Selector:
   * Chooses a random healthy cookie from the available pool.
   * Helps distribute requests uniformly across multiple cookie accounts.
   */
  public getRandomCookiePath(): string | null {
    const healthy = this.getHealthySlots();
    if (healthy.length === 0) {
      return this.getFallbackCookiePath();
    }
    const randomIndex = Math.floor(Math.random() * healthy.length);
    const selected = healthy[randomIndex];
    if (selected) {
      selected.lastUsed = Date.now();
      selected.usageCount++;
      return selected.filePath;
    }
    return null;
  }

  /**
   * Retrieves all currently healthy and active cookie paths in priority order.
   * Essential for trying subsequent cookies if one fails or hits rate limits.
   */
  public getHealthyCookiePaths(): string[] {
    const healthy = this.getHealthySlots();
    if (healthy.length === 0) {
      const fallback = this.getFallbackCookiePath();
      return fallback ? [fallback] : [];
    }

    // If configured with random strategy, return shuffled list
    if (this.selectionStrategy === 'random') {
      const copy = [...healthy];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      return copy.map((s) => s.filePath);
    }

    // In round-robin mode, order starting from current slot index
    const ordered: string[] = [];
    const len = healthy.length;
    for (let i = 0; i < len; i++) {
      const idx = (this.currentSlotIndex + i) % len;
      ordered.push(healthy[idx].filePath);
    }
    return ordered;
  }

  /**
   * 2. Proactive & Gradual Rotation (Every N requests / Cycle) or Random Selector:
   * Selects an active cookie and automatically rotates or randomly selects,
   * distributing traffic naturally across sacrificial accounts without waiting for bans.
   */
  public getNextCookiePath(): string | null {
    if (this.selectionStrategy === 'random') {
      return this.getRandomCookiePath();
    }

    const healthy = this.getHealthySlots();

    if (healthy.length === 0) {
      return this.getFallbackCookiePath();
    }

    const now = Date.now();

    // Check if we need to proactively rotate to the next cookie in the list
    const isBatchLimitReached = this.currentBatchCount >= this.maxRequestsPerBatch;
    const isDurationLimitReached = now - this.currentBatchStartTime >= this.maxBatchDurationMs;

    if ((isBatchLimitReached || isDurationLimitReached) && healthy.length > 1) {
      const prevSlot = healthy[this.currentSlotIndex % healthy.length];
      this.currentSlotIndex = (this.currentSlotIndex + 1) % healthy.length;
      this.currentBatchCount = 0;
      this.currentBatchStartTime = now;
      const nextSlot = healthy[this.currentSlotIndex % healthy.length];

      console.info(
        `[CookieManager] 🔄 Proactive Rotation: Beralih dari "${prevSlot?.filename}" ke "${nextSlot?.filename}" (Selesai ${this.maxRequestsPerBatch} request siklus pemakaian bertahap).`
      );
    }

    // Safe index bounds
    const selectedSlot = healthy[this.currentSlotIndex % healthy.length];
    if (selectedSlot) {
      this.currentBatchCount++;
      selectedSlot.lastUsed = now;
      selectedSlot.usageCount++;
      return selectedSlot.filePath;
    }

    return null;
  }

  /**
   * 3. Fallback, Health Tracking & Notification Logger:
   * Called when yt-dlp signals a bot verification, expired cookie, or 401/429/403 error.
   * Identifies the exact cookie file, logs prominent alert to console & VPS file log,
   * isolates the damaged cookie slot, and failovers seamlessly to the next healthy cookie.
   */
  public reportCookieFailure(filePath: string, errorReason: string): void {
    const filename = path.basename(filePath);
    const slot = this.slots.get(filename);
    if (!slot) return;

    slot.failCount++;
    slot.consecutiveFails++;
    slot.lastFailedAt = Date.now();

    const classification = classifyCookieError(errorReason);
    slot.lastErrorType = classification.type;
    slot.lastError = errorReason.slice(0, 200);

    const now = Date.now();
    const isFatal = classification.isFatalBlock || slot.consecutiveFails >= 2;
    const cooldownMinutes = isFatal ? 30 : 5;
    const cooldownDurationMs = cooldownMinutes * 60 * 1000;

    slot.status = isFatal ? 'BLOCKED' : 'COOLDOWN';
    slot.isValid = false;
    slot.cooldownUntil = now + cooldownDurationMs;
    slot.blockReason = classification.description;

    const cleanReason = (errorReason || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 150);
    const cooldownTimeStr = new Date(slot.cooldownUntil).toLocaleTimeString('id-ID');

    // 1. Prominent Console Alert (Highly visible in VPS terminal and PM2 logs)
    console.warn('\n' + [
      '══════════════════════════════════════════════════════════════════════════════',
      `🚨 [ALERT] Cookie file '${filename}' telah diblokir/kadaluwarsa oleh YouTube!`,
      `⚠️  Jenis Masalah: ${classification.type} (${classification.description})`,
      `📌 Ringkasan    : ${cleanReason}`,
      `⏳ Status Sistem: [${slot.status}] Diabaikan dari rotasi selama ${cooldownMinutes} menit (s/d ${cooldownTimeStr})`,
      `📊 Statistik Gagal: Total ${slot.failCount}x (Berturut-turut: ${slot.consecutiveFails}x)`,
      '🛡️  Tindakan Auto: Berkas ini dinonaktifkan sementara dari rotasi aktif.',
      '🔄 Failover     : Sistem otomatis beralih ke cookie sehat berikutnya.',
      `💡 Saran Admin  : Segera perbarui berkas '${filename}' di root VPS!`,
      '══════════════════════════════════════════════════════════════════════════════',
    ].join('\n') + '\n');

    // 2. Persistent File Logging on VPS (logs/cookie-health.log)
    const logTimestamp = new Date().toISOString();
    const logEntry = `[${logTimestamp}] [ALERT] Cookie file '${filename}' telah diblokir/kadaluwarsa oleh YouTube. (Type: ${classification.type}) | Reason: ${cleanReason} | Action: Marked ${slot.status} (cooldown until ${new Date(slot.cooldownUntil).toISOString()}). Segera perbarui berkas tersebut!`;
    appendToCookieAlertLog(logEntry);

    // 3. Keep in-memory alert history for API and status dashboard
    this.alertHistory.unshift({
      timestamp: logTimestamp,
      epochMs: now,
      filename,
      errorType: classification.type,
      reason: cleanReason,
      action: `Marked ${slot.status} (${cooldownMinutes}m cooldown)`,
      status: slot.status,
    });
    if (this.alertHistory.length > 50) {
      this.alertHistory.pop();
    }

    // 4. Immediately advance to next slot and reset batch count
    const healthy = this.getHealthySlots();
    if (healthy.length > 0) {
      this.currentSlotIndex = (this.currentSlotIndex + 1) % healthy.length;
      this.currentBatchCount = 0;
      this.currentBatchStartTime = Date.now();
      const nextSlot = healthy[this.currentSlotIndex % healthy.length];
      console.info(
        `[CookieManager] 🛡️ Failover Recovery: Otomatis beralih ke cookie aktif berikutnya: "${nextSlot?.filename}".`
      );
    } else {
      console.warn(
        `[CookieManager] ⚠️ Seluruh berkas cookie sedang dalam cooldown/blocked! Beralih ke fallback tanpa cookie (Mobile/VisionOS client).`
      );
    }
  }

  /**
   * Confirms a cookie file was used successfully, resetting fail counters.
   */
  public reportCookieSuccess(filePath: string): void {
    const filename = path.basename(filePath);
    const slot = this.slots.get(filename);
    if (slot) {
      if (slot.status !== 'BLOCKED') {
        slot.status = 'HEALTHY';
        slot.isValid = true;
      }
      slot.consecutiveFails = 0;
      slot.cooldownUntil = 0;
      slot.lastError = null;
      slot.lastErrorType = null;
      slot.blockReason = null;
    }
  }

  /**
   * Allows manual unblock or status reset of a cookie slot by administrator.
   */
  public resetCookieStatus(filename: string): boolean {
    const slot = this.slots.get(filename);
    if (!slot) return false;
    slot.status = 'HEALTHY';
    slot.isValid = true;
    slot.failCount = 0;
    slot.consecutiveFails = 0;
    slot.cooldownUntil = 0;
    slot.lastError = null;
    slot.lastErrorType = null;
    slot.blockReason = null;
    this.scanCookieFiles(true);
    console.info(`[CookieManager] 🔄 Berkas cookie '${filename}' berhasil di-reset manual oleh Admin.`);
    appendToCookieAlertLog(`[${new Date().toISOString()}] [ADMIN_RESET] Berkas cookie '${filename}' di-reset manual oleh Admin.`);
    return true;
  }

  /**
   * Returns recent cookie alert events.
   */
  public getAlertHistory(limit = 20): CookieAlertLog[] {
    return this.alertHistory.slice(0, limit);
  }

  /**
   * Generates a beautifully formatted ASCII table representation of cookie health
   * suitable for display in VPS terminal (via curl or CLI script).
   */
  public generateAsciiStatusReport(useColors = true): string {
    this.scanCookieFiles(true);
    const status = this.getPoolStatus();
    const now = Date.now();

    const c = useColors
      ? {
          reset: '\x1b[0m',
          bold: '\x1b[1m',
          green: '\x1b[32m',
          yellow: '\x1b[33m',
          red: '\x1b[31m',
          cyan: '\x1b[36m',
          gray: '\x1b[90m',
        }
      : {
          reset: '',
          bold: '',
          green: '',
          yellow: '',
          red: '',
          cyan: '',
          gray: '',
        };

    const lines: string[] = [];
    lines.push(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════════════════════════════╗${c.reset}`);
    lines.push(`${c.bold}${c.cyan}║ 🍪  MUSICFY COOKIE HEALTH & ROTATION DASHBOARD (VPS INTERNAL)                    ║${c.reset}`);
    lines.push(`${c.cyan}╠══════════════════════════════════════════════════════════════════════════════════╣${c.reset}`);
    lines.push(`║ Waktu Server   : ${new Date().toLocaleString('id-ID')}`.padEnd(83) + '║');
    lines.push(`║ Total Berkas   : ${status.totalDiscovered} berkas terdeteksi di root VPS`.padEnd(83) + '║');
    lines.push(`║ Pool Aktif     : ${status.activePoolSize} berkas sehat (Siap digunakan)`.padEnd(83) + '║');
    lines.push(`║ Cookie Aktif   : ${status.currentActiveFilename || 'None (Mode Fallback)'}`.padEnd(83) + '║');
    lines.push(`║ Siklus Rotasi  : Proaktif tiap ${status.maxRequestsPerBatch} permintaan`.padEnd(83) + '║');
    lines.push(`${c.cyan}╚══════════════════════════════════════════════════════════════════════════════════╝${c.reset}`);
    lines.push('');

    // Table Header
    lines.push(`${c.bold}┌─────────────────┬──────────┬─────────────┬───────────┬────────┬─────────────────────────────┐${c.reset}`);
    lines.push(`${c.bold}│ BERKAS          │ UKURAN   │ STATUS      │ PEMAKAIAN │ GAGAL  │ KETERANGAN / COOLDOWN       │${c.reset}`);
    lines.push(`${c.bold}├─────────────────┼──────────┼─────────────┼───────────┼────────┼─────────────────────────────┤${c.reset}`);

    if (status.slots.length === 0) {
      lines.push(`│ ${c.yellow}Tidak ada berkas cookie (cookies*.txt) ditemukan di root VPS${c.reset}`.padEnd(92) + '│');
    } else {
      for (const slot of status.slots) {
        const sizeStr = `${(slot.sizeBytes / 1024).toFixed(1)} KB`;
        let statusBadge = slot.status;
        let statusColor = c.green;
        let note = 'Siap Digunakan';

        if (slot.status === 'BLOCKED') {
          statusColor = c.red;
          const leftMs = Math.max(0, slot.cooldownUntil - now);
          const leftMin = Math.ceil(leftMs / 60000);
          note = `${slot.lastErrorType || 'BLOCKED'} (${leftMin}m)`;
        } else if (slot.status === 'COOLDOWN') {
          statusColor = c.yellow;
          const leftMs = Math.max(0, slot.cooldownUntil - now);
          const leftMin = Math.ceil(leftMs / 60000);
          note = `Cooldown (${leftMin}m)`;
        } else if (slot.filename === status.currentActiveFilename) {
          note = 'Slot Aktif Saat Ini';
        }

        const colFile = slot.filename.padEnd(15).slice(0, 15);
        const colSize = sizeStr.padEnd(8).slice(0, 8);
        const colStatus = `${statusColor}${statusBadge.padEnd(11).slice(0, 11)}${c.reset}`;
        const colUsage = `${slot.usageCount} req`.padEnd(9).slice(0, 9);
        const colFail = String(slot.failCount).padEnd(6).slice(0, 6);
        const colNote = note.padEnd(27).slice(0, 27);

        lines.push(`│ ${colFile} │ ${colSize} │ ${colStatus} │ ${colUsage} │ ${colFail} │ ${colNote} │`);
      }
    }

    lines.push(`${c.bold}└─────────────────┴──────────┴─────────────┴───────────┴────────┴─────────────────────────────┘${c.reset}`);
    lines.push('');

    // Recent Alerts section
    const recentAlerts = this.getAlertHistory(5);
    if (recentAlerts.length > 0) {
      lines.push(`${c.bold}🚨 LOG PERINGATAN TERAKHIR:${c.reset}`);
      for (const alert of recentAlerts) {
        const timeStr = new Date(alert.epochMs).toLocaleTimeString('id-ID');
        lines.push(`  • ${c.gray}[${timeStr}]${c.reset} ${c.red}[ALERT]${c.reset} File '${c.bold}${alert.filename}${c.reset}': ${alert.errorType} - ${alert.reason.slice(0, 60)}...`);
      }
      lines.push('');
    }

    lines.push(`${c.gray}💡 Tips: Jalankan 'npm run cookies:status' di terminal atau ganti berkas yang berstatus [BLOCKED] di VPS.${c.reset}`);
    return lines.join('\n');
  }

  /**
   * Records usage for search or auxiliary API operations.
   */
  public trackSearchUsage(): string | null {
    return this.getNextCookiePath();
  }

  /**
   * Retrieves full pool diagnostics for monitoring and debugging.
   */
  public getPoolStatus(): CookiePoolStatus {
    this.scanCookieFiles();
    const healthy = this.getHealthySlots();
    const currentSlot = healthy.length > 0 ? healthy[this.currentSlotIndex % healthy.length] : null;

    return {
      totalDiscovered: this.slots.size,
      activePoolSize: healthy.length,
      activeCookieFilenames: healthy.map((s) => s.filename),
      currentActiveFilename: currentSlot?.filename || null,
      currentBatchCount: this.currentBatchCount,
      maxRequestsPerBatch: this.maxRequestsPerBatch,
      usingFallbackStandard:
        healthy.length === 1 && healthy[0].filename.toLowerCase() === 'cookies.txt',
      slots: Array.from(this.slots.values()),
      lastScanTime: this.lastScanTime,
      recentAlerts: this.getAlertHistory(10),
    };
  }

  /**
   * Terminal Banner logger displayed on boot.
   */
  public logDiagnosticBanner(): void {
    if (this.hasLoggedBanner) return;
    this.hasLoggedBanner = true;

    const status = this.getPoolStatus();

    if (status.activePoolSize > 1) {
      const names = status.activeCookieFilenames.join(', ');
      console.info('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ 🔄  [COOKIE MANAGER] Sistem Rotasi Proaktif & Multi-Cookie Aktif (MusicFY)   ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        `║ Terdeteksi   : ${String(status.totalDiscovered).padEnd(2)} berkas cookie dinamis di root VPS (${names})`.slice(0, 78).padEnd(79) + '║',
        `║ Siklus Rotasi: Berganti otomatis setiap ${status.maxRequestsPerBatch} pemutaran lagu (Proactive Cycle)`.padEnd(79) + '║',
        `║ Active Cookie: ${status.currentActiveFilename || 'N/A'}`.padEnd(79) + '║',
        '║ Proteksi     : Auto-Failover & Cooldown jika mendeteksi bot challenge/429     ║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    } else if (status.usingFallbackStandard) {
      console.info('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ 🛡️  [COOKIE MANAGER] Mode Fallback Tunggal (cookies.txt Aktif)               ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        '║ File Aktif   : cookies.txt standar di root VPS                               ║',
        '║ Tips Proaktif: Tambahkan cookies1.txt s/d cookies5.txt untuk rotasi multi-akun║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    } else {
      console.warn('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ ⚠️  [COOKIE MANAGER] Tidak Ada Berkas Cookie Ditemukan                       ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        '║ Status       : Fallback otomatis ke mode multi-client tanpa cookies          ║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    }
  }
}

// Global singleton instance
export const cookieManager = new CookieManager();
// Backwards-compatible alias for existing imports
export const cookieRotator = cookieManager;

/**
 * Universal error-handling wrapper for any yt-dlp operation.
 * Automatically catches cookie expiration or bot-challenge errors,
 * marks the failing cookie with a cooldown, rotates to the next healthy cookie
 * (e.g. cookies1.txt, cookies2.txt, ...), and transparently retries the operation
 * without surfacing any errors to the frontend.
 */
export async function executeWithCookieFallback<T>(
  action: (cookiePath: string | null) => Promise<T>,
  options?: {
    maxAttempts?: number;
    operationName?: string;
  }
): Promise<T> {
  const healthyCookiePaths = cookieManager.getHealthyCookiePaths();
  // Include null (no cookies / visionOS mobile client) as the final fallback candidate
  const candidates: (string | null)[] =
    healthyCookiePaths.length > 0 ? [...healthyCookiePaths, null] : [null];

  const maxAttempts = Math.min(candidates.length, options?.maxAttempts ?? 4);
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentCookie = candidates[attempt];
    const cookieLabel = currentCookie ? path.basename(currentCookie) : 'tanpa-cookie';

    try {
      const result = await action(currentCookie);
      if (currentCookie) {
        cookieManager.reportCookieSuccess(currentCookie);
      }
      return result;
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || '') + ' ' + String(err?.stderr || '');

      const isCookieFailure = isCookieError(errorMsg);

      if (currentCookie && isCookieFailure) {
        cookieManager.reportCookieFailure(currentCookie, errorMsg.slice(0, 150));
        console.warn(
          `[CookieRotatorFallback] ⚠️ Cookie "${cookieLabel}" terindikasi expired/bot challenge pada ${
            options?.operationName || 'yt-dlp'
          }. Otomatis beralih ke cookie berikutnya...`
        );
      } else {
        console.warn(
          `[CookieRotatorFallback] ⚠️ Percobaan ${attempt + 1}/${maxAttempts} dengan "${cookieLabel}" gagal: ${
            err?.message || err
          }. Melanjutkan ke kandidat berikutnya...`
        );
      }

      // Continue to next cookie candidate seamlessly without surfacing error to frontend
      continue;
    }
  }

  throw (
    lastError ||
    new Error(
      `Operasi ${
        options?.operationName || 'YouTube'
      } gagal setelah mencoba seluruh berkas cookie yang tersedia.`
    )
  );
}
