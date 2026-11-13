'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 25000; // 25 seconds

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let vid = localStorage.getItem('musicfy_vid');
    if (!vid || vid.length < 8) {
      vid = `v_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('musicfy_vid', vid);
    }
    return vid;
  } catch {
    return 'v_temp_' + Math.random().toString(36).substring(2, 9);
  }
}

export function VisitorHeartbeat() {
  const pathname = usePathname();
  const lastPathRef = useRef<string>('');

  const sendPing = useCallback((isNewPage = false) => {
    if (typeof window === 'undefined') return;
    if (document.visibilityState === 'hidden') return;

    const vid = getOrCreateVisitorId();
    const payload = JSON.stringify({
      visitorId: vid,
      path: window.location.pathname || pathname || '/',
      isNewPageView: isNewPage,
    });

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/heartbeat', blob);
      } else {
        fetch('/api/analytics/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  }, [pathname]);

  // Route change trigger
  useEffect(() => {
    if (pathname && pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      sendPing(true);
    }
  }, [pathname, sendPing]);

  // Periodic heartbeat timer
  useEffect(() => {
    sendPing(false);
    const interval = setInterval(() => {
      sendPing(false);
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendPing(false);
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sendPing]);

  return null;
}
