import fs from 'fs';
import path from 'path';

export interface AdminActivityLog {
  id: string;
  timestamp: number;
  type: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'CONFIG_CHANGE' | 'CACHE_CLEAR' | 'SECURITY_ALERT' | 'SYSTEM_ACTION';
  message: string;
  ip: string;
  severity: 'info' | 'warning' | 'critical';
  details?: Record<string, any>;
}

export interface RateLimitStatus {
  isBlocked: boolean;
  remainingAttempts: number;
  lockoutExpiresInSeconds: number;
}

const LOGS_FILE = path.join(process.cwd(), 'storage', 'admin', 'activity_logs.json');
const MAX_LOGS = 500;

// Rate limiting state: IP -> { failedAttempts: number, lastAttempt: number, lockoutUntil: number }
const loginAttemptsMap = new Map<string, { failedAttempts: number; lastAttempt: number; lockoutUntil: number }>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const ATTEMPT_RESET_WINDOW_MS = 15 * 60 * 1000;

function ensureStorageDir(): void {
  const dir = path.dirname(LOGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Extracts true client IP address safely, checking trusted reverse proxy headers.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  // 1. Cloudflare original client IP
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // 2. Standard X-Real-IP
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // 3. X-Forwarded-For (take the first IP which is the original client)
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }

  return '127.0.0.1';
}

/**
 * Checks rate limiting status for a given IP.
 */
export function checkLoginRateLimit(ip: string): RateLimitStatus {
  const now = Date.now();
  const entry = loginAttemptsMap.get(ip);

  if (!entry) {
    return {
      isBlocked: false,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      lockoutExpiresInSeconds: 0,
    };
  }

  // Check if currently locked out
  if (entry.lockoutUntil > now) {
    const remainingSeconds = Math.ceil((entry.lockoutUntil - now) / 1000);
    return {
      isBlocked: true,
      remainingAttempts: 0,
      lockoutExpiresInSeconds: remainingSeconds,
    };
  }

  // If lockout expired or reset window passed, reset
  if (now - entry.lastAttempt > ATTEMPT_RESET_WINDOW_MS) {
    loginAttemptsMap.delete(ip);
    return {
      isBlocked: false,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      lockoutExpiresInSeconds: 0,
    };
  }

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - entry.failedAttempts);
  return {
    isBlocked: remaining <= 0,
    remainingAttempts: remaining,
    lockoutExpiresInSeconds: 0,
  };
}

/**
 * Records a failed login attempt and applies lockout if threshold exceeded.
 */
export function recordFailedLogin(ip: string): RateLimitStatus {
  const now = Date.now();
  let entry = loginAttemptsMap.get(ip);

  if (!entry || now - entry.lastAttempt > ATTEMPT_RESET_WINDOW_MS) {
    entry = { failedAttempts: 1, lastAttempt: now, lockoutUntil: 0 };
  } else {
    entry.failedAttempts += 1;
    entry.lastAttempt = now;
  }

  if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockoutUntil = now + LOCKOUT_DURATION_MS;
    logAdminActivity({
      type: 'SECURITY_ALERT',
      message: `IP ${ip} dikunci sementara karena ${MAX_FAILED_ATTEMPTS} kali percobaan login gagal berturut-turut.`,
      ip,
      severity: 'critical',
      details: { failedAttempts: entry.failedAttempts, lockoutDurationMinutes: 15 },
    });
  }

  loginAttemptsMap.set(ip, entry);

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - entry.failedAttempts);
  const lockoutSec = entry.lockoutUntil > now ? Math.ceil((entry.lockoutUntil - now) / 1000) : 0;

  return {
    isBlocked: entry.lockoutUntil > now,
    remainingAttempts: remaining,
    lockoutExpiresInSeconds: lockoutSec,
  };
}

/**
 * Resets the rate limiting status after successful authentication.
 */
export function recordSuccessfulLogin(ip: string): void {
  loginAttemptsMap.delete(ip);
}

/**
 * In-memory activity logs array with disk backup.
 */
let cachedLogs: AdminActivityLog[] | null = null;

function loadLogsFromDisk(): AdminActivityLog[] {
  if (cachedLogs !== null) return cachedLogs;
  ensureStorageDir();
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const raw = fs.readFileSync(LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedLogs = parsed;
        return cachedLogs;
      }
    }
  } catch (err) {
    console.warn('[AdminSecurity] Error loading logs from disk:', err);
  }
  cachedLogs = [];
  return cachedLogs;
}

let saveTimeout: NodeJS.Timeout | null = null;

function saveLogsDebounced(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    ensureStorageDir();
    try {
      if (cachedLogs) {
        fs.writeFileSync(LOGS_FILE, JSON.stringify(cachedLogs.slice(0, MAX_LOGS), null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[AdminSecurity] Error saving logs to disk:', err);
    }
  }, 1000);
}

/**
 * Appends an activity log to the administrator audit trail.
 */
export function logAdminActivity(entry: Omit<AdminActivityLog, 'id' | 'timestamp'>): void {
  const logs = loadLogsFromDisk();
  const newLog: AdminActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    ...entry,
  };

  logs.unshift(newLog);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }

  saveLogsDebounced();
}

/**
 * Retrieves the recent administrative activity logs.
 */
export function getAdminActivityLogs(limit = 100): AdminActivityLog[] {
  const logs = loadLogsFromDisk();
  return logs.slice(0, limit);
}
