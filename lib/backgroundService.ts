import { registerPlugin } from '@capacitor/core';
import { isNativeAndroid, stop as nativeStop } from './nativeAudioBridge';

export interface MusicBackgroundPluginInterface {
  startForegroundService(): Promise<{ success: boolean; status: string }>;
  stopForegroundService(): Promise<{ success: boolean; status: string }>;
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<{ requested: boolean }>;
}

export const MusicBackgroundService = registerPlugin<MusicBackgroundPluginInterface>('MusicBackgroundService');

/**
 * Activates native Android Foreground Service, Audio Focus, and Wakelock
 * to ensure playback continues uninterrupted even during heavy gaming or low RAM conditions.
 */
export async function startBackgroundAudio(): Promise<void> {
  if (typeof window === 'undefined') return;

  // On native Android running Media3 ExoPlayer, MusicMediaSessionService manages its own foreground notification and audio focus.
  if (isNativeAndroid()) {
    return;
  }

  // 1. Native Capacitor Plugin
  try {
    if (MusicBackgroundService && typeof MusicBackgroundService.startForegroundService === 'function') {
      await MusicBackgroundService.startForegroundService();
    }
  } catch {}

  // 2. Direct AndroidMediaBridge
  try {
    if ((window as any).AndroidMediaBridge && typeof (window as any).AndroidMediaBridge.requestAudioFocus === 'function') {
      (window as any).AndroidMediaBridge.requestAudioFocus();
    }
  } catch {}
}

/**
 * Releases background locks and detaches foreground service when music is paused/stopped.
 */
export async function stopBackgroundAudio(): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNativeAndroid()) {
    return;
  }

  // 1. Native Capacitor Plugin
  try {
    if (MusicBackgroundService && typeof MusicBackgroundService.stopForegroundService === 'function') {
      await MusicBackgroundService.stopForegroundService();
    }
  } catch {}

  // 2. Direct AndroidMediaBridge
  try {
    if ((window as any).AndroidMediaBridge && typeof (window as any).AndroidMediaBridge.abandonAudioFocus === 'function') {
      (window as any).AndroidMediaBridge.abandonAudioFocus();
    }
  } catch {}
}

/**
 * Fully tears down native foreground service, Android media session, and dismisses notifications immediately.
 */
export async function terminateBackgroundAudio(): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNativeAndroid()) {
    try {
      await nativeStop();
    } catch {}
    return;
  }

  try {
    if ((window as any).AndroidMediaBridge && typeof (window as any).AndroidMediaBridge.destroySession === 'function') {
      (window as any).AndroidMediaBridge.destroySession();
    }
  } catch {}

  try {
    if (MusicBackgroundService && typeof MusicBackgroundService.stopForegroundService === 'function') {
      await MusicBackgroundService.stopForegroundService();
    }
  } catch {}

  try {
    if (!isNativeAndroid() && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  } catch {}
}

/**
 * Prompts user to exempt MusicFY from aggressive OEM battery killers (MIUI, ColorOS, OneUI).
 */
export async function requestBatteryExemption(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (MusicBackgroundService && typeof MusicBackgroundService.requestIgnoreBatteryOptimizations === 'function') {
      await MusicBackgroundService.requestIgnoreBatteryOptimizations();
    } else if ((window as any).AndroidMediaBridge && typeof (window as any).AndroidMediaBridge.requestIgnoreBatteryOptimizations === 'function') {
      (window as any).AndroidMediaBridge.requestIgnoreBatteryOptimizations();
    }
  } catch {}
}
