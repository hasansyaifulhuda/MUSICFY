'use client';

import { useState, useEffect } from 'react';
import { applyPlatformScaling } from '@/lib/platform';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useNetworkStore } from '@/lib/networkMonitor';
import { useBatteryStore } from '@/lib/batteryStore';

/**
 * Client-Side Platform & Scaling Bootstrapper
 * Uses an isMounted flag (true strictly after initial client hydration in useEffect)
 * to ensure that platform detection (Windows, Debian/Linux, Android APK)
 * and root attributes (data-platform, data-is-apk, etc.)
 * are applied only in the browser, eliminating Next.js SSR hydration mismatches.
 */
export function PlatformBootstrapper() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    // Clean up deprecated / legacy localStorage keys (Floating AI Assistant)
    try {
      localStorage.removeItem('musicfy_ai_assistant_enabled');
    } catch {}

    // Hydrate client preferences safely after mount (0 hydration mismatch)
    useEqualizerStore.getState().hydrateFromStorage();
    useNetworkStore.getState().initNetworkListeners();
    useBatteryStore.getState().initBatteryListener();

    // Defer attribute mutation to ensure React hydration has settled
    const rafId = requestAnimationFrame(() => {
      applyPlatformScaling();
    });

    const handleResize = () => {
      applyPlatformScaling();
    };
    window.addEventListener('resize', handleResize, { passive: true });

    let dprMatcher: MediaQueryList | null = null;
    const handleDprChange = () => {
      applyPlatformScaling();
    };
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        dprMatcher = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        dprMatcher.addEventListener?.('change', handleDprChange);
      } catch {}
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      try {
        dprMatcher?.removeEventListener?.('change', handleDprChange);
      } catch {}
    };
  }, []);

  if (!isMounted) {
    return null;
  }

  return null;
}
