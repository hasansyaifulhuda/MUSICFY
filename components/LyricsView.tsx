'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
  Mic2,
  Disc3,
  Radio,
  RotateCcw,
  Loader2,
  Music,
  MicOff,
} from 'lucide-react';
import { cn, getHighResImage } from '@/lib/utils';
import { findActiveLyricIndex, normalizeLyrics, LyricLine } from '@/lib/performance';
import { getPersistentAudioElement } from '@/lib/audioElement';
import { usePlayerStore } from '@/lib/store';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';

export type { LyricLine };

interface LyricsViewProps {
  lyrics?: any[];
  currentTime?: number;
  onSeek: (time: number) => void;
  isLoading?: boolean;
  isSynced?: boolean;
  searchPass?: number;
}

export type LyricPosition = 'active' | 'prev' | 'prev-distant' | 'next' | 'next-distant';

export function getLyricPosition(idx: number, activeIndex: number): LyricPosition {
  if (activeIndex < 0) {
    return idx === 0 ? 'next' : 'next-distant';
  }
  if (idx === activeIndex) return 'active';
  if (idx === activeIndex - 1) return 'prev';
  if (idx < activeIndex - 1) return 'prev-distant';
  if (idx === activeIndex + 1) return 'next';
  return 'next-distant';
}

/**
 * Safely formats translated lyric line wrapped in parentheses.
 * Ensures outer parentheses from AI responses are not duplicated.
 * Returns empty string if text is empty, preventing empty "()" brackets.
 */
function formatTranslation(text?: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/^[\(\（\[\{]\s*|\s*[\)\）\]\}]$/g, '').trim();
  if (!cleaned) return '';
  return `(${cleaned})`;
}

