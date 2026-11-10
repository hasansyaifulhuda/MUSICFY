// MusicFY Enterprise PWA Service Worker (v5)
// Strategy: Cache-First for Hashed Static Assets, Network-First for HTML Shell, Strict Bypass for Audio & API

const CACHE_VERSION = 'v5';
const STATIC_CACHE_NAME = `musicfy-static-${CACHE_VERSION}`;
const PAGES_CACHE_NAME = `musicfy-pages-${CACHE_VERSION}`;

const CORE_STATIC_ASSETS = [
  '/',
  '/download',
  '/manifest.json',
  '/icon.png',
  '/favicon.ico',
  '/workers/lyricsWorker.js',
];

// 1. Install Event: Pre-cache core shell assets & skip waiting for instant activation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Pre-caching asset skipped: ${asset}`, err);
          })
        )
      );
    })
  );
});

// 2. Activate Event: Purge old cache versions & immediately claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE_NAME && key !== PAGES_CACHE_NAME) {
              console.info(`[SW] Purging outdated cache: ${key}`);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        // Broadcast activation to all open tabs for smooth GitHub-to-VPS sync
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// Resilient Offline HTML Response when no cache or network exists
function getOfflineFallbackHtml() {
  return new Response(
    `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>MusicFY - Offline</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #121212; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px 24px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h2 { font-size: 20px; margin: 0 0 10px; font-weight: 700; color: #fff; }
    p { color: #b3b3b3; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .links { display: flex; flex-direction: column; gap: 12px; }
    a { display: inline-flex; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-decoration: none; transition: transform 0.15s ease; }
    a:active { transform: scale(0.97); }
    .primary { background: #1DB954; color: #000; }
    .primary:hover { background: #1ed760; }
    .secondary { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.1); }
    .secondary:hover { background: rgba(255,255,255,0.15); }
  </style>
</head>
<body>
  <div class="card">
    <h2>MusicFY Mode Offline</h2>
    <p>Koneksi internet tidak tersedia. Anda tetap dapat menikmati seluruh lagu yang telah tersimpan di memori perangkat.</p>
    <div class="links">
      <a href="/download" class="primary">Buka Menu Download</a>
      <a href="/" class="secondary">Buka Beranda Offline</a>
    </div>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

// 3. Fetch Event
self.addEventListener('fetch', (event) => {
  // Only process standard GET requests
  if (event.request.method !== 'GET') return;

  const urlString = event.request.url;
  if (!urlString || !urlString.startsWith('http')) return;

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return;
  }

  // --------------------------------------------------------------------------
  // STRICT NETWORK BYPASS (NEVER INTERCEPT OR CACHE):
  // 1. Streaming backend audio endpoints (/api/stream, /api/audio, /api/download)
  // 2. Dynamic API routes (/api/)
  // 3. HTTP Range requests (crucial for chunked audio buffer & seeking)
  // 4. External streaming & telemetry domains (googlevideo, ytimg, etc.)
  // 5. Next.js RSC dynamic navigation payloads
  // --------------------------------------------------------------------------
  const isRSC =
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-State-Tree') ||
    event.request.headers.get('Next-Router-Prefetch') ||
    event.request.headers.get('Next-Url');

  if (
    url.pathname.startsWith('/api/') ||
    event.request.headers.has('range') ||
    isRSC ||
    url.pathname.includes('/_next/webpack-hmr') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('youtube-nocookie.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('ggpht.com') ||
    url.hostname.includes('mzstatic.com') ||
    url.hostname.includes('itunes.apple.com') ||
    url.hostname.includes('lrclib.net')
  ) {
    return; // Pass through directly to network
  }

  // --------------------------------------------------------------------------
  // STRATEGY A: CACHE-FIRST FOR IMMUTABLE STATIC ASSETS (_next/static/*, fonts, workers)
  // Guarantees instant sub-millisecond loading for all JavaScript chunks and CSS
  // --------------------------------------------------------------------------
  const isStaticHashedAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/workers/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname === '/icon.png' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json';

  if (isStaticHashedAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch {
          return cached || new Response('', { status: 404, statusText: 'Static Asset Unavailable' });
        }
      })()
    );
    return;
  }

  // --------------------------------------------------------------------------
  // STRATEGY B: NETWORK-FIRST (WITH CACHE FALLBACK) FOR HTML SHELL NAVIGATION
  // Guarantees immediate synchronization on new GitHub-to-VPS deployments
  // while retaining instant offline access when network is unavailable
  // --------------------------------------------------------------------------
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const pagesCache = await caches.open(PAGES_CACHE_NAME);

        try {
          // Attempt network fetch with a 3-second timeout for slow connections
          const controller = new AbortController();
          const timer = setTimeout(() => {
            try {
              controller.abort();
            } catch {}
          }, 3000);

          const networkResponse = await fetch(event.request, {
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (networkResponse && networkResponse.status === 200) {
            pagesCache.put(event.request, networkResponse.clone()).catch(() => {});
            return networkResponse;
          }
        } catch {
          // Network failed or timed out, fallback to cached HTML
        }

        // Check page cache
        const cachedPage = await pagesCache.match(event.request);
        if (cachedPage) {
          return cachedPage;
        }

        // Check root page cache
        const rootCached = await pagesCache.match('/');
        if (rootCached) {
          return rootCached;
        }

        return getOfflineFallbackHtml();
      })()
    );
    return;
  }

  // --------------------------------------------------------------------------
  // STRATEGY C: STALE-WHILE-REVALIDATE FOR OTHER GENERIC ASSETS
  // --------------------------------------------------------------------------
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME);
      const cached = await cache.match(event.request);

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
      }

      const freshResponse = await fetchPromise;
      if (freshResponse) {
        return freshResponse;
      }

      return new Response('', { status: 404 });
    })()
  );
});
