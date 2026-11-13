/**
 * Centralized Application & Server Configuration for MusicFY
 *
 * Guarantees:
 * 1. Single source of truth for PORT, HOSTNAME, and Public APP_URL.
 * 2. Strict port validation: must be an integer between 1 and 65535, defaulting to 3000.
 * 3. Safe environment variable consumption for both server and client environments.
 * 4. Resolves dynamic base URLs without hardcoding localhost:3000.
 */

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOSTNAME = '0.0.0.0';

/**
 * Validates a port value. Returns integer port if valid, or throws/returns fallback if invalid.
 */
export function validatePort(port: string | number | undefined, fallback: number = DEFAULT_PORT): number {
  if (port === undefined || port === null || port === '') {
    return fallback;
  }
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT "${port}". PORT must be an integer between 1 and 65535.`);
  }
  return parsed;
}

/**
 * Returns the configured server PORT (safely defaulting to 3000 if invalid or unset).
 */
export function getServerPort(): number {
  try {
    return validatePort(process.env.PORT, DEFAULT_PORT);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Config] ${(err as Error).message} Defaulting to ${DEFAULT_PORT}.`);
    }
    return DEFAULT_PORT;
  }
}

/**
 * Returns the configured server HOSTNAME (defaults to 0.0.0.0).
 */
export function getServerHostname(): string {
  return process.env.HOSTNAME || DEFAULT_HOSTNAME;
}

/**
 * Resolves the primary public application URL.
 *
 * Priority order:
 * 1. Client-side browser: window.location.origin (inherits active protocol, host, and port dynamically)
 * 2. NEXT_PUBLIC_APP_URL
 * 3. NEXT_PUBLIC_BASE_URL (backward compatibility)
 * 4. APP_URL
 * 5. Fallback: http://localhost:${PORT}
 */
export function getAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL;

  const port = getServerPort();

  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const trimmed = envUrl.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(trimmed);
      // If pointing to localhost/127.0.0.1, synchronize port with active server port
      if (
        (parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '0.0.0.0') &&
        parsed.port !== String(port)
      ) {
        parsed.port = String(port);
        return parsed.toString().replace(/\/+$/, '');
      }
    } catch {}
    return trimmed;
  }

  return `http://localhost:${port}`;
}

/**
 * Builds an absolute URL targeting the application's origin.
 */
export function buildAppUrl(path: string): string {
  const base = getAppUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Resolves the configured public APK download URL.
 */
export function getApkDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL ||
    'https://drive.google.com/file/d/1TUKa1p-0py84hvcV7CUvv2Bo5dpODBOb/view?usp=sharing'
  );
}
