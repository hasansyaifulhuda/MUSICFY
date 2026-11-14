import { create } from 'zustand';
import { toast } from '@/lib/toast';
import { pauseAudioSafely, safeFadeOut, cancelActiveFade, getPersistentAudioElement } from './audioElement';
import { usePlayerStore } from './store';
import { fadeOutWebAudioGain, restoreWebAudioGain } from './audioEffects';

/**
 * Safely converts store volume (0-100 percentage) to HTMLMediaElement volume range (0.0-1.0).
 * Guarantees the value is strictly clamped between 0 and 1 to prevent IndexSizeError.
 */
export function getClampedAudioVolume(rawVolume?: number | null): number {
  if (typeof rawVolume !== 'number' || isNaN(rawVolume)) {
    return 1;
  }
  let normalized = rawVolume;
  // If stored on a 0-100 scale (default 100), convert percentage to 0.0-1.0 range
  if (rawVolume > 1 || (rawVolume === 1 && Number.isInteger(rawVolume))) {
    normalized = rawVolume / 100;
  }
  return Math.max(0, Math.min(1, normalized));
}

export interface SleepTimerState {
  isActive: boolean;
  selectedMinutes: number | null;
  targetTimestamp: number | null;
  remainingSeconds: number;
  isModalOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
  startTimer: (minutes: number) => void;
  cancelTimer: () => void;
  tick: () => void;
}

let intervalTimer: NodeJS.Timeout | null = null;
let isFadingOut = false;

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  isActive: false,
  selectedMinutes: null,
  targetTimestamp: null,
  remainingSeconds: 0,
  isModalOpen: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  startTimer: (minutes: number) => {
    if (minutes <= 0) return;

    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }

    cancelActiveFade();
    isFadingOut = false;
    restoreWebAudioGain();
    const audio = getPersistentAudioElement();
    if (audio) {
      try {
        audio.volume = getClampedAudioVolume(usePlayerStore.getState().volume);
      } catch {}
    }

    const now = Date.now();
    const targetTimestamp = now + minutes * 60 * 1000;
    const remainingSeconds = minutes * 60;

    set({
      isActive: true,
      selectedMinutes: minutes,
      targetTimestamp,
      remainingSeconds,
      isModalOpen: false,
    });

    toast.success(`Pengatur waktu tidur diatur untuk ${minutes} menit`);

    intervalTimer = setInterval(() => {
      get().tick();
    }, 1000);
  },

  cancelTimer: () => {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }

    cancelActiveFade();
    isFadingOut = false;
    restoreWebAudioGain();
    const audio = getPersistentAudioElement();
    if (audio) {
      try {
        audio.volume = getClampedAudioVolume(usePlayerStore.getState().volume);
      } catch {}
    }

    const wasActive = get().isActive;

    set({
      isActive: false,
      selectedMinutes: null,
      targetTimestamp: null,
      remainingSeconds: 0,
    });

    if (wasActive) {
      toast.info('Pengatur waktu tidur dinonaktifkan');
    }
  },

  tick: () => {
    const { isActive, targetTimestamp } = get();
    if (!isActive || !targetTimestamp) {
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
      return;
    }

    const now = Date.now();
    const remainingMs = targetTimestamp - now;

    // Trigger smooth fade-out during the last 5 seconds (5000ms)
    if (remainingMs <= 5000 && remainingMs > 0 && !isFadingOut) {
      isFadingOut = true;
      const fadeDurationSec = Math.max(1, Math.min(5, Math.ceil(remainingMs / 1000)));
      // Web Audio API GainNode linear/smooth ramp fade-out
      fadeOutWebAudioGain(fadeDurationSec);
      // Synchronize HTMLAudioElement safe fade-out
      const audio = getPersistentAudioElement();
      if (audio) {
        safeFadeOut(audio, remainingMs);
      }
    }

    if (remainingMs <= 0) {
      // Time is up! Stop playback cleanly and notify user
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
      cancelActiveFade();
      isFadingOut = false;

      set({
        isActive: false,
        selectedMinutes: null,
        targetTimestamp: null,
        remainingSeconds: 0,
      });

      try {
        pauseAudioSafely();
        usePlayerStore.getState().setPlaying(false);
        // Restore Web Audio Gain and audio element volume for subsequent plays
        restoreWebAudioGain();
        const audio = getPersistentAudioElement();
        if (audio) {
          try {
            audio.volume = getClampedAudioVolume(usePlayerStore.getState().volume);
          } catch {}
        }
      } catch {}

      toast.info('Pengatur waktu tidur selesai: Pemutaran musik dihentikan');
    } else {
      set({
        remainingSeconds: Math.ceil(remainingMs / 1000),
      });
    }
  },
}));

/**
 * Format remaining seconds into clean MM:SS or HH:MM:SS string
 */
export function formatRemainingTimer(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
