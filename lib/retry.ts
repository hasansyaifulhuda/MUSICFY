/**
 * Exponential Backoff Auto-Retry Utility with Jitter
 * Ensures high resilience against transient network interruptions,
 * YouTube rate-limits (HTTP 429), socket timeouts, and connection drops.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number, delayMs: number) => void;
}

const RETRYABLE_ERROR_PATTERNS = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EPIPE/i,
  /socket hang up/i,
  /network timeout/i,
  /HTTP Error 429/i,
  /Too Many Requests/i,
  /HTTP Error 503/i,
  /Service Unavailable/i,
  /HTTP Error 502/i,
  /Bad Gateway/i,
  /temporarily unavailable/i,
  /Sign in to confirm you(?:'|’)?re not a bot/i,
  /bot verification/i,
  /cookies are invalid/i,
];

export function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = `${error.message || ''} ${error.stderr || ''} ${error.code || ''}`;
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Executes an async function with exponential backoff and random jitter.
 */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 600;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const backoffFactor = options.backoffFactor ?? 2;
  const useJitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt);
    } catch (error: any) {
      lastError = error;

      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate exponential backoff delay with jitter
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      if (useJitter) {
        // Decorrelated jitter: between 50% and 100% of delay
        delay = Math.round(delay * (0.5 + Math.random() * 0.5));
      }
      delay = Math.min(delay, maxDelayMs);

      if (options.onRetry) {
        options.onRetry(error, attempt, delay);
      } else {
        console.warn(
          `[AutoRetry] ⚠️ Operation failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms... Error: ${error.message || error}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