interface LyricRowProps {
  idx: number;
  text: string;
  time: number;
  endTime?: number;
  isActive: boolean;
  position: LyricPosition;
  videoId?: string;
  translation?: string;
  romaji?: string;
  hasTrans?: boolean;
  onSeek: (time: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

/**
 * Isolated, high-performance Lyric Row component with Spotify Premium white text hierarchy.
 * Custom comparator ensures ONLY the row becoming active or inactive re-renders.
 */
const LyricRow = memo(
  function LyricRow({
    idx,
    text,
    time,
    isActive,
    position,
    translation,
    romaji,
    hasTrans,
    onSeek,
    setRef,
  }: LyricRowProps) {
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (e.button === 0) onSeek(time);
    }, [onSeek, time]);

    const handleClick = useCallback(() => {
      onSeek(time);
    }, [onSeek, time]);

    const isRowActive = position === 'active';
    const formattedTrans = hasTrans ? formatTranslation(translation) : '';
    const showTranslation = Boolean(formattedTrans);

    const opacity =
      isRowActive ? 1.0 : position === 'prev' ? 0.35 : position === 'next' ? 0.45 : 0.18;
    const transform =
      isRowActive
        ? 'translate3d(0, 0, 0) scale(1.04)'
        : position === 'prev' || position === 'next'
        ? 'translate3d(0, 0, 0) scale(1.0)'
        : 'translate3d(0, 0, 0) scale(0.98)';

    return (
      <div
        ref={setRef}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Lirik baris ${idx + 1}: ${text}`}
        style={{
          touchAction: 'manipulation',
          opacity,
          transform,
          transition: 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.28s ease',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
        className={cn(
          'musicfy-lyric-item py-3 px-4 cursor-pointer select-none focus:outline-none origin-center text-center rounded-2xl transform-gpu',
          isRowActive && 'lyric-active drop-shadow-[0_2px_14px_rgba(255,255,255,0.22)]',
          position === 'prev' && 'lyric-prev hover:opacity-85',
          position === 'prev-distant' && 'lyric-distant hover:opacity-85',
          position === 'next' && 'lyric-next hover:opacity-85',
          position === 'next-distant' && 'lyric-distant hover:opacity-85'
        )}
      >
        {/* 1. Lirik Asli: Pure White #FFFFFF, Weight 800/700, Largest font */}
        <p
          className={cn(
            'musicfy-lyric-original leading-snug tracking-tight text-center select-none',
            'text-xl sm:text-2xl md:text-3xl',
            isRowActive ? 'font-extrabold text-white' : 'font-bold'
          )}
          style={{
            color: '#FFFFFF',
            WebkitTextFillColor: '#FFFFFF',
            fontWeight: isRowActive ? 800 : 700,
          }}
        >
          {text}
        </p>

        {/* 2. Lirik Terjemahan & Romaji: Spacing 8-12px (mt-2 sm:mt-2.5), Silver-Gray #A1A1AA, 65-75% font size (text-sm sm:text-base md:text-lg), (Terjemahan) */}
        {hasTrans && (
          <div className="mt-2 sm:mt-2.5 flex flex-col items-center gap-0.5 animate-in fade-in duration-200">
            {romaji && (
              <p
                className="text-xs sm:text-sm font-medium tracking-wide select-none"
                style={{
                  color: '#A1A1AA',
                  WebkitTextFillColor: '#A1A1AA',
                  opacity: isRowActive ? 0.75 : 0.45,
                }}
              >
                {romaji}
              </p>
            )}
            {showTranslation && (
              <p
                className={cn(
                  'musicfy-lyric-translation text-center select-none leading-relaxed tracking-normal',
                  'text-sm sm:text-base md:text-lg',
                  isRowActive ? 'font-semibold' : 'font-medium'
                )}
                style={{
                  color: '#A1A1AA',
                  WebkitTextFillColor: '#A1A1AA',
                  fontWeight: isRowActive ? 600 : 500,
                  opacity: isRowActive ? 0.9 : 0.65,
                }}
              >
                {formattedTrans}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.idx === next.idx &&
      prev.text === next.text &&
      prev.time === next.time &&
      prev.isActive === next.isActive &&
      prev.position === next.position &&
      prev.hasTrans === next.hasTrans &&
      prev.translation === next.translation &&
      prev.romaji === next.romaji
    );
  }
);

export const LyricsView = memo(function LyricsView({
  lyrics = [],
  currentTime,
  onSeek,
  isLoading = false,
  isSynced = false,
  searchPass,
}: LyricsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 1. Performance-First State & Ref Management:
  // Active lyric index is mirrored in a ref to avoid setState calls on every raw audio tick!
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const isFirstScrollRef = useRef<boolean>(true);

  // User scrolling safeguards
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const [showSyncButton, setShowSyncButton] = useState<boolean>(false);

  const duration = usePlayerStore((state) => state.duration);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const currentVideoId = currentTrack?.videoId;

  // Retrieve per-track lyric offset from persistent store
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(currentVideoId));

  // Dedicated RAF handle for smooth-scrolling animations (prevents animation stacking/competing)
  const scrollRafRef = useRef<number | null>(null);

  // Cancel any running RAF scroll animation cleanly
  const cancelCurrentScroll = useCallback(() => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  // Custom Cancelable Smooth-Scroll Helper using Ease-Out-Cubic interpolation
  const smoothScrollToTarget = useCallback(
    (container: HTMLElement, targetY: number, durationMs = 380) => {
      cancelCurrentScroll();

      const startY = container.scrollTop;
      const delta = targetY - startY;

      // If already at or very close to target, snap directly
      if (Math.abs(delta) < 2) {
        container.scrollTop = targetY;
        return;
      }

      const startTime = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeOutCubic(progress);
        container.scrollTop = startY + delta * eased;

        if (progress < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          container.scrollTop = targetY;
          scrollRafRef.current = null;
        }
      };

      scrollRafRef.current = requestAnimationFrame(step);
    },
    [cancelCurrentScroll]
  );

  // Combine prop lyrics and normalize timestamps: seconds vs milliseconds, strings, and chronological sorting
  const normalizedLyrics = useMemo(() => {
    return normalizeLyrics(lyrics, duration);
  }, [lyrics, duration]);

  // Keep lineRefs array in sync with lyrics length
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, normalizedLyrics.length);
  }, [normalizedLyrics.length]);

  // Reset active index when a new song or set of lyrics is loaded
  useEffect(() => {
    activeIndexRef.current = -1;
    setActiveIndex(-1);
    isFirstScrollRef.current = true;
    setShowSyncButton(false);
    isUserScrollingRef.current = false;
  }, [normalizedLyrics]);

  // 4. Real-Time 60fps RAF Audio Event Listener:
  useEffect(() => {
    if (!isSynced || normalizedLyrics.length === 0) return;

    const audio = getPersistentAudioElement();
    if (!audio) return;

    let rafId: number | null = null;

    const checkAndUpdateLyric = () => {
      const curTime = audio.currentTime;
      const effectiveTime = Math.max(0, curTime + (lyricsOffset || 0));
      const newIndex = findActiveLyricIndex(normalizedLyrics, effectiveTime);

      // Throttling: ONLY trigger React state update if the line index actually changed
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }

      if (!audio.paused && !audio.ended) {
        rafId = requestAnimationFrame(checkAndUpdateLyric);
      }
    };

    const handlePlay = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkAndUpdateLyric);
    };

    const handlePause = () => {
      if (rafId) cancelAnimationFrame(rafId);
      checkAndUpdateLyric();
    };

    const handleImmediate = () => {
      checkAndUpdateLyric();
    };

    // Initial evaluation
    checkAndUpdateLyric();
    if (!audio.paused) {
      rafId = requestAnimationFrame(checkAndUpdateLyric);
    }

    audio.addEventListener('play', handlePlay, { passive: true });
    audio.addEventListener('pause', handlePause, { passive: true });
    audio.addEventListener('timeupdate', handleImmediate, { passive: true });
    audio.addEventListener('seeked', handleImmediate, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleImmediate);
      audio.removeEventListener('seeked', handleImmediate);
    };
  }, [isSynced, normalizedLyrics, lyricsOffset]);

  // 5. Synchronize when external scrubber progress changes (seeking via progress bar)
  useEffect(() => {
    if (!isSynced || normalizedLyrics.length === 0) return;
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      const effectiveTime = Math.max(0, currentTime + (lyricsOffset || 0));
      const newIndex = findActiveLyricIndex(normalizedLyrics, effectiveTime);
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    }
  }, [currentTime, isSynced, normalizedLyrics, lyricsOffset]);

  // 6. Smooth Scroll & Auto-Center:
  // Automatically scrolls the active lyric line to vertical center using cancelable RAF interpolation
  const scrollToActiveLine = useCallback(
    (index: number, immediate = false) => {
      if (index < 0 || isUserScrollingRef.current) return;
      const container = containerRef.current;
      const targetEl = lineRefs.current[index];
      if (!container || !targetEl) return;

      const targetScrollTop = targetEl.offsetTop - container.clientHeight / 2 + targetEl.clientHeight / 2;
      const clampedTarget = Math.max(0, targetScrollTop);

      if (immediate) {
        cancelCurrentScroll();
        container.scrollTop = clampedTarget;
      } else {
        if (typeof container.scrollTo === 'function') {
          cancelCurrentScroll();
          container.scrollTo({
            top: clampedTarget,
            behavior: 'smooth',
          });
        } else {
          smoothScrollToTarget(container, clampedTarget, 280);
        }
      }
    },
    [cancelCurrentScroll, smoothScrollToTarget]
  );

  useEffect(() => {
    if (!isSynced || isUserScrollingRef.current || activeIndex < 0) return;

    const isFirst = isFirstScrollRef.current;
    if (isFirst) {
      isFirstScrollRef.current = false;
      scrollToActiveLine(activeIndex, true);
    } else {
      scrollToActiveLine(activeIndex, false);
    }
  }, [activeIndex, isSynced, scrollToActiveLine]);

  // 7. User Touch / Scroll Handling: temporarily pauses auto-scroll & displays floating re-sync pill
  const handleUserInteraction = useCallback(() => {
    cancelCurrentScroll();
    isUserScrollingRef.current = true;
    setShowSyncButton(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    // Auto-resume smooth tracking after 3.2 seconds of user idle
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      setShowSyncButton(false);
      if (activeIndexRef.current >= 0) {
        scrollToActiveLine(activeIndexRef.current, false);
      }
    }, 3200);
  }, [cancelCurrentScroll, scrollToActiveLine]);

  // Manual re-sync to current playback
  const handleManualSync = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    isUserScrollingRef.current = false;
    setShowSyncButton(false);
    if (activeIndexRef.current >= 0) {
      scrollToActiveLine(activeIndexRef.current, false);
    }
  }, [scrollToActiveLine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelCurrentScroll();
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [cancelCurrentScroll]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/60 py-28 select-none animate-in fade-in duration-200">
        <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
        <p className="text-sm font-semibold tracking-wide text-white/80 animate-pulse text-center px-4">
          {searchPass && searchPass > 1
            ? `Mencari & menyinkronkan lirik otomatis (Percobaan ${searchPass}/5)...`
            : 'Mencari & menyiapkan lirik otomatis...'}
        </p>
      </div>
    );
  }

  // Clean, aesthetic empty & long-audio fallback state
  if (!normalizedLyrics || normalizedLyrics.length === 0) {
    const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const currentTrack = usePlayerStore.getState().currentTrack;
    const currentTrackDuration = currentTrack?.duration || 0;
    const isLongAudio =
      currentTrackDuration > 600 ||
      /(?:full\s*album|mix|nonstop|1\s*hour|1\s*jam|2\s*hour|live\s*set|compilation|dj\s*set|mashup)/i.test(
        currentTrack?.name || ''
      );
    const coverUrl = getHighResImage(currentTrack?.thumbnails?.[currentTrack.thumbnails.length - 1]?.url, 600);
    const artistName =
      typeof currentTrack?.artist === 'string'
        ? currentTrack.artist
        : Array.isArray(currentTrack?.artist)
        ? currentTrack.artist.map((a: any) => a?.name || a).join(', ')
        : (currentTrack?.artist as any)?.name || 'Artis';

    return (
      <div className="flex flex-col items-center justify-center h-full text-white/60 space-y-5 py-12 sm:py-20 select-none text-center px-4 max-w-md mx-auto animate-in fade-in duration-300">
        {/* Aesthetic Cover Art Thumbnail Card with Ambient Depth */}
        <div className="relative group">
          <div className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-2xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/15 bg-black/40">
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={currentTrack?.name || 'Cover Art'}
                fill
                sizes="(max-width: 640px) 160px, 208px"
                priority
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <Music className="w-16 h-16 opacity-40" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
          </div>
          <div className="absolute -inset-2 bg-white/5 rounded-3xl blur-xl -z-10" />
        </div>

        {/* Track Title & Artist */}
        <div className="space-y-1 max-w-sm px-2">
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight line-clamp-1">
            {currentTrack?.name || 'Trek Audio'}
          </h3>
          <p className="text-xs sm:text-sm text-white/50 line-clamp-1">{artistName}</p>
        </div>

        {/* Graceful Status Message */}
        <div className="space-y-1.5 max-w-sm">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/80">
            {isLongAudio ? (
              <>
                <Disc3 className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span>Audio Durasi Panjang</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-white/50" />
                <span>Lirik Tidak Tersedia</span>
              </>
            )}
          </div>

          <p className="text-xs text-white/50 leading-relaxed px-3">
            {isLongAudio
              ? 'Lirik tidak tersedia untuk trek/album durasi panjang ini. Nikmati alunan musik secara penuh dengan visual cover art.'
              : isDeviceOffline
              ? 'Lirik lagu ini belum diunduh ke penyimpanan offline. Sambungkan internet untuk memuat lirik otomatis.'
              : 'Lirik belum ditemukan di database publik untuk lagu ini.'}
          </p>
        </div>

        {/* Retry button ONLY for normal-length songs when online */}
        {!isLongAudio && !isDeviceOffline && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('musicfy:reload-lyrics', { detail: { force: true } }));
                window.dispatchEvent(new CustomEvent('pmusic:reload-lyrics', { detail: { force: true } }));
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 mt-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold rounded-full transition-all border border-white/15 cursor-pointer shadow-lg"
            title="Cari ulang lirik lagu ini"
          >
            <RotateCcw className="w-3.5 h-3.5 text-white/70" />
            <span>Coba Cari Ulang Lirik</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden select-none">
      {/* Main Boxless Karaoke Lyrics Container with Smooth Vertical Fade Mask */}
      <div
        ref={containerRef}
        onTouchStart={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onWheel={handleUserInteraction}
        className="flex-1 overflow-y-auto no-scrollbar py-[35vh] px-4 sm:px-8 max-w-3xl mx-auto w-full text-center space-y-4 md:space-y-5 lyrics-mask gpu-accelerated relative"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Intro Instrumental Indicator (Synced Mode Only) */}
        {isSynced && activeIndex === -1 && (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/40 animate-pulse text-center">
            <Disc3 className="w-6 h-6 animate-spin text-white/40" style={{ animationDuration: '4s' }} />
            <span className="text-xs font-semibold tracking-wider uppercase text-white/50">
              Musik Mengalun • Intro
            </span>
          </div>
        )}

        {/* Clean, True Karaoke Lyric Lines or High-Readability Plain Text */}
        {normalizedLyrics.map((line, idx) => {
          const textTrimmed = (line.text || '').trim();
          const isSectionHeader = /^\[.*?\]$/.test(textTrimmed);

          if (isSectionHeader) {
            return (
              <div key={`lyric-header-${idx}`} className="pt-3 pb-0.5 text-center">
                <span
                  className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase"
                  style={{
                    color: '#A1A1AA',
                    WebkitTextFillColor: '#A1A1AA',
                    opacity: 0.5,
                  }}
                >
                  {textTrimmed.replace(/[\[\]]/g, '')}
                </span>
              </div>
            );
          }

          if (!isSynced) {
            return (
              <div
                key={`lyric-plain-${idx}`}
                className="py-2 px-3 select-text text-center leading-relaxed"
              >
                {/* 1. Lirik Asli: Pure White #FFFFFF, Bold, Largest font */}
                <p
                  className="text-center select-none text-white font-bold text-lg sm:text-xl md:text-2xl leading-snug tracking-tight"
                  style={{
                    color: '#FFFFFF',
                    WebkitTextFillColor: '#FFFFFF',
                    fontWeight: 700,
                    opacity: 0.95,
                  }}
                >
                  {line.text}
                </p>
              </div>
            );
          }

          const isActive = idx === activeIndex;
          const position = getLyricPosition(idx, activeIndex);

          return (
            <LyricRow
              key={`lyric-${idx}`}
              idx={idx}
              text={line.text}
              time={line.time}
              isActive={isActive}
              position={position}
              videoId={currentVideoId}
              hasTrans={false}
              onSeek={onSeek}
              setRef={(el) => {
                lineRefs.current[idx] = el;
              }}
            />
          );
        })}
      </div>

      {/* Floating Re-Sync Pill Button (Visible when user scrolls away from active line) */}
      {showSyncButton && activeIndex >= 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={handleManualSync}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Kembali ke lirik aktif</span>
          </button>
        </div>
      )}
    </div>
  );
});
