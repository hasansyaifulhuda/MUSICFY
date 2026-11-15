import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';

// =============================================================================
// 1. DATA CONTRACTS & INTERFACES (Mirrors NativeAudioPlayerPlugin.java)
// =============================================================================

/**
 * Data structure for an individual audio track passed to native ExoPlayer.
 * Corresponds to PluginCall options in NativeAudioPlayerPlugin#loadTrack
 */
export interface NativeTrackData {
  /** Playable stream or local file URI (Required, e.g. https://... or file:///...) */
  uri: string;
  /** Unique media identifier (Optional, defaults to uri in Java) */
  mediaId?: string;
  /** Display title for MediaSession & Notification (Optional, defaults to "MusicFY" in Java) */
  title?: string;
  /** Artist display name for MediaSession & Notification (Optional, defaults to "Musik" in Java) */
  artist?: string;
  /** Album display name (Optional, defaults to "" in Java) */
  album?: string;
  /** HTTP/HTTPS artwork URI for lock screen & notification (Optional) */
  artworkUri?: string;
  /** Whether to immediately start playback once prepared (Optional, defaults to true in Java) */
  autoPlay?: boolean;
  /** Initial seek playback position in milliseconds (Optional, defaults to 0 in Java) */
  positionMs?: number;
}

/**
 * Data structure for queuing a playlist of tracks in native ExoPlayer.
 * Corresponds to PluginCall options in NativeAudioPlayerPlugin#setPlaylist
 */
export interface NativePlaylistData {
  /** Array of track objects to queue in ExoPlayer (Required) */
  tracks: NativeTrackData[];
  /** Zero-based index of track to begin playing (Optional, defaults to 0 in Java) */
  startIndex?: number;
  /** Start position in milliseconds within the starting track (Optional, defaults to 0 in Java) */
  startPositionMs?: number;
  /** Whether to begin playback immediately (Optional, defaults to true in Java) */
  autoPlay?: boolean;
}

/**
 * AndroidX Media3 ExoPlayer playback states mapped from NativeAudioPlayerPlugin#mapPlaybackState
 */
export type NativePlaybackStateString = 'idle' | 'buffering' | 'ready' | 'ended' | 'unknown';

/**
 * Real-time playback state snapshot.
 * Corresponds to NativeAudioPlayerPlugin#getPlaybackState and 'playbackStateChanged' event payload.
 */
export interface NativePlaybackState {
  state: NativePlaybackStateString;
  isPlaying: boolean;
  playWhenReady: boolean;
}

/**
 * Periodic playback progress broadcasted from native ExoPlayer (every 250ms while playing).
 * Corresponds to 'playbackProgress' event payload in NativeAudioPlayerPlugin.
 */
export interface NativePlaybackProgress {
  positionMs: number;
  position: number; // in seconds
  durationMs: number;
  duration: number; // in seconds
}

/**
 * Broadcasted when ExoPlayer transitions to a new media item (e.g. next track or user seek).
 * Corresponds to 'trackChanged' event payload in NativeAudioPlayerPlugin.
 */
export interface NativeTrackChanged {
  mediaId: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  index: number;
}

/**
 * Broadcasted when ExoPlayer determines or updates track duration.
 * Corresponds to 'durationChanged' event payload in NativeAudioPlayerPlugin.
 */
export interface NativeDurationChanged {
  durationMs: number;
  duration: number; // in seconds
}

/**
 * Broadcasted when ExoPlayer playback ends (STATE_ENDED).
 * Corresponds to 'playbackEnded' event payload in NativeAudioPlayerPlugin.
 */
export interface NativePlaybackEnded {
  mediaId?: string;
  uri?: string;
  index?: number;
}

/**
 * Broadcasted when an ExoPlayer native error occurs.
 * Corresponds to 'playbackError' event payload in NativeAudioPlayerPlugin.
 */
export interface NativePlaybackError {
  message: string;
  code: number;
}

