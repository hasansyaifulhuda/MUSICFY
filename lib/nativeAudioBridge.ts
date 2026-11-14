import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface NativeTrackData {
  uri: string;
  mediaId?: string;
  title: string;
  artist: string;
  album?: string;
  artworkUri?: string;
  autoPlay?: boolean;
  positionMs?: number;
}

export interface NativePlaylistData {
  tracks: NativeTrackData[];
  startIndex?: number;
  startPositionMs?: number;
  autoPlay?: boolean;
}

export interface NativePlaybackState {
  state: 'idle' | 'buffering' | 'ready' | 'ended' | 'unknown';
  isPlaying: boolean;
  playWhenReady?: boolean;
}

export interface NativeAudioPlayerPluginInterface {
  loadTrack(options: NativeTrackData): Promise<{ success: boolean; uri?: string }>;
  play(): Promise<{ success: boolean }>;
  pause(): Promise<{ success: boolean }>;
  seekTo(options: { position?: number; positionMs?: number }): Promise<{ success: boolean; positionMs?: number; position?: number }>;
  setVolume(options: { volume: number }): Promise<{ success: boolean; volume?: number }>;
  setPlaylist(options: NativePlaylistData): Promise<{ success: boolean; count?: number }>;
  next(): Promise<{ success: boolean }>;
  previous(): Promise<{ success: boolean }>;
  stop(): Promise<{ success: boolean }>;
  getPlaybackState(): Promise<NativePlaybackState>;
  getCurrentPosition(): Promise<{ position: number; positionMs: number }>;
  getDuration(): Promise<{ duration: number; durationMs: number }>;
  checkNotificationPermission(): Promise<{ granted: boolean; status: string }>;
  requestNotificationPermission(): Promise<{ granted: boolean; status: string }>;

  addListener(
    eventName: 'playbackStateChanged',
    listenerFunc: (data: { state: string; isPlaying: boolean }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'playbackProgress',
    listenerFunc: (data: { position: number; positionMs: number; duration: number; durationMs: number }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'trackChanged',
    listenerFunc: (data: { mediaId: string; title: string; artist: string; album: string; artworkUri: string; index: number }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'durationChanged',
    listenerFunc: (data: { duration: number; durationMs: number }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'playbackError',
    listenerFunc: (data: { message: string; code: number }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'playbackEnded',
    listenerFunc: (data: { mediaId?: string; uri?: string; index?: number }) => void
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

export const NativeAudioPlayer = registerPlugin<NativeAudioPlayerPluginInterface>('NativeAudioPlayer');

/**
 * Returns true strictly if running inside the Capacitor Android native APK wrapper.
 * Returns false on Web, PWA, Desktop browsers, and iOS.
 */
export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(
    cap &&
    typeof cap.isNativePlatform === 'function' &&
    cap.isNativePlatform() &&
    typeof cap.getPlatform === 'function' &&
    cap.getPlatform() === 'android'
  );
}

export interface NativeAudioEventCallbacks {
  onPlaybackStateChanged?: (data: { state: string; isPlaying: boolean }) => void;
  onPlaybackProgress?: (data: { position: number; positionMs: number; duration: number; durationMs: number }) => void;
  onTrackChanged?: (data: { mediaId: string; title: string; artist: string; album: string; artworkUri: string; index: number }) => void;
  onDurationChanged?: (data: { duration: number; durationMs: number }) => void;
  onPlaybackError?: (data: { message: string; code: number }) => void;
  onPlaybackEnded?: (data: { mediaId?: string; uri?: string; index?: number }) => void;
}

interface EventBusRegistry {
  isAttached: boolean;
  nativeHandles: PluginListenerHandle[];
  playbackStateChanged: Set<(data: { state: string; isPlaying: boolean }) => void>;
  playbackProgress: Set<(data: { position: number; positionMs: number; duration: number; durationMs: number }) => void>;
  trackChanged: Set<(data: { mediaId: string; title: string; artist: string; album: string; artworkUri: string; index: number }) => void>;
  durationChanged: Set<(data: { duration: number; durationMs: number }) => void>;
  playbackError: Set<(data: { message: string; code: number }) => void>;
  playbackEnded: Set<(data: { mediaId?: string; uri?: string; index?: number }) => void>;
}

const registry: EventBusRegistry = {
  isAttached: false,
  nativeHandles: [],
  playbackStateChanged: new Set(),
  playbackProgress: new Set(),
  trackChanged: new Set(),
  durationChanged: new Set(),
  playbackError: new Set(),
  playbackEnded: new Set(),
};

let attachPromise: Promise<void> | null = null;

async function attachNativeListenersOnce(): Promise<void> {
  if (!isNativeAndroid()) return;
  if (registry.isAttached) return;
  if (attachPromise) return attachPromise;

  attachPromise = (async () => {
    try {
      const hState = await NativeAudioPlayer.addListener('playbackStateChanged', (data) => {
        registry.playbackStateChanged.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] state callback error:', e); }
        });
      });
      registry.nativeHandles.push(hState);

      const hProg = await NativeAudioPlayer.addListener('playbackProgress', (data) => {
        registry.playbackProgress.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] progress callback error:', e); }
        });
      });
      registry.nativeHandles.push(hProg);

      const hTrack = await NativeAudioPlayer.addListener('trackChanged', (data) => {
        registry.trackChanged.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] track callback error:', e); }
        });
      });
      registry.nativeHandles.push(hTrack);

