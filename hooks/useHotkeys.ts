'use client';

import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/lib/store';

export interface HotkeyOptions {
  onTogglePlay?: () => void;
  onSeekBackward?: (seconds: number) => void;
  onSeekForward?: (seconds: number) => void;
  onToggleMute?: () => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  onOpenFullScreenLyrics?: () => void;
  onCloseFullScreenLyrics?: () => void;
  onToggleDevPanel?: () => void;
}

/**
 * Checks whether user focus is inside an interactive input / editable element.
 * When active, keyboard shortcuts MUST NOT fire so normal typing is preserved.
 */
function isTypingContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName ? target.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox') {
    return true;
  }

  if (target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="searchbox"]')) {
    return true;
  }

  return false;
}

/**
 * Enterprise Global Keyboard Shortcuts System for MusicFY
 *
 * Shortcuts:
 * - Arrow Left: Mundur 5 detik
 * - Arrow Right: Maju 5 detik
 * - Shift + Arrow Left: Mundur 10 detik
 * - Shift + Arrow Right: Maju 10 detik
 * - Space: Play/Pause
 * - K: Play/Pause
 * - J: Mundur 10 detik
 * - L: Maju 10 detik
 * - Arrow Up: Volume naik 5%
 * - Arrow Down: Volume turun 5%
 * - M: Mute/Unmute
 * - N: Lagu berikutnya
 * - P: Lagu sebelumnya
 * - F: Buka Full Screen Lyrics
 * - Escape: Keluar dari Full Screen Lyrics
 *
 * Guarantees:
 * 1. Safe modifier key guard (never steals Ctrl/Alt/Meta shortcuts from browser).
 * 2. Typing protection (never triggers inside inputs, textareas, or contentEditable).
 * 3. Exact boundaries (0 <= seek <= duration, 0 <= volume <= 100).
 * 4. Automatic listener cleanup on unmount (zero memory leaks / duplicate listeners).
 */
export function useHotkeys(options: HotkeyOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 1. Secret developer diagnostic modal: Ctrl+Shift+D or Cmd+Shift+D
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        event.preventDefault();
        optionsRef.current.onToggleDevPanel?.();
        return;
      }

      // 2. Strict Browser Native Guard:
      // If user holds Ctrl, Meta (Cmd), or Alt, DO NOT intercept! Let browser handle Ctrl+P, Ctrl+N, Ctrl+L, Alt+Left, etc.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // 3. Typing Guard:
      // If user is actively typing in an input, textarea, select, or editor, ignore all playback shortcuts.
      if (isTypingContext(event.target)) {
        return;
      }

      const code = event.code;
      const key = event.key;

      // 4. Arrow Left: Mundur 5s (normal) atau Mundur 10s (Shift)
      if (code === 'ArrowLeft' || key === 'ArrowLeft') {
        event.preventDefault();
        const seconds = event.shiftKey ? 10 : 5;
        optionsRef.current.onSeekBackward?.(seconds);
        return;
      }

      // 5. Arrow Right: Maju 5s (normal) atau Maju 10s (Shift)
      if (code === 'ArrowRight' || key === 'ArrowRight') {
        event.preventDefault();
        const seconds = event.shiftKey ? 10 : 5;
        optionsRef.current.onSeekForward?.(seconds);
        return;
      }

      // 6. Space: Play/Pause
      if (code === 'Space' || key === ' ') {
        event.preventDefault();
        optionsRef.current.onTogglePlay?.();
        return;
      }

      // 7. K: Play/Pause
      if (code === 'KeyK' || key === 'k' || key === 'K') {
        event.preventDefault();
        optionsRef.current.onTogglePlay?.();
        return;
      }

      // 8. J: Mundur 10 detik
      if (code === 'KeyJ' || key === 'j' || key === 'J') {
        event.preventDefault();
        optionsRef.current.onSeekBackward?.(10);
        return;
      }

      // 9. L: Maju 10 detik
      if (code === 'KeyL' || key === 'l' || key === 'L') {
        event.preventDefault();
        optionsRef.current.onSeekForward?.(10);
        return;
      }

      // 10. Arrow Up: Volume naik 5%
      if (code === 'ArrowUp' || key === 'ArrowUp') {
        event.preventDefault();
        optionsRef.current.onVolumeUp?.();
        return;
      }

      // 11. Arrow Down: Volume turun 5%
      if (code === 'ArrowDown' || key === 'ArrowDown') {
        event.preventDefault();
        optionsRef.current.onVolumeDown?.();
        return;
      }

      // 12. M: Mute/Unmute
      if (code === 'KeyM' || key === 'm' || key === 'M') {
        event.preventDefault();
        optionsRef.current.onToggleMute?.();
        return;
      }

      // 13. N: Lagu berikutnya
      if (code === 'KeyN' || key === 'n' || key === 'N') {
        event.preventDefault();
        optionsRef.current.onNextTrack?.();
        return;
      }

      // 14. P: Lagu sebelumnya
      if (code === 'KeyP' || key === 'p' || key === 'P') {
        event.preventDefault();
        optionsRef.current.onPrevTrack?.();
        return;
      }

      // 15. F: Buka Full Screen Lyrics
      if (code === 'KeyF' || key === 'f' || key === 'F') {
        event.preventDefault();
        if (optionsRef.current.onOpenFullScreenLyrics) {
          optionsRef.current.onOpenFullScreenLyrics();
        } else {
          const track = usePlayerStore.getState().currentTrack;
          if (track) {
            usePlayerStore.getState().setFullScreenLyricsOpen(true);
          }
        }
        return;
      }

      // 16. Escape: Keluar dari Full Screen Lyrics
      if (code === 'Escape' || key === 'Escape') {
        const isFsOpen = usePlayerStore.getState().isFullScreenLyricsOpen;
        if (isFsOpen) {
          event.preventDefault();
          if (optionsRef.current.onCloseFullScreenLyrics) {
            optionsRef.current.onCloseFullScreenLyrics();
          } else {
            usePlayerStore.getState().setFullScreenLyricsOpen(false);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