/**
 * Permission check/request response on Android 13+ (POST_NOTIFICATIONS).
 * Corresponds to NativeAudioPlayerPlugin#checkNotificationPermission and #requestNotificationPermission.
 */
export interface NativeNotificationPermissionResult {
  granted: boolean;
  status: 'granted' | 'prompt' | 'denied';
}

/**
 * Method result interfaces mirroring Java PluginCall#resolve payloads.
 */
export interface NativeLoadTrackResult {
  success: boolean;
  uri: string;
}

export interface NativeSetPlaylistResult {
  success: boolean;
  count: number;
}

export type NativeRepeatMode = 'off' | 'one' | 'all';

export interface NativeRepeatModeResult {
  success: boolean;
  mode: NativeRepeatMode;
}

export interface NativeGetRepeatModeResult {
  mode: NativeRepeatMode;
}

export interface NativeActionResult {
  success: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  reason?: string;
}

export interface NativeSeekResult {
  success: boolean;
  positionMs: number;
  position: number;
}

export interface NativeVolumeResult {
  success: boolean;
  volume: number;
}

export interface NativePositionResult {
  positionMs: number;
  position: number;
}

export interface NativeDurationResult {
  durationMs: number;
  duration: number;
}

// =============================================================================
// 2. CAPACITOR PLUGIN INTERFACE SPECIFICATION
// =============================================================================

export interface NativeAudioPlayerPluginInterface {
  loadTrack(options: NativeTrackData): Promise<NativeLoadTrackResult>;
  setPlaylist(options: NativePlaylistData): Promise<NativeSetPlaylistResult>;
  play(): Promise<NativeActionResult>;
  pause(): Promise<NativeActionResult>;
  seekTo(options: { positionMs?: number; position?: number }): Promise<NativeSeekResult>;
  setVolume(options: { volume: number }): Promise<NativeVolumeResult>;
  setRepeatMode(options: { mode: NativeRepeatMode }): Promise<NativeRepeatModeResult>;
  getRepeatMode(): Promise<NativeGetRepeatModeResult>;
  next(): Promise<NativeActionResult>;
  previous(): Promise<NativeActionResult>;
  stop(): Promise<NativeActionResult>;
  getPlaybackState(): Promise<NativePlaybackState>;
  getCurrentPosition(): Promise<NativePositionResult>;
  getDuration(): Promise<NativeDurationResult>;
  checkNotificationPermission(): Promise<NativeNotificationPermissionResult>;
  requestNotificationPermission(): Promise<NativeNotificationPermissionResult>;

