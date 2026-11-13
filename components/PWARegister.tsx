'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

export function PWARegister() {
  useEffect(() => {
    // 1. In Development Mode: Proactively unregister any active Service Worker
    // This prevents stale webpack dev chunks, fast-refresh reload loops, and routing collisions
    if (process.env.NODE_ENV !== 'production') {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {});
          }
        });
      }
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.startsWith('pmusic-') || key.startsWith('musicfy-')) {
              caches.delete(key).catch(() => {});
            }
          });
        });
      }
      return;
    }

    // 2. In Production Mode: Purge legacy MusicFY caches
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (!key.startsWith('musicfy-')) {
            caches.delete(key).catch(() => {});
          }
        });
      });
    }

    // 3. Register production service worker cleanly with deployment auto-synchronization
    let updateInterval: NodeJS.Timeout | null = null;
    let handleVisibilityChange: (() => void) | null = null;
    let handleControllerChange: (() => void) | null = null;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Check for immediate update on registration
          registration.update().catch(() => {});

          // Check for updates every 30 minutes to auto-sync with VPS deployments
          updateInterval = setInterval(() => {
            registration.update().catch(() => {});
          }, 30 * 60 * 1000);

          // Check for updates whenever the tab/app returns to foreground
          handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
              registration.update().catch(() => {});
            }
          };
          document.addEventListener('visibilitychange', handleVisibilityChange);

          // Detect when a newly activated worker takes control (seamless VPS deployment sync)
          handleControllerChange = () => {
            console.info('[PWA] Service Worker controller updated with new build deployment.');
            window.dispatchEvent(new CustomEvent('pwa-updated'));
          };
          navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
        })
        .catch(() => {
          // Non-blocking fallback for restricted or unsupported Service Worker contexts
        });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPrompt = e;
      window.dispatchEvent(new Event('pwa-prompt-available'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (updateInterval) clearInterval(updateInterval);
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (handleControllerChange && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  return null;
}

export default PWARegister;