      const hDur = await NativeAudioPlayer.addListener('durationChanged', (data) => {
        registry.durationChanged.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] duration callback error:', e); }
        });
      });
      registry.nativeHandles.push(hDur);

      const hErr = await NativeAudioPlayer.addListener('playbackError', (data) => {
        registry.playbackError.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] error callback error:', e); }
        });
      });
      registry.nativeHandles.push(hErr);

      const hEnd = await NativeAudioPlayer.addListener('playbackEnded', (data) => {
        registry.playbackEnded.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('[NativeAudioBridge] ended callback error:', e); }
        });
      });
      registry.nativeHandles.push(hEnd);

      registry.isAttached = true;
    } catch (err) {
      console.warn('[NativeAudioBridge] Failed to attach native listeners:', err);
      registry.isAttached = false;
    }
  })();

  try {
    await attachPromise;
  } finally {
    attachPromise = null;
  }
}

/**
 * Subscribes to two-way native events and returns an unbind function.
 * Manages subscriber callbacks individually without globally clearing listeners,
 * ensuring no component can disrupt another subscriber's lifecycle.
 */
export async function subscribeNativeAudioEvents(callbacks: NativeAudioEventCallbacks): Promise<() => void> {
  if (!isNativeAndroid()) {
    return () => {};
  }

  // Register individual callbacks in our subscriber sets
  if (callbacks.onPlaybackStateChanged) registry.playbackStateChanged.add(callbacks.onPlaybackStateChanged);
  if (callbacks.onPlaybackProgress) registry.playbackProgress.add(callbacks.onPlaybackProgress);
  if (callbacks.onTrackChanged) registry.trackChanged.add(callbacks.onTrackChanged);
  if (callbacks.onDurationChanged) registry.durationChanged.add(callbacks.onDurationChanged);
  if (callbacks.onPlaybackError) registry.playbackError.add(callbacks.onPlaybackError);
  if (callbacks.onPlaybackEnded) registry.playbackEnded.add(callbacks.onPlaybackEnded);

  // Ensure underlying native Capacitor listeners are attached exactly once
  await attachNativeListenersOnce();

  // Return unbinder that removes ONLY this subscriber's callbacks
  return () => {
    if (callbacks.onPlaybackStateChanged) registry.playbackStateChanged.delete(callbacks.onPlaybackStateChanged);
    if (callbacks.onPlaybackProgress) registry.playbackProgress.delete(callbacks.onPlaybackProgress);
    if (callbacks.onTrackChanged) registry.trackChanged.delete(callbacks.onTrackChanged);
    if (callbacks.onDurationChanged) registry.durationChanged.delete(callbacks.onDurationChanged);
    if (callbacks.onPlaybackError) registry.playbackError.delete(callbacks.onPlaybackError);
    if (callbacks.onPlaybackEnded) registry.playbackEnded.delete(callbacks.onPlaybackEnded);
  };
}

/**
 * Synchronizes React store with the active native ExoPlayer state
 * (useful after WebView reloads, Activity recreations, or background state recovery).
 */
export async function syncNativePlaybackState(): Promise<{
  state: string;
  isPlaying: boolean;
  position: number;
  duration: number;
} | null> {
  if (!isNativeAndroid()) return null;
  try {
    const [stateRes, posRes, durRes] = await Promise.all([
      NativeAudioPlayer.getPlaybackState(),
      NativeAudioPlayer.getCurrentPosition(),
      NativeAudioPlayer.getDuration(),
    ]);
    return {
      state: stateRes?.state || 'idle',
      isPlaying: Boolean(stateRes?.isPlaying),
      position: posRes?.position || 0,
      duration: durRes?.duration || 0,
    };
  } catch (err) {
    console.warn('[NativeAudioBridge] Failed to sync playback state:', err);
    return null;
  }
}

let hasCheckedNotificationPermission = false;

/**
 * Checks and requests notification permission on Android 13+ (API 33+).
 * Guards against repetitive prompts across track transitions.
 */
export async function checkAndRequestNotificationPermission(): Promise<boolean> {
  if (!isNativeAndroid()) return true;
  if (hasCheckedNotificationPermission) return true;
  hasCheckedNotificationPermission = true;
  try {
    const status = await NativeAudioPlayer.checkNotificationPermission();
    if (status && status.granted) return true;
    const req = await NativeAudioPlayer.requestNotificationPermission();
    return Boolean(req && req.granted);
  } catch (e) {
    console.warn('[NativeAudioBridge] Notification permission request error:', e);
    return false;
  }
}