  addListener(
    eventName: 'playbackStateChanged',
    listenerFunc: (state: NativePlaybackState) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'playbackProgress',
    listenerFunc: (progress: NativePlaybackProgress) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'trackChanged',
    listenerFunc: (track: NativeTrackChanged) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'durationChanged',
    listenerFunc: (duration: NativeDurationChanged) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'playbackEnded',
    listenerFunc: (event: NativePlaybackEnded) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'playbackError',
    listenerFunc: (error: NativePlaybackError) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'repeatModeChanged',
    listenerFunc: (event: { mode: NativeRepeatMode }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// =============================================================================
// 3. CAPACITOR PLUGIN REGISTRATION WITH SAFE WEB FALLBACK
// =============================================================================

export const NativeAudioPlayer = registerPlugin<NativeAudioPlayerPluginInterface>('NativeAudioPlayer', {
  web: () => ({
    loadTrack: async () => ({ success: false, uri: '' }),
    setPlaylist: async () => ({ success: false, count: 0 }),
    play: async () => ({ success: false }),
    pause: async () => ({ success: false }),
    seekTo: async () => ({ success: false, positionMs: 0, position: 0 }),
    setVolume: async () => ({ success: false, volume: 1.0 }),
    setRepeatMode: async (options: { mode: NativeRepeatMode }) => ({ success: false, mode: options?.mode || 'off' }),
    getRepeatMode: async () => ({ mode: 'off' }),
    next: async () => ({ success: false, hasNext: false }),
    previous: async () => ({ success: false, hasPrevious: false }),
    stop: async () => ({ success: false }),
    getPlaybackState: async () => ({ state: 'idle', isPlaying: false, playWhenReady: false }),
    getCurrentPosition: async () => ({ positionMs: 0, position: 0 }),
    getDuration: async () => ({ durationMs: 0, duration: 0 }),
    checkNotificationPermission: async () => ({ granted: true, status: 'granted' }),
    requestNotificationPermission: async () => ({ granted: true, status: 'granted' }),
    addListener: async () => ({ remove: async () => {} } as PluginListenerHandle),
    removeAllListeners: async () => {},
  }),
});

let customPluginInstance: NativeAudioPlayerPluginInterface | null = null;

/**
 * Injects a custom plugin instance (primarily for automated testing and mocking).
 */
export function _setCustomNativeAudioPlayerForTesting(
  plugin: NativeAudioPlayerPluginInterface | null
): void {
  customPluginInstance = plugin;
}

/**
 * Resolves the active NativeAudioPlayer instance (delegates to custom mock if provided, else Capacitor NativeAudioPlayer).
 */
export function getNativeAudioPlayer(): NativeAudioPlayerPluginInterface {
  return customPluginInstance || NativeAudioPlayer;
}

// =============================================================================
// 4. PLATFORM DETECTION
// =============================================================================

/**
 * Returns true if running natively on an Android device inside Capacitor APK.
 * Uses Capacitor native platform detection rather than relying on AndroidMediaBridge.
 */
export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const winCap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (winCap && typeof winCap.isNativePlatform === 'function') {
      return Boolean(winCap.isNativePlatform() && winCap.getPlatform?.() === 'android');
    }
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Checks whether the NativeAudioPlayer plugin is registered and available.
 */
export function isNativeAudioPlayerAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const winCap = (window as unknown as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
    if (winCap && typeof winCap.isPluginAvailable === 'function') {
      return isNativeAndroid() && Boolean(winCap.isPluginAvailable('NativeAudioPlayer'));
    }
    return isNativeAndroid() && Capacitor.isPluginAvailable('NativeAudioPlayer');
  } catch {
    return false;
  }
}

// =============================================================================
// 5. EVENT SUBSCRIPTION REGISTRY & SAFE LIFECYCLE MANAGEMENT
// =============================================================================

export type NativeEventName =
  | 'playbackStateChanged'
  | 'playbackProgress'
  | 'trackChanged'
  | 'durationChanged'
  | 'playbackEnded'
  | 'playbackError'
  | 'repeatModeChanged';

export interface NativeEventCallbackMap {
  playbackStateChanged: (state: NativePlaybackState) => void;
  playbackProgress: (progress: NativePlaybackProgress) => void;
  trackChanged: (track: NativeTrackChanged) => void;
  durationChanged: (duration: NativeDurationChanged) => void;
  playbackEnded: (event: NativePlaybackEnded) => void;
  playbackError: (error: NativePlaybackError) => void;
  repeatModeChanged: (event: { mode: NativeRepeatMode }) => void;
}

export interface NativeAudioEventCallbacks extends Partial<NativeEventCallbackMap> {
  onPlaybackStateChanged?: (state: NativePlaybackState) => void;
  onPlaybackProgress?: (progress: NativePlaybackProgress) => void;
  onTrackChanged?: (track: NativeTrackChanged) => void;
  onDurationChanged?: (duration: NativeDurationChanged) => void;
  onPlaybackEnded?: (event: NativePlaybackEnded) => void;
  onPlaybackError?: (error: NativePlaybackError) => void;
  onRepeatModeChanged?: (event: { mode: NativeRepeatMode }) => void;
}

interface EventSubscriptionState<E extends NativeEventName> {
  subscribers: Set<NativeEventCallbackMap[E]>;
  handle: PluginListenerHandle | null;
  isRegistering: boolean;
}

const eventRegistry: { [K in NativeEventName]: EventSubscriptionState<K> } = {
  playbackStateChanged: { subscribers: new Set(), handle: null, isRegistering: false },
  playbackProgress: { subscribers: new Set(), handle: null, isRegistering: false },
  trackChanged: { subscribers: new Set(), handle: null, isRegistering: false },
  durationChanged: { subscribers: new Set(), handle: null, isRegistering: false },
  playbackEnded: { subscribers: new Set(), handle: null, isRegistering: false },
  playbackError: { subscribers: new Set(), handle: null, isRegistering: false },
  repeatModeChanged: { subscribers: new Set(), handle: null, isRegistering: false },
};

/**
 * Resets the in-memory event registry (intended for testing and lifecycle re-initialization).
 */
export function _resetEventRegistryForTesting(): void {
  customPluginInstance = null;
  (Object.keys(eventRegistry) as NativeEventName[]).forEach((eventName) => {
    eventRegistry[eventName].subscribers.clear();
    eventRegistry[eventName].handle = null;
    eventRegistry[eventName].isRegistering = false;
  });
}

/**
 * Subscribes a callback to a specific native audio event safely.
 *
 * Guarantees:
 * 1. Exactly ONE underlying Capacitor listener is registered per event type, avoiding duplicate native listeners.
 * 2. Unsubscribing removes ONLY this specific callback, never affecting other components or subscribers.
 * 3. Safe in Web/PWA (returns a no-op unbinder without crashing).
 */
export function subscribeNativeAudioEvent<E extends NativeEventName>(
  eventName: E,
  callback: NativeEventCallbackMap[E]
): () => void {
  if (typeof window === 'undefined' || !isNativeAndroid()) {
    return () => {};
  }

  const entry = eventRegistry[eventName] as EventSubscriptionState<E>;
  entry.subscribers.add(callback);

  // If this is the first subscriber and native handle is not yet attached, attach it
  if (entry.subscribers.size === 1 && !entry.handle && !entry.isRegistering) {
    entry.isRegistering = true;
    (
      getNativeAudioPlayer().addListener(
        eventName as any,
        ((data: unknown) => {
          // Snapshot current subscribers to protect against mutations during dispatch
          const currentSubscribers = Array.from(entry.subscribers);
          currentSubscribers.forEach((cb) => {
            try {
              (cb as (d: unknown) => void)(data);
            } catch (err) {
              console.error(`[NativeAudioBridge] Error in ${eventName} subscriber:`, err);
            }
          });
        }) as any
      ) as Promise<PluginListenerHandle>
    )
      .then((handle) => {
        entry.handle = handle;
        entry.isRegistering = false;
        // If all subscribers unsubscribed while the registration promise was resolving
        if (entry.subscribers.size === 0) {
          handle.remove().catch(() => {});
          entry.handle = null;
        }
      })
      .catch((err) => {
        entry.isRegistering = false;
        console.warn(`[NativeAudioBridge] Failed to register listener for ${eventName}:`, err);
      });
  }

  // Return isolated unbinder function
  return () => {
    entry.subscribers.delete(callback);
    if (entry.subscribers.size === 0 && entry.handle) {
      const handleToRelease = entry.handle;
      entry.handle = null;
      handleToRelease.remove().catch((err) => {
        console.warn(`[NativeAudioBridge] Error removing listener handle for ${eventName}:`, err);
      });
    }
  };
}

/**
 * Subscribes to multiple native audio events at once with a single unified cleanup function.
 * Accepts event names either directly or with 'on' prefix (e.g. playbackProgress or onPlaybackProgress).
 * Ensures each handler is cleanly isolated and unsubscribed when cleanup is invoked.
 */
export function subscribeNativeAudioEvents(
  callbacks: NativeAudioEventCallbacks
): () => void {
  const unbinders: Array<() => void> = [];
  const eventNames: NativeEventName[] = [
    'playbackStateChanged',
    'playbackProgress',
    'trackChanged',
    'durationChanged',
    'playbackEnded',
    'playbackError',
    'repeatModeChanged',
  ];

  eventNames.forEach((eventName) => {
    const onKey = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}` as keyof NativeAudioEventCallbacks;
    const cb = callbacks[eventName] || (callbacks[onKey] as any);
    if (cb) {
      unbinders.push(subscribeNativeAudioEvent(eventName, cb as any));
    }
  });

  return () => {
    unbinders.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        console.warn('[NativeAudioBridge] Error in unbinder cleanup:', err);
      }
    });
  };
}

// Convenience event subscription helpers
export const subscribePlaybackStateChanged = (cb: (state: NativePlaybackState) => void) =>
  subscribeNativeAudioEvent('playbackStateChanged', cb);

export const subscribePlaybackProgress = (cb: (progress: NativePlaybackProgress) => void) =>
  subscribeNativeAudioEvent('playbackProgress', cb);

export const subscribeTrackChanged = (cb: (track: NativeTrackChanged) => void) =>
  subscribeNativeAudioEvent('trackChanged', cb);

export const subscribeDurationChanged = (cb: (duration: NativeDurationChanged) => void) =>
  subscribeNativeAudioEvent('durationChanged', cb);

export const subscribePlaybackEnded = (cb: (event: NativePlaybackEnded) => void) =>
  subscribeNativeAudioEvent('playbackEnded', cb);

export const subscribePlaybackError = (cb: (error: NativePlaybackError) => void) =>
  subscribeNativeAudioEvent('playbackError', cb);

export const subscribeRepeatModeChanged = (cb: (event: { mode: NativeRepeatMode }) => void) =>
  subscribeNativeAudioEvent('repeatModeChanged', cb);

// =============================================================================
// 6. SAFE METHOD WRAPPERS (Browser/PWA Fallback Guarded)
// =============================================================================

/**
 * Loads a track into native ExoPlayer.
 * Safely guarded: returns { success: false } when invoked on Web/PWA.
 */
export async function loadTrack(track: NativeTrackData): Promise<NativeLoadTrackResult> {
  if (!isNativeAndroid()) {
    return { success: false, uri: track.uri };
  }
  try {
    return await getNativeAudioPlayer().loadTrack(track);
  } catch (err) {
    console.error('[NativeAudioBridge] loadTrack error:', err);
    throw err;
  }
}

/**
 * Queues a full playlist into native ExoPlayer.
 * Safely guarded: returns { success: false } when invoked on Web/PWA.
 */
export async function setPlaylist(playlist: NativePlaylistData): Promise<NativeSetPlaylistResult> {
  if (!isNativeAndroid()) {
    return { success: false, count: playlist.tracks.length };
  }
  try {
    return await getNativeAudioPlayer().setPlaylist(playlist);
  } catch (err) {
    console.error('[NativeAudioBridge] setPlaylist error:', err);
    throw err;
  }
}

/**
 * Resumes native ExoPlayer playback.
 */
export async function play(): Promise<NativeActionResult> {
  if (!isNativeAndroid()) {
    return { success: false };
  }
  try {
    return await getNativeAudioPlayer().play();
  } catch (err) {
    console.error('[NativeAudioBridge] play error:', err);
    throw err;
  }
}

/**
 * Pauses native ExoPlayer playback.
 */
export async function pause(): Promise<NativeActionResult> {
  if (!isNativeAndroid()) {
    return { success: false };
  }
  try {
    return await getNativeAudioPlayer().pause();
  } catch (err) {
    console.error('[NativeAudioBridge] pause error:', err);
    throw err;
  }
}

/**
 * Seeks native ExoPlayer to target position in seconds or milliseconds.
 * Accepts either seconds (number) or an object { position?: number, positionMs?: number }.
 */
export async function seekTo(
  positionOrOptions: number | { position?: number; positionMs?: number }
): Promise<NativeSeekResult> {
  if (!isNativeAndroid()) {
    const pos = typeof positionOrOptions === 'number' ? positionOrOptions : positionOrOptions.position ?? 0;
    return { success: false, position: pos, positionMs: Math.round(pos * 1000) };
  }
  try {
    const opts =
      typeof positionOrOptions === 'number'
        ? { position: positionOrOptions }
        : positionOrOptions;
    return await getNativeAudioPlayer().seekTo(opts);
  } catch (err) {
    console.error('[NativeAudioBridge] seekTo error:', err);
    throw err;
  }
}

/**
 * Adjusts native ExoPlayer volume (0.0 to 1.0).
 */
export async function setVolume(volume: number): Promise<NativeVolumeResult> {
  if (!isNativeAndroid()) {
    return { success: false, volume: Math.max(0, Math.min(1, volume)) };
  }
  try {
    return await getNativeAudioPlayer().setVolume({ volume });
  } catch (err) {
    console.error('[NativeAudioBridge] setVolume error:', err);
    throw err;
  }
}

/**
 * Sets native ExoPlayer repeat mode ('off' | 'one' | 'all').
 */
export async function setRepeatMode(mode: NativeRepeatMode): Promise<NativeRepeatModeResult> {
  if (!isNativeAndroid()) {
    return { success: false, mode };
  }
  try {
    return await getNativeAudioPlayer().setRepeatMode({ mode });
  } catch (err) {
    console.error('[NativeAudioBridge] setRepeatMode error:', err);
    throw err;
  }
}

/**
 * Retrieves the current repeat mode from native ExoPlayer.
 */
export async function getRepeatMode(): Promise<NativeGetRepeatModeResult> {
  if (!isNativeAndroid()) {
    return { mode: 'off' };
  }
  try {
    return await getNativeAudioPlayer().getRepeatMode();
  } catch (err) {
    console.error('[NativeAudioBridge] getRepeatMode error:', err);
    return { mode: 'off' };
  }
}

/**
 * Skips to the next track in the native ExoPlayer queue.
 */
export async function next(): Promise<NativeActionResult> {
  if (!isNativeAndroid()) {
    return { success: false, hasNext: false };
  }
  try {
    return await getNativeAudioPlayer().next();
  } catch (err) {
    console.error('[NativeAudioBridge] next error:', err);
    throw err;
  }
}

/**
 * Skips to the previous track in the native ExoPlayer queue.
 */
export async function previous(): Promise<NativeActionResult> {
  if (!isNativeAndroid()) {
    return { success: false, hasPrevious: false };
  }
  try {
    return await getNativeAudioPlayer().previous();
  } catch (err) {
    console.error('[NativeAudioBridge] previous error:', err);
    throw err;
  }
}

/**
 * Stops native ExoPlayer playback.
 */
export async function stop(): Promise<NativeActionResult> {
  if (!isNativeAndroid()) {
    return { success: false };
  }
  try {
    return await getNativeAudioPlayer().stop();
  } catch (err) {
    console.error('[NativeAudioBridge] stop error:', err);
    throw err;
  }
}

/**
 * Retrieves the current playback state from native ExoPlayer.
 */
export async function getPlaybackState(): Promise<NativePlaybackState> {
  if (!isNativeAndroid()) {
    return { state: 'idle', isPlaying: false, playWhenReady: false };
  }
  try {
    return await getNativeAudioPlayer().getPlaybackState();
  } catch (err) {
    console.error('[NativeAudioBridge] getPlaybackState error:', err);
    return { state: 'idle', isPlaying: false, playWhenReady: false };
  }
}

/**
 * Retrieves the current playback position from native ExoPlayer.
 */
export async function getCurrentPosition(): Promise<NativePositionResult> {
  if (!isNativeAndroid()) {
    return { positionMs: 0, position: 0 };
  }
  try {
    return await getNativeAudioPlayer().getCurrentPosition();
  } catch (err) {
    console.error('[NativeAudioBridge] getCurrentPosition error:', err);
    return { positionMs: 0, position: 0 };
  }
}

/**
 * Retrieves the track duration from native ExoPlayer.
 */
export async function getDuration(): Promise<NativeDurationResult> {
  if (!isNativeAndroid()) {
    return { durationMs: 0, duration: 0 };
  }
  try {
    return await getNativeAudioPlayer().getDuration();
  } catch (err) {
    console.error('[NativeAudioBridge] getDuration error:', err);
    return { durationMs: 0, duration: 0 };
  }
}

/**
 * Checks POST_NOTIFICATIONS runtime permission status (Android 13+ / API 33+).
 */
export async function checkNotificationPermission(): Promise<NativeNotificationPermissionResult> {
  if (!isNativeAndroid()) {
    return { granted: true, status: 'granted' };
  }
  try {
    return await getNativeAudioPlayer().checkNotificationPermission();
  } catch (err) {
    console.warn('[NativeAudioBridge] checkNotificationPermission error:', err);
    return { granted: false, status: 'denied' };
  }
}

/**
 * Requests POST_NOTIFICATIONS runtime permission (Android 13+ / API 33+).
 */
export async function requestNotificationPermission(): Promise<NativeNotificationPermissionResult> {
  if (!isNativeAndroid()) {
    return { granted: true, status: 'granted' };
  }
  try {
    return await getNativeAudioPlayer().requestNotificationPermission();
  } catch (err) {
    console.warn('[NativeAudioBridge] requestNotificationPermission error:', err);
    return { granted: false, status: 'denied' };
  }
}

let hasCheckedNotificationPermission = false;

/**
 * Checks and requests notification permission once upon startup or first playback on Android 13+.
 * Idempotent: guards against repetitive dialog prompts.
 */
export async function checkAndRequestNotificationPermission(): Promise<boolean> {
  if (!isNativeAndroid()) return true;
  if (hasCheckedNotificationPermission) return true;
  hasCheckedNotificationPermission = true;

  try {
    const status = await checkNotificationPermission();
    if (status.granted) return true;
    const req = await requestNotificationPermission();
    return req.granted;
  } catch (e) {
    console.warn('[NativeAudioBridge] Notification permission prompt error:', e);
    return false;
  }
}

/**
 * Synchronizes React store with the active native ExoPlayer state
 * (useful after WebView reloads, Activity recreations, or background state recovery).
 */
export async function syncNativePlaybackState(): Promise<{
  state: NativePlaybackStateString;
  isPlaying: boolean;
  position: number;
  duration: number;
} | null> {
  if (!isNativeAndroid()) return null;
  try {
    const player = getNativeAudioPlayer();
    const [stateRes, posRes, durRes] = await Promise.all([
      player.getPlaybackState(),
      player.getCurrentPosition(),
      player.getDuration(),
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

// =============================================================================
// 7. UNIFIED BRIDGE EXPORT OBJECT
// =============================================================================

export const nativeAudioBridge = {
  isNativeAndroid,
  isNativeAudioPlayerAvailable,
  loadTrack,
  setPlaylist,
  play,
  pause,
  seekTo,
  setVolume,
  setRepeatMode,
  getRepeatMode,
  next,
  previous,
  stop,
  getPlaybackState,
  getCurrentPosition,
  getDuration,
  checkNotificationPermission,
  requestNotificationPermission,
  checkAndRequestNotificationPermission,
  subscribeNativeAudioEvent,
  subscribeNativeAudioEvents,
  subscribeRepeatModeChanged,
  syncNativePlaybackState,
};

export default nativeAudioBridge;
