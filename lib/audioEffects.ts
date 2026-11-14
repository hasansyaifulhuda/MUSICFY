import { getPersistentAudioElement } from './audioElement';

/**
 * Enterprise Web Audio API Engine Controller
 *
 * Guarantees:
 * 1. Singleton AudioContext and MediaElementAudioSourceNode across DOM lifecycles.
 * 2. Preamp/Master Gain Node for smooth fade-outs (Sleep Timer).
 * 3. AnalyserNode for 60fps real-time visualizers with 0 layout shift or memory leaks.
 * 4. DynamicsCompressorNode (Peak Limiter) to prevent digital clipping/distortion.
 * 5. Mobile Autoplay & AudioContext suspension safety with automatic user-gesture resumption.
 */

declare global {
  interface Window {
    __MUSICFY_AUDIO_CONTEXT__?: AudioContext;
    __MUSICFY_MEDIA_SOURCE__?: MediaElementAudioSourceNode;
    __MUSICFY_EFFECTS_CHAIN__?: AudioEffectsChain;
  }
}

export interface AudioEffectsChain {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  preampGain: GainNode;
  analyser: AnalyserNode;
  peakLimiter: DynamicsCompressorNode;
}

let activeChain: AudioEffectsChain | null = null;
let sharedFrequencyBuffer: Uint8Array<ArrayBuffer> | null = null;

/**
 * Initializes and wires the Web Audio API graph to the persistent HTML5 audio element.
 * Idempotent: Can safely be called repeatedly without throwing InvalidStateError.
 */
export function initAudioEffects(): AudioEffectsChain | null {
  if (typeof window === 'undefined') return null;

  if (activeChain) {
    if (activeChain.context.state === 'suspended') {
      activeChain.context.resume().catch(() => {});
    }
    return activeChain;
  }

  if (window.__MUSICFY_EFFECTS_CHAIN__) {
    activeChain = window.__MUSICFY_EFFECTS_CHAIN__;
    return activeChain;
  }

  const audio = getPersistentAudioElement();
  if (!audio) return null;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[WebAudio] AudioContext not supported on this device/browser');
      return null;
    }

    // Reuse window global context if previously created
    const ctx: AudioContext =
      window.__MUSICFY_AUDIO_CONTEXT__ ||
      new AudioContextClass({ latencyHint: 'playback' });
    window.__MUSICFY_AUDIO_CONTEXT__ = ctx;

    // Reuse or create MediaElementAudioSourceNode (Only call createMediaElementSource once!)
    let source: MediaElementAudioSourceNode;
    if (window.__MUSICFY_MEDIA_SOURCE__) {
      source = window.__MUSICFY_MEDIA_SOURCE__;
    } else {
      source = ctx.createMediaElementSource(audio);
      window.__MUSICFY_MEDIA_SOURCE__ = source;
    }

    // 1. Preamp / Master Gain Node (used for volume fading in Sleep Timer)
    const preampGain = ctx.createGain();
    preampGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 2. Analyser Node for Real-Time Canvas Visualizer (60fps, 64 bins)
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128; // 64 frequency bins
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;

    // 3. Peak Limiter / Dynamics Compressor (prevents clipping/distortion)
    const peakLimiter = ctx.createDynamicsCompressor();
    peakLimiter.threshold.setValueAtTime(-0.5, ctx.currentTime);
    peakLimiter.knee.setValueAtTime(0.0, ctx.currentTime);
    peakLimiter.ratio.setValueAtTime(20.0, ctx.currentTime);
    peakLimiter.attack.setValueAtTime(0.002, ctx.currentTime);
    peakLimiter.release.setValueAtTime(0.05, ctx.currentTime);

    // 4. Wire Audio Pipeline: source -> preampGain -> analyser -> peakLimiter -> destination
    source.connect(preampGain);
    preampGain.connect(analyser);
    analyser.connect(peakLimiter);
    peakLimiter.connect(ctx.destination);

    activeChain = {
      context: ctx,
      source,
      preampGain,
      analyser,
      peakLimiter,
    };
    window.__MUSICFY_EFFECTS_CHAIN__ = activeChain;

    // Auto-resume context on physical user interaction
    const unlockAudioContext = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudioContext, { once: true, passive: true });
    window.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudioContext, { once: true, passive: true });

    return activeChain;
  } catch (err) {
    console.warn('[WebAudio] Failed to initialize AudioEffects chain:', err);
    return null;
  }
}

/**
 * Resumes AudioContext safely within user gesture callstack.
 */
export function resumeAudioContextSafely(): void {
  if (typeof window === 'undefined') return;
  const chain = activeChain || window.__MUSICFY_EFFECTS_CHAIN__;
  if (chain && chain.context.state === 'suspended') {
    chain.context.resume().catch(() => {});
  }
}

/**
 * Smoothly fades out audio volume using Web Audio API GainNode linear/exponential ramp.
 * Perfect for Sleep Timer fade-out without causing audio clicks or pops.
 */
export async function fadeOutWebAudioGain(durationSeconds: number = 5): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const chain = activeChain || window.__MUSICFY_EFFECTS_CHAIN__;
    if (chain && chain.context && chain.preampGain) {
      const ctx = chain.context;
      const gainNode = chain.preampGain;
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);
    }
  } catch {}
}

/**
 * Restores Web Audio API GainNode volume back to nominal 1.0 (after sleep timer stops or resumes).
 */
export function restoreWebAudioGain(): void {
  if (typeof window === 'undefined') return;
  try {
    const chain = activeChain || window.__MUSICFY_EFFECTS_CHAIN__;
    if (chain && chain.context && chain.preampGain) {
      const ctx = chain.context;
      const gainNode = chain.preampGain;
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(1.0, now);
    }
  } catch {}
}

/**
 * Retrieves the current peak limiter gain reduction in decibels (Anti-Clipping telemetry).
 */
export function getPeakLimiterReduction(): number {
  if (typeof window === 'undefined') return 0;
  const chain = activeChain || window.__MUSICFY_EFFECTS_CHAIN__;
  if (chain?.peakLimiter) {
    return chain.peakLimiter.reduction;
  }
  return 0;
}

/**
 * Retrieves the real-time frequency data array from AnalyserNode.
 * Uses a cached buffer to prevent Garbage Collection allocation thrashing at 60fps.
 */
export function getRealtimeFrequencyData(): Uint8Array<ArrayBuffer> | null {
  const chain = activeChain || window.__MUSICFY_EFFECTS_CHAIN__;
  if (!chain || !chain.analyser) return null;

  if (!sharedFrequencyBuffer || sharedFrequencyBuffer.length !== chain.analyser.frequencyBinCount) {
    const rawBuffer = new ArrayBuffer(chain.analyser.frequencyBinCount);
    sharedFrequencyBuffer = new Uint8Array(rawBuffer);
  }

  chain.analyser.getByteFrequencyData(sharedFrequencyBuffer as any);
  return sharedFrequencyBuffer;
}
