'use client';

import { useEffect, useRef } from 'react';

interface HotkeyOptions {
  onTogglePlay?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onToggleMute?: () => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  onToggleDevPanel?: () => void;
}

/**
 * Global Keyboard Shortcuts Master Controls:
 * - Space / 'k': Play / Pause
 * - ArrowRight: Skip ke lagu berikutnya (atau Shift+ArrowRight / 'l': Maju 5s)
 * - ArrowLeft: Mundur ke lagu sebelumnya (atau Shift+ArrowLeft / 'j': Mundur 5s)
 * - 'm' / 'M': Mute / Unmute audio
 * - ArrowUp: Volume +5%
 * - ArrowDown: Volume -5%
 * - 'n' / 'N': Lagu berikutnya (Next Track)
 * - 'p' / 'P': Lagu sebelumnya (Prev Track)
 * - Ctrl + Shift + D: Developer Diagnostic Modal
 */
export function useHotkeys(options: HotkeyOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Secret developer shortcut: Ctrl+Shift+D
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        event.preventDefault();
        optionsRef.current.onToggleDevPanel?.();
        return;
      }

      const target = event.target as HTMLElement | null;

      // Ignore when user is actively typing in input fields
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Check modifier keys (don't override Cmd+C, Ctrl+R, etc., but allow Shift for secondary hotkeys)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      switch (event.code) {
        // Play / Pause
        case 'Space':
        case 'KeyK': {
          event.preventDefault();
          optionsRef.current.onTogglePlay?.();
          break;
        }

        // Mundur Lagu / Seek Backward
        case 'ArrowLeft': {
          event.preventDefault();
          if (event.shiftKey) {
            // Shift + Panah Kiri: Mundur 5 detik
            optionsRef.current.onSeekBackward?.();
          } else {
            // Panah Kiri: Mundur ke lagu sebelumnya (Prev track)
            if (optionsRef.current.onPrevTrack) {
              optionsRef.current.onPrevTrack();
            } else {
              optionsRef.current.onSeekBackward?.();
            }
          }
          break;
        }

        case 'KeyJ': {
          event.preventDefault();
          optionsRef.current.onSeekBackward?.();
          break;
        }

        // Skip Lagu / Seek Forward
        case 'ArrowRight': {
          event.preventDefault();
          if (event.shiftKey) {
            // Shift + Panah Kanan: Maju 5 detik
            optionsRef.current.onSeekForward?.();
          } else {
            // Panah Kanan: Skip ke lagu berikutnya (Next track)
            if (optionsRef.current.onNextTrack) {
              optionsRef.current.onNextTrack();
            } else {
              optionsRef.current.onSeekForward?.();
            }
          }
          break;
        }

        case 'KeyL': {
          event.preventDefault();
          optionsRef.current.onSeekForward?.();
          break;
        }

        // Volume Up (+5%)
        case 'ArrowUp': {
          event.preventDefault();
          optionsRef.current.onVolumeUp?.();
          break;
        }

        // Volume Down (-5%)
        case 'ArrowDown': {
          event.preventDefault();
          optionsRef.current.onVolumeDown?.();
          break;
        }

        // Mute / Unmute
        case 'KeyM': {
          event.preventDefault();
          optionsRef.current.onToggleMute?.();
          break;
        }

        // Next Track (Explicit 'n')
        case 'KeyN': {
          event.preventDefault();
          optionsRef.current.onNextTrack?.();
          break;
        }

        // Previous Track (Explicit 'p')
        case 'KeyP': {
          event.preventDefault();
          optionsRef.current.onPrevTrack?.();
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
