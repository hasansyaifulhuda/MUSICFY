import Script from 'next/script';

/**
 * Enterprise Global Umami Analytics Cloud Integration for MusicFY
 *
 * Guarantees:
 * 1. Reads NEXT_PUBLIC_UMAMI_WEBSITE_ID dynamically from environment variables (no hardcoding).
 * 2. Uses Next.js Script with strategy="afterInteractive" for asynchronous, non-blocking execution.
 * 3. Deduplicated via unique id="umami-analytics" to guarantee it is loaded once and never re-mounted on route changes.
 * 4. Automatic SPA tracking across all routes (/, /search, /library, /settings, /admin, etc.) via Umami's History API wrapper.
 * 5. Zero interference with audio streaming engine, Web Audio API, PWA, or Capacitor APK.
 */
export function UmamiAnalytics() {
  const websiteId =
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ||
    process.env.NEXT_PUBLIC_UMAMI_ID;
  const scriptUrl =
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ||
    'https://cloud.umami.is/script.js';

  if (!websiteId) {
    return null;
  }

  return (
    <Script
      id="umami-analytics"
      src={scriptUrl}
      data-website-id={websiteId}
      data-auto-track="true"
      strategy="afterInteractive"
    />
  );
}

export default UmamiAnalytics;
