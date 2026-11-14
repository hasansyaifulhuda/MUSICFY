'use client';

import React, { useRef, useCallback, useEffect } from 'react';

export interface UseTapGestureOptions {
  onTap?: (e: React.MouseEvent | React.PointerEvent) => void;
  onLongPress?: (coords: { x: number; y: number }) => void;
  threshold?: number; // Movement threshold in px (default 8px)
  maxDuration?: number; // Max duration for a tap in ms (default 500ms)
  disabled?: boolean;
}

// Module-level global scroll tracker for absolute protection during momentum or flick scroll
let globalLastScrollTime = 0;

if (typeof window !== 'undefined' && !(window as any).__musicfy_scroll_listener_set) {
  (window as any).__musicfy_scroll_listener_set = true;
  window.addEventListener(
    'scroll',
    () => {
      globalLastScrollTime = Date.now();
    },
    { passive: true, capture: true }
  );
  window.addEventListener(
    'touchmove',
    () => {
      globalLastScrollTime = Date.now();
    },
    { passive: true, capture: true }
  );
}

/**
 * useTapGesture: Distinguishes between normal tap and drag/scroll gestures.
 * 
 * Guarantees:
 * 1. Never triggers playback/action on pointerdown or touchstart.
 * 2. Distinguishes tap and drag using movement threshold (horizontal & vertical).
 * 3. Uses setPointerCapture to reliably track movement even if pointer moves outside element.
 * 4. Integrates global scroll tracking to prevent accidental clicks during and right after scroll.
 * 5. Handles pointercancel and touchcancel cleanly.
 * 6. Preserves natural browser scrolling.
 * 7. Suppresses accidental synthetic clicks after drag.
 * 8. Supports optional long-press for context menus with haptic feedback.
 */
export function useTapGesture({
  onTap,
  onLongPress,
  threshold = 8,
  maxDuration = 500,
  disabled = false,
}: UseTapGestureOptions) {
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isCanceledRef = useRef(false);
  const didLongPressRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, time: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActionTimeRef = useRef(0);
  const lastDragTimeRef = useRef(0);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.button !== 0) return; // Only primary button / primary touch

      isDownRef.current = true;
      isDraggingRef.current = false;
      isCanceledRef.current = false;
      didLongPressRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

      // Retain pointer events within this element even if pointer moves across boundaries
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      clearLongPress();
      if (onLongPress) {
        const coords = { x: e.clientX, y: e.clientY };
        longPressTimerRef.current = setTimeout(() => {
          if (!isDraggingRef.current && !isCanceledRef.current && isDownRef.current) {
            didLongPressRef.current = true;
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate?.(35);
              } catch {}
            }
            onLongPress(coords);
          }
        }, 480);
      }
    },
    [disabled, onLongPress, clearLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDownRef.current || isDraggingRef.current) return;

      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);

      // Distinguish tap from horizontal/vertical drag using movement threshold
      if (dx > threshold || dy > threshold) {
        isDraggingRef.current = true;
        lastDragTimeRef.current = Date.now();
        globalLastScrollTime = Date.now();
        clearLongPress();
      }
    },
    [threshold, clearLongPress]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDownRef.current) return;
      isDownRef.current = false;
      clearLongPress();

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}

      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      const duration = Date.now() - startPosRef.current.time;

      // If dragged beyond threshold, canceled, or scrolled recently: do not trigger tap!
      if (
        isCanceledRef.current ||
        isDraggingRef.current ||
        dx > threshold ||
        dy > threshold ||
        Date.now() - globalLastScrollTime < 250
      ) {
        isDraggingRef.current = true;
        lastDragTimeRef.current = Date.now();
        return;
      }

      // If long press triggered, do not trigger regular tap!
      if (didLongPressRef.current) {
        didLongPressRef.current = false;
        return;
      }

      // Valid tap
      if (duration <= maxDuration && onTap) {
        lastActionTimeRef.current = Date.now();
        onTap(e);
      }
    },
    [threshold, maxDuration, onTap, clearLongPress]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      isDownRef.current = false;
      isCanceledRef.current = true;
      isDraggingRef.current = true;
      lastDragTimeRef.current = Date.now();
      globalLastScrollTime = Date.now();
      clearLongPress();

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
    },
    [clearLongPress]
  );

  const onTouchCancel = useCallback(
    (_e: React.TouchEvent) => {
      isDownRef.current = false;
      isCanceledRef.current = true;
      isDraggingRef.current = true;
      lastDragTimeRef.current = Date.now();
      globalLastScrollTime = Date.now();
      clearLongPress();
    },
    [clearLongPress]
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      // Suppress accidental synthetic clicks following drag, cancel, or scroll
      if (
        isDraggingRef.current ||
        isCanceledRef.current ||
        Date.now() - lastDragTimeRef.current < 350 ||
        Date.now() - globalLastScrollTime < 250
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // If pointerup already triggered onTap within 350ms, prevent double-trigger
      if (Date.now() - lastActionTimeRef.current < 350) {
        return;
      }

      // Accessible click (keyboard Enter/Space)
      if (onTap && !didLongPressRef.current) {
        lastActionTimeRef.current = Date.now();
        onTap(e);
      }
    },
    [disabled, onTap]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onTouchCancel,
  };
}
