'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePlayerStore, Track } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { LyricLine, findActiveLyricIndex, normalizeLyrics } from '@/lib/performance';
import { getHighResImage, cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Minimize2,
  Minimize,
  Maximize2,
  ChevronDown,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  Radio,
  Disc3,
  Loader2,
  RotateCcw,
  Languages,
  Music,
  MicOff,
  SlidersHorizontal,
  Check,
  FileText,
} from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '@/lib/db';
import { getFastCachedLyrics } from '@/lib/lyricsCache';
import { getPersistentAudioElement } from '@/lib/audioElement';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { toast } from '@/lib/toast';
import { isNativeAndroid } from '@/lib/nativeAudioBridge';

export interface FullScreenLyricsProps {
  lyrics: LyricLine[];
  onClose: () => void;
  onSeek: (time: number) => void;
  isSynced: boolean;
  isLoading?: boolean;
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

function formatTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Isolated Mini-Component for Playback Time Display.
 * Subscribes to progress independently so the entire FullScreenLyrics
 * does NOT re-render on every raw audio tick!
 */
const LyricsTimeDisplay = memo(function LyricsTimeDisplay() {
  const currentTime = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/50 font-mono pl-2 border-l border-white/10">
      <span>{formatTime(currentTime)}</span>
      <span>/</span>
      <span>{formatTime(duration)}</span>
    </div>
  );
});

interface FullScreenLyricRowProps {
  idx: number;
  text: string;
  time: number;
  position: LyricPosition;
  isActive: boolean;
  isSectionHeader: boolean;
  translation?: string;
  romaji?: string;
  hasTrans: boolean;
  translationMode: 'original' | 'translated' | 'both';
  isSynced: boolean;
  onSeek: (time: number, idx?: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

/**
 * Safely formats translated lyric line.
 * For 'both' mode, wraps in subtle parentheses.
 * For 'translated' mode, renders cleanly without wrapping parentheses.
 */
function formatTranslation(text?: string, wrapInParens: boolean = true): string {
  if (!text) return '';
  let cleaned = text.trim();
  if (!cleaned) return '';
  // Strip any wrapping parentheses or brackets
  while (
    (cleaned.startsWith('(') && cleaned.endsWith(')')) ||
    (cleaned.startsWith('（') && cleaned.endsWith('）')) ||
    (cleaned.startsWith('[') && cleaned.endsWith(']'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (!cleaned) return '';
  return wrapInParens ? `(${cleaned})` : cleaned;
}

/**
 * High-performance, isolated Lyric Row component.
 * Uses GPU-accelerated opacity & transform scale rather than font-size animation
 * to guarantee zero layout thrashing / browser reflow during playback.
 */
const FullScreenLyricRow = memo(
  function FullScreenLyricRow({
    idx,
    text,
    time,
    position,
    isActive,
    isSectionHeader,
    translation,
    romaji,
    hasTrans,
    translationMode,
    isSynced,
    onSeek,
    setRef,
  }: FullScreenLyricRowProps) {
    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.button === 0) onSeek(time, idx);
      },
      [onSeek, time, idx]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onSeek(time, idx);
      },
      [onSeek, time, idx]
    );

    if (isSectionHeader) {
      return (
        <div key={`fs-header-${idx}`} className="pt-5 pb-2 text-center select-none">
          <span
            className="text-xs sm:text-sm font-semibold tracking-widest uppercase"
            style={{
              color: '#A1A1AA',
              WebkitTextFillColor: '#A1A1AA',
              opacity: 0.5,
            }}
          >
            {text.replace(/[\[\]]/g, '')}
          </span>
        </div>
      );
    }

    const showBoth = translationMode === 'both' && hasTrans;
    const showTranslatedOnly = translationMode === 'translated';
    const primaryDisplayText = showTranslatedOnly
      ? (translation && translation.trim() ? formatTranslation(translation, false) : text)
      : text;
    const secondaryDisplayText = showBoth ? formatTranslation(translation, true) : '';

    if (!isSynced) {
      return (
        <div
          ref={setRef}
          className="py-3 px-4 select-text leading-relaxed text-center"
        >
          {/* Primary Lyric: Pure White, Bold, Largest font */}
          <p
            className="musicfy-lyric-original text-center select-none font-bold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white tracking-tight leading-snug"
            style={{
              color: '#FFFFFF',
              WebkitTextFillColor: '#FFFFFF',
              fontWeight: 700,
              opacity: 0.95,
            }}
          >
            {primaryDisplayText}
          </p>
          {(showBoth || (showTranslatedOnly && romaji)) && (
            <div className="mt-1.5 sm:mt-2 flex flex-col items-center gap-1 animate-in fade-in duration-200">
              {romaji && (
                <p
                  className="text-xs sm:text-sm font-medium tracking-wide select-none"
                  style={{
                    color: '#A1A1AA',
                    WebkitTextFillColor: '#A1A1AA',
                    opacity: 0.7,
                  }}
                >
                  {romaji}
                </p>
              )}
              {secondaryDisplayText && (
                <p
                  className="musicfy-lyric-translation text-sm sm:text-base md:text-xl lg:text-2xl font-medium tracking-normal text-center select-none leading-relaxed"
                  style={{
                    color: '#FFFFFF',
                    WebkitTextFillColor: '#FFFFFF',
                    fontWeight: 500,
                    opacity: 0.75,
                  }}
                >
                  {secondaryDisplayText}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    const isRowActive = position === 'active';
    const opacity =
      isRowActive ? 1.0 : position === 'next' ? 0.55 : position === 'prev' ? 0.45 : 0.22;
    const transform =
      isRowActive
        ? 'translate3d(0, 0, 0) scale(1.03)'
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
        aria-label={`Lirik baris ${idx + 1}: ${primaryDisplayText}`}
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
          'musicfy-lyric-item py-3.5 px-4 cursor-pointer select-none origin-center text-center rounded-2xl transform-gpu focus:outline-none',
          isRowActive && 'lyric-active drop-shadow-[0_4px_24px_rgba(255,255,255,0.22)]',
          position === 'prev' && 'lyric-prev hover:opacity-85',
          position === 'prev-distant' && 'lyric-distant hover:opacity-85',
          position === 'next' && 'lyric-next hover:opacity-85',
          position === 'next-distant' && 'lyric-distant hover:opacity-85'
        )}
      >
        {/* 1. Lirik Utama: Pure White #FFFFFF, Weight 800/700, Largest font */}
        <p
          className={cn(
            'musicfy-lyric-original leading-tight tracking-tight text-center select-none',
            'text-2xl sm:text-3xl md:text-4xl lg:text-5xl',
            isRowActive ? 'font-extrabold text-white' : 'font-bold'
          )}
          style={{
            color: '#FFFFFF',
            WebkitTextFillColor: '#FFFFFF',
            fontWeight: isRowActive ? 800 : 700,
          }}
        >
          {primaryDisplayText}
        </p>

        {/* 2. Lirik Terjemahan & Romaji: Spacing mt-1.5 sm:mt-2, Pure White with lower opacity, 60-70% font size */}
        {(showBoth || (showTranslatedOnly && romaji)) && (
          <div className="mt-1.5 sm:mt-2 flex flex-col items-center gap-1 animate-in fade-in duration-200">
            {romaji && (
              <p
                className="font-medium tracking-wide text-xs sm:text-sm md:text-base select-none"
                style={{
                  color: '#A1A1AA',
                  WebkitTextFillColor: '#A1A1AA',
                  opacity: isRowActive ? 0.75 : 0.45,
                }}
              >
                {romaji}
              </p>
            )}
            {secondaryDisplayText && (
              <p
                className={cn(
                  'musicfy-lyric-translation text-center select-none leading-relaxed tracking-normal',
                  'text-base sm:text-xl md:text-2xl lg:text-3xl',
                  isRowActive ? 'font-medium' : 'font-normal'
                )}
                style={{
                  color: '#FFFFFF',
                  WebkitTextFillColor: '#FFFFFF',
                  fontWeight: isRowActive ? 500 : 400,
                  opacity: isRowActive ? 0.75 : 0.50,
                }}
              >
                {secondaryDisplayText}
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
      prev.translationMode === next.translationMode &&
      prev.translation === next.translation &&
      prev.romaji === next.romaji &&
      prev.isSynced === next.isSynced
    );
  }
);

/**
 * Enterprise Immersive Full-Screen Karaoke Lyrics Experience
 *
 * Guarantees:
 * 1. 100% full-screen immersive canvas with dynamic ambient color gradients.
 * 2. High-performance non-blocking rendering (only active lines re-render).
 * 3. Cancelable RAF smooth vertical scrolling with viewport auto-centering (Spotify/Apple Music feel).
 * 4. Zero layout thrashing: uses constant typography base with GPU-accelerated opacity & scale.
 * 5. Interactive click-to-seek, AI translation toggle, and manual scroll re-sync pill.
 * 6. Floating minimal playback controller island.
 * 7. Keyboard accessibility: Escape to exit, Spacebar to toggle play/pause.
 */
export const FullScreenLyrics = memo(function FullScreenLyrics({
  lyrics,
  onClose,
  onSeek,
  isSynced,
  isLoading = false,
}: FullScreenLyricsProps) {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const dominantColor = usePlayerStore((state) => state.dominantColor);
  const storeProgress = usePlayerStore((state) => state.progress);

  const { togglePlay, playNext, playPrev, isLiked: checkLiked, toggleLike } = useMusic();
  const isLiked = currentTrack ? checkLiked(currentTrack.videoId) : false;

  const currentVideoId = currentTrack?.videoId;

  // Synchronization tracking refs (Crucial for Native ExoPlayer on Android APK & Web HTML5 Audio)
  const lastProgressRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number>(performance.now());
  const isNativeRef = useRef<boolean>(false);

  useEffect(() => {
    isNativeRef.current = isNativeAndroid();
  }, []);

  // Retrieve per-track lyric offset from persistent store
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(currentVideoId));
  const adjustOffset = useLyricsOffsetStore((state) => state.adjustOffset);
  const resetOffset = useLyricsOffsetStore((state) => state.resetOffset);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const isFirstScrollRef = useRef<boolean>(true);
  const [showSyncButton, setShowSyncButton] = useState<boolean>(false);

  // Dedicated RAF handle for smooth-scrolling animations (prevents animation stacking/competing)
  const scrollRafRef = useRef<number | null>(null);

  // Translation mode: 'original' (default) | 'both' (original + translated) | 'translated' (translated primary)
  const [translationMode, setTranslationMode] = useState<'original' | 'both' | 'translated'>('original');
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState<boolean>(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const isTranslationEnabled = translationMode !== 'original';

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!isModeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeDropdownOpen]);

  // Reset active index & translation state when track changes
  useEffect(() => {
    activeIndexRef.current = -1;
    setActiveIndex(-1);
    lastProgressRef.current = 0;
    lastProgressTimeRef.current = performance.now();
    isFirstScrollRef.current = true;
    setShowSyncButton(false);
    isUserScrollingRef.current = false;
    setTranslationMode('original');
    setShowCalibration(false);
    setIsModeDropdownOpen(false);
    setTranslations(new Map());
    setTranslationsByIndex(new Map());
    setIsTranslating(false);
  }, [currentVideoId]);

  // Browser Fullscreen API integration
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleNativeFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          (document.documentElement as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch {
      // Ignored if user agent restricts fullscreen
    }
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      try {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } catch {
        // Ignored
      }
    }
    onClose();
  }, [onClose]);

  // Keyboard shortcut listener (ESC to exit, Space to toggle playback)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, togglePlay]);

  // Fallback to offline/cached lyrics if prop is momentarily empty
  const [localLyrics, setLocalLyrics] = useState<LyricLine[] | null>(null);
  const [localIsSynced, setLocalIsSynced] = useState<boolean>(false);

  useEffect(() => {
    if ((!lyrics || lyrics.length === 0) && currentVideoId) {
      // 1. Check synchronous fast cache (Memory + LocalStorage)
      const fast = getFastCachedLyrics(currentVideoId);
      if (fast && fast.lyrics.length > 0) {
        setLocalLyrics(fast.lyrics);
        setLocalIsSynced(fast.synced);
        return;
      }

      let isMounted = true;
      db.getOfflineTrack(currentVideoId)
        .then((off) => {
          if (isMounted && off?.lyrics && off.lyrics.length > 0) {
            setLocalLyrics(off.lyrics);
            setLocalIsSynced(Boolean(off.isSyncedLyrics ?? off.synced));
            return;
          }
          db.getMetadataCache<{ lyrics: LyricLine[]; synced: boolean }>(`lyrics:${currentVideoId}`)
            .then((c) => {
              if (isMounted && c?.lyrics && c.lyrics.length > 0) {
                setLocalLyrics(c.lyrics);
                setLocalIsSynced(Boolean(c.synced));
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    } else {
      setLocalLyrics(null);
    }
  }, [lyrics, currentVideoId]);

  const activeLyrics = useMemo(() => {
    return lyrics && lyrics.length > 0 ? lyrics : localLyrics || [];
  }, [lyrics, localLyrics]);

  const activeIsSynced = useMemo(() => {
    return lyrics && lyrics.length > 0 ? isSynced : localIsSynced;
  }, [lyrics, isSynced, localIsSynced]);

  const effectiveLyrics = useMemo(() => {
    if (!activeLyrics || activeLyrics.length === 0) return [];
    return normalizeLyrics(activeLyrics, duration);
  }, [activeLyrics, duration]);

  const effectiveIsSynced = activeIsSynced;

  // AI Lyrics Translation & Romaji State (Default: OFF / false to save bandwidth & compute)
  const [translations, setTranslations] = useState<Map<number, { translation?: string; romaji?: string }>>(
    new Map()
  );
  const [translationsByIndex, setTranslationsByIndex] = useState<Map<number, { translation?: string; romaji?: string }>>(
    new Map()
  );
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const failedTranslationsRef = useRef<Set<string>>(new Set());
  const inFlightTranslationsRef = useRef<Set<string>>(new Set());

  const applyTranslations = useCallback((list: any[], videoId?: string) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const timeMap = new Map<number, { translation?: string; romaji?: string }>();
    const indexMap = new Map<number, { translation?: string; romaji?: string }>();
    list.forEach((item: any, i: number) => {
      const entry = { translation: item.translation, romaji: item.romaji };
      if (typeof item.time === 'number') {
        timeMap.set(Math.round(item.time * 10) / 10, entry);
        timeMap.set(Math.round(item.time), entry);
      }
      indexMap.set(i, entry);
    });
    setTranslations(timeMap);
    setTranslationsByIndex(indexMap);

    if (videoId) {
      window.dispatchEvent(
        new CustomEvent('musicfy:lyrics-translated', {
          detail: { videoId, translations: list },
        })
      );
    }
  }, []);

  // Listen for broadcasted translation events
  useEffect(() => {
    const handleTranslatedEvent = (e: any) => {
      const detail = e.detail;
      if (detail && detail.videoId === currentVideoId && Array.isArray(detail.translations)) {
        applyTranslations(detail.translations);
      }
    };
    window.addEventListener('musicfy:lyrics-translated', handleTranslatedEvent);
    return () => window.removeEventListener('musicfy:lyrics-translated', handleTranslatedEvent);
  }, [currentVideoId, applyTranslations]);

  const handleSetTranslationMode = useCallback((mode: 'original' | 'both' | 'translated') => {
    if (mode !== 'original' && currentVideoId) {
      // Allow manual selection to retry translation even if it previously failed
      failedTranslationsRef.current.delete(currentVideoId);
    }
    setTranslationMode(mode);
  }, [currentVideoId]);

  // Zero-Bloat On-Demand Fetch: ONLY fetch translation & Romaji when explicitly enabled (isTranslationEnabled === true)
  useEffect(() => {
    if (!isTranslationEnabled || !currentVideoId || effectiveLyrics.length === 0) return;

    // Skip network request if translations are already stored in memory
    if (translations.size > 0 || translationsByIndex.size > 0) return;

    // Prevent duplicate in-flight requests for the same track
    if (inFlightTranslationsRef.current.has(currentVideoId)) return;

    // Prevent repeating requests if translation previously failed for this track
    if (failedTranslationsRef.current.has(currentVideoId)) {
      setTranslationMode('original');
      return;
    }

    let isMounted = true;
    setIsTranslating(true);
    const inFlightSet = inFlightTranslationsRef.current;
    inFlightSet.add(currentVideoId);

    const cleanup = () => {
      inFlightSet.delete(currentVideoId);
      if (isMounted) setIsTranslating(false);
    };

    fetch(`/api/lyrics/translate?id=${encodeURIComponent(currentVideoId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(async (resData) => {
        if (!isMounted) {
          cleanup();
          return;
        }

        const cachedList = resData?.data || resData?.result;
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          applyTranslations(cachedList, currentVideoId);
          cleanup();
          return;
        }

        // Cache miss: request AI translation via Gemini API
        try {
          const postRes = await fetch('/api/lyrics/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: currentVideoId,
              title: currentTrack?.name,
              artist: Array.isArray(currentTrack?.artist)
                ? currentTrack.artist
                    .map((a: any) => (typeof a === 'string' ? a : a?.name || ''))
                    .filter(Boolean)
                    .join(', ')
                : currentTrack?.artist?.name || 'Unknown Artist',
              lyrics: effectiveLyrics.slice(0, 100),
            }),
          });

          const postData = await postRes.json().catch(() => null);

          if (!isMounted) {
            cleanup();
            return;
          }

          if (postRes.ok && postData?.status) {
            const postList = postData?.data || postData?.result;
            if (Array.isArray(postList) && postList.length > 0) {
              applyTranslations(postList, currentVideoId);
              cleanup();
              return;
            }
          }

          // Handle failure: mark as failed, disable translation toggle, and alert user
          failedTranslationsRef.current.add(currentVideoId);
          setTranslationMode('original');
          cleanup();

          const errMsg =
            postData?.message ||
            (postRes.status === 503
              ? 'Layanan terjemahan Gemini sedang sibuk atau tidak dapat dijangkau (503). Silakan coba sesaat lagi.'
              : postRes.status === 401
              ? 'Layanan terjemahan AI memerlukan konfigurasi GEMINI_API_KEY pada server.'
              : 'Gagal menerjemahkan lirik.');
          toast.error(errMsg);
        } catch {
          if (!isMounted) {
            cleanup();
            return;
          }
          failedTranslationsRef.current.add(currentVideoId);
          setTranslationMode('original');
          cleanup();
          toast.error('Gagal terhubung ke layanan terjemahan lirik.');
        }
      })
      .catch(() => {
        if (!isMounted) {
          cleanup();
          return;
        }
        failedTranslationsRef.current.add(currentVideoId);
        setTranslationMode('original');
        cleanup();
      });

    return () => {
      isMounted = false;
      inFlightSet.delete(currentVideoId);
    };
  }, [
    isTranslationEnabled,
    currentVideoId,
    effectiveLyrics,
    currentTrack,
    applyTranslations,
    translations.size,
    translationsByIndex.size,
  ]);

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

  // Auto-scroll active line to vertical center
  const scrollToActiveLine = useCallback(
    (index: number, immediate = false) => {
      if (index < 0 || isUserScrollingRef.current) return;
      const container = containerRef.current;
      const activeEl = lineRefs.current[index];
      if (!container || !activeEl) return;

      // offsetTop is relative to the scroll container, avoiding getBoundingClientRect layout reflow!
      const targetScrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      const clampedTarget = Math.max(0, targetScrollTop);

      if (immediate) {
        cancelCurrentScroll();
        container.scrollTop = clampedTarget;
      } else {
        cancelCurrentScroll();
        try {
          container.scrollTo({
            top: clampedTarget,
            behavior: 'smooth',
          });
        } catch {
          smoothScrollToTarget(container, clampedTarget, 280);
        }
      }
    },
    [cancelCurrentScroll, smoothScrollToTarget]
  );

  // Synchronize native progress updates (from NativeAudioPlayer on Android APK or store ticks)
  useEffect(() => {
    lastProgressRef.current = storeProgress;
    lastProgressTimeRef.current = performance.now();
    const isNative = isNativeRef.current;
    const audio = isNative ? null : getPersistentAudioElement();
    const hasActiveAudio = Boolean(audio && audio.src && !audio.paused);

    if ((isNative || !hasActiveAudio) && effectiveIsSynced && effectiveLyrics && effectiveLyrics.length > 0) {
      const effectiveTime = Math.max(0, storeProgress + (lyricsOffset || 0));
      const newIndex = findActiveLyricIndex(effectiveLyrics, effectiveTime);
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    }
  }, [storeProgress, effectiveIsSynced, effectiveLyrics, lyricsOffset]);

  // Unified 60fps RAF Synchronization Engine (Cross-Platform: Web HTML5 Audio & Native Android ExoPlayer)
  useEffect(() => {
    if (!effectiveIsSynced || !effectiveLyrics || effectiveLyrics.length === 0) {
      return;
    }

    const isNative = isNativeAndroid();
    const audio = isNative ? null : getPersistentAudioElement();
    let rafId: number | null = null;

    const checkAndUpdateLyric = () => {
      let curTime = 0;
      if (isNative) {
        if (!isPlaying || isBuffering) {
          curTime = lastProgressRef.current;
        } else {
          const elapsed = (performance.now() - lastProgressTimeRef.current) / 1000;
          curTime = lastProgressRef.current + Math.max(0, elapsed);
        }
      } else {
        if (audio && audio.src && (!audio.paused || audio.seeking) && !isBuffering) {
          curTime = audio.currentTime;
        } else if (audio && audio.src) {
          curTime = audio.currentTime;
        } else {
          const elapsed = !isPlaying || isBuffering ? 0 : (performance.now() - lastProgressTimeRef.current) / 1000;
          curTime = lastProgressRef.current + Math.max(0, elapsed);
        }
      }

      const effectiveTime = Math.max(0, curTime + (lyricsOffset || 0));
      const newIndex = findActiveLyricIndex(effectiveLyrics, effectiveTime);

      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }

      if (isPlaying && !isBuffering) {
        rafId = requestAnimationFrame(checkAndUpdateLyric);
      }
    };

    // Run initial evaluation
    checkAndUpdateLyric();

    if (isPlaying && !isBuffering) {
      rafId = requestAnimationFrame(checkAndUpdateLyric);
    }

    if (!isNative && audio) {
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
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [effectiveIsSynced, effectiveLyrics, lyricsOffset, isPlaying, isBuffering]);

  // Immediate seek-to-lyric callback with instantaneous scroll snapping
  const handleSeekToLyric = useCallback(
    (time: number, index?: number) => {
      if (typeof index === 'number' && index >= 0) {
        activeIndexRef.current = index;
        setActiveIndex(index);
        lastProgressRef.current = time;
        lastProgressTimeRef.current = performance.now();
        scrollToActiveLine(index, true);
      }
      onSeek(time);
    },
    [onSeek, scrollToActiveLine]
  );

  // 2. Trigger auto-scroll on activeIndex change
  useEffect(() => {
    if (!effectiveIsSynced || isUserScrollingRef.current || activeIndex < 0) return;
    const isFirst = isFirstScrollRef.current;
    if (isFirst) {
      isFirstScrollRef.current = false;
      scrollToActiveLine(activeIndex, true);
    } else {
      scrollToActiveLine(activeIndex, false);
    }
  }, [activeIndex, effectiveIsSynced, scrollToActiveLine]);

  // 3. User interaction & manual re-sync handling
  const handleUserInteraction = useCallback(() => {
    cancelCurrentScroll();
    isUserScrollingRef.current = true;
    setShowSyncButton(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      setShowSyncButton(false);
      if (activeIndexRef.current >= 0) {
        scrollToActiveLine(activeIndexRef.current, false);
      }
    }, 3200);
  }, [cancelCurrentScroll, scrollToActiveLine]);

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
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [cancelCurrentScroll]);

  if (!currentTrack) return null;

  const thumbnail = getHighResImage(
    currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url,
    600
  );
  const artistName = Array.isArray(currentTrack.artist)
    ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
    : currentTrack.artist?.name || 'Unknown Artist';
  const trackDur = currentTrack.duration || 0;
  const isLongAudio =
    trackDur > 600 ||
    /(?:full\s*album|mix|nonstop|1\s*hour|1\s*jam|2\s*hour|live\s*set|compilation|dj\s*set|mashup)/i.test(
      currentTrack.name || ''
    );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] bg-[#070707] text-white flex flex-col overflow-hidden select-none w-full max-w-full"
    >
      {/* Ambient Dynamic Glow Orbs & Artwork Blur Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        {thumbnail && (
          <div className="absolute inset-0 -z-20 overflow-hidden">
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="100vw"
              priority
              className="object-cover blur-[100px] md:blur-[140px] scale-125 opacity-30 transform-gpu"
            />
          </div>
        )}
        <div
          className="absolute -top-[25%] -left-[10%] w-[70vw] h-[70vw] max-w-[800px] max-h-[800px] rounded-full opacity-35 blur-[120px] transition-all duration-1000"
          style={{
            backgroundColor: dominantColor || '#1e293b',
          }}
        />
        <div
          className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full opacity-20 blur-[140px] transition-all duration-1000"
          style={{
            backgroundColor: dominantColor || '#0f172a',
          }}
        />
        <div className="absolute inset-0 bg-black/65 backdrop-blur-3xl" />
      </div>

      {/* TOP HEADER - Slender single-row layout saving maximum vertical space */}
      <header className="relative z-20 w-full border-b border-white/5 bg-black/40 backdrop-blur-md pt-[max(env(safe-area-inset-top,0px),0.5rem)] pb-2 px-3 sm:px-6 md:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-3 w-full h-10 sm:h-11">
          {/* Left: Dismiss Button + Artwork + Track Info */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleClose();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Kembali"
              title="Kembali (Esc)"
            >
              <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden shrink-0 shadow-md border border-white/10">
              <Image src={thumbnail} alt={currentTrack.name} fill sizes="36px" priority className="object-cover" />
            </div>
            <div className="min-w-0 flex-1 pr-1">
              <h2 className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">
                {currentTrack.name}
              </h2>
              <p className="text-[10px] sm:text-xs text-white/60 truncate">{artistName}</p>
            </div>
          </div>

          {/* Right: Mode Dropdown + Calibration + Fullscreen + Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Dynamic Lyrics Mode Selector Dropdown */}
            {activeLyrics && activeLyrics.length > 0 && (
              <div className="relative" ref={modeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsModeDropdownOpen((prev) => !prev)}
                  className={cn(
                    'flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-full text-xs font-semibold transition-all cursor-pointer border shadow-sm active:scale-95 touch-manipulation select-none',
                    translationMode !== 'original'
                      ? 'bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                      : 'bg-white/10 hover:bg-white/15 text-white/85 hover:text-white border-white/10'
                  )}
                  aria-haspopup="listbox"
                  aria-expanded={isModeDropdownOpen}
                  title="Pilih Mode Lirik (Original, Keduanya, Terjemahan)"
                >
                  {isTranslating && (
                    <Loader2
                      className={cn(
                        'w-3 h-3 animate-spin',
                        translationMode !== 'original' ? 'text-black' : 'text-white'
                      )}
                    />
                  )}
                  <span className="truncate max-w-[80px] sm:max-w-none">
                    {translationMode === 'both'
                      ? 'Keduanya'
                      : translationMode === 'translated'
                      ? 'Terjemahan'
                      : 'Original'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-3 h-3 text-current/70 transition-transform duration-200 shrink-0',
                      isModeDropdownOpen && 'rotate-180'
                    )}
                  />
                </button>

                {isModeDropdownOpen && (
                  <div
                    role="listbox"
                    className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl bg-neutral-900/95 backdrop-blur-2xl border border-white/15 p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={translationMode === 'original'}
                      onClick={() => {
                        handleSetTranslationMode('original');
                        setIsModeDropdownOpen(false);
                      }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer select-none text-left',
                        translationMode === 'original'
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span>Original</span>
                      {translationMode === 'original' && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>

                    <button
                      type="button"
                      role="option"
                      aria-selected={translationMode === 'both'}
                      onClick={() => {
                        handleSetTranslationMode('both');
                        setIsModeDropdownOpen(false);
                      }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer select-none text-left',
                        translationMode === 'both'
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Keduanya</span>
                        {isTranslating && translationMode === 'both' && (
                          <Loader2 className="w-3 h-3 animate-spin text-white/70" />
                        )}
                      </div>
                      {translationMode === 'both' && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>

                    <button
                      type="button"
                      role="option"
                      aria-selected={translationMode === 'translated'}
                      onClick={() => {
                        handleSetTranslationMode('translated');
                        setIsModeDropdownOpen(false);
                      }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer select-none text-left',
                        translationMode === 'translated'
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Terjemahan</span>
                        {isTranslating && translationMode === 'translated' && (
                          <Loader2 className="w-3 h-3 animate-spin text-white/70" />
                        )}
                      </div>
                      {translationMode === 'translated' && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Calibration Button */}
            {effectiveIsSynced && (
              <button
                type="button"
                onClick={() => setShowCalibration((prev) => !prev)}
                className={cn(
                  'flex items-center justify-center gap-1.5 h-8 sm:h-9 px-2 sm:px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer border shadow-sm active:scale-95',
                  showCalibration || lyricsOffset !== 0
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/35 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                    : 'bg-white/10 hover:bg-white/15 text-white/70 hover:text-white border-white/10'
                )}
                title="Pengaturan Timing Lirik (Kalibrasi Offset)"
                aria-label="Pengaturan Kalibrasi Timing"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                {lyricsOffset !== 0 && (
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-purple-500/40 text-purple-200">
                    {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
                  </span>
                )}
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleNativeFullscreen}
              className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-white/10 hover:bg-white/20 rounded-full text-white/80 hover:text-white transition-all cursor-pointer border border-white/10 active:scale-95"
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (Fullscreen)'}
              aria-label="Toggle Fullscreen Layar"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>

            {/* Exit Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleClose();
              }}
              className="flex items-center justify-center gap-1 h-8 sm:h-9 px-2.5 sm:px-3 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-all cursor-pointer shadow-lg active:scale-95 border border-white/10"
              title="Tutup mode layar penuh (Esc)"
              aria-label="Keluar dari layar penuh"
            >
              <Minimize2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Expandable Calibration Bar */}
      {showCalibration && effectiveIsSynced && currentVideoId && (
        <div className="relative z-20 px-3 py-2 bg-black/40 backdrop-blur-md border-b border-white/10 flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-white/60 font-medium mr-1 text-[11px] sm:text-xs">Kalibrasi:</span>
          <button
            type="button"
            onClick={() => adjustOffset(currentVideoId, -0.5)}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 border border-white/10 font-mono transition-all cursor-pointer text-xs"
            title="Majukan lirik 0.5 detik"
          >
            -0.5s
          </button>
          <button
            type="button"
            onClick={() => adjustOffset(currentVideoId, -0.1)}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 border border-white/10 font-mono transition-all cursor-pointer text-xs"
            title="Majukan lirik 0.1 detik"
          >
            -0.1s
          </button>
          <div className="px-2.5 sm:px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 font-mono font-bold text-purple-300 min-w-[54px] sm:min-w-[60px] text-center text-xs">
            {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
          </div>
          <button
            type="button"
            onClick={() => adjustOffset(currentVideoId, 0.1)}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 border border-white/10 font-mono transition-all cursor-pointer text-xs"
            title="Mundurkan lirik 0.1 detik"
          >
            +0.1s
          </button>
          <button
            type="button"
            onClick={() => adjustOffset(currentVideoId, 0.5)}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 border border-white/10 font-mono transition-all cursor-pointer text-xs"
            title="Mundurkan lirik 0.5 detik"
          >
            +0.5s
          </button>
          {lyricsOffset !== 0 && (
            <button
              type="button"
              onClick={() => resetOffset(currentVideoId)}
              className="ml-1 sm:ml-2 px-2 sm:px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-300 border border-red-500/30 font-medium transition-all cursor-pointer text-xs"
              title="Reset ke sinkronisasi awal (0.0s)"
            >
              Reset (0.0s)
            </button>
          )}
        </div>
      )}

      {/* MAIN LYRICS SCROLLER */}
      <main className="flex-1 relative min-h-0 w-full overflow-hidden flex flex-col justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-3 animate-in fade-in duration-200">
            <Loader2 className="w-10 h-10 animate-spin text-white/70" />
            <p className="text-sm font-semibold text-white/80 animate-pulse text-center">
              Mencari & menyiapkan lirik imersif...
            </p>
          </div>
        ) : !activeLyrics || activeLyrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-6 px-6 text-center animate-in fade-in duration-300 max-w-lg mx-auto">
            {/* Aesthetic Large Cover Art Thumbnail Card */}
            <div className="relative group">
              <div className="relative w-52 h-52 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/15 ring-1 ring-white/20 bg-black/50">
                {thumbnail ? (
                  <Image
                    src={thumbnail}
                    alt={currentTrack.name}
                    fill
                    sizes="(max-width: 640px) 208px, 288px"
                    priority
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <Music className="w-20 h-20 opacity-40" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </div>

              {/* Dynamic Outer Aura Glow */}
              <div
                className="absolute -inset-4 rounded-3xl blur-2xl opacity-35 -z-10 transition-all duration-1000"
                style={{ backgroundColor: dominantColor || '#3b82f6' }}
              />
            </div>

            {/* Track Info */}
            <div className="space-y-1.5 px-4">
              <h3 className="text-lg sm:text-2xl font-bold text-white tracking-tight line-clamp-2">
                {currentTrack.name}
              </h3>
              <p className="text-xs sm:text-sm text-white/60 line-clamp-1">{artistName}</p>
            </div>

            {/* Status Badge & Graceful Fallback Message */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90 shadow-sm">
                {isLongAudio ? (
                  <>
                    <Disc3 className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
                    <span>Audio / Album Durasi Panjang</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-4 h-4 text-white/60" />
                    <span>Lirik Tidak Tersedia</span>
                  </>
                )}
              </div>

              <p className="text-xs sm:text-sm text-white/50 leading-relaxed max-w-sm px-2">
                {isLongAudio
                  ? 'Lirik tidak tersedia untuk trek/album durasi panjang ini. Nikmati pengalaman visual cover art imersif dan kualitas audio penuh.'
                  : 'Lirik belum ditemukan di database publik untuk lagu ini.'}
              </p>
            </div>

            {/* Retry Button ONLY for normal-duration songs */}
            {!isLongAudio && (
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
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full text-xs font-semibold transition-all cursor-pointer border border-white/15 shadow-xl"
              >
                <RotateCcw className="w-3.5 h-3.5 text-white/70" />
                <span>Coba Cari Ulang Lirik</span>
              </button>
            )}
          </div>
        ) : (
          <div
            ref={containerRef}
            onTouchStart={handleUserInteraction}
            onTouchMove={handleUserInteraction}
            onWheel={handleUserInteraction}
            className="flex-1 overflow-y-auto no-scrollbar py-[22vh] sm:py-[25vh] px-4 sm:px-10 md:px-20 max-w-4xl mx-auto w-full text-center space-y-3.5 sm:space-y-5 md:space-y-6 lyrics-mask gpu-accelerated relative"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Non-Synced Plain Text Indicator */}
            {!effectiveIsSynced && (
              <div className="py-4 flex items-center justify-center select-none">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 font-medium shadow-sm">
                  <FileText className="w-3.5 h-3.5 text-white/60" />
                  <span>Lirik Tanpa Sinkronisasi (Teks Biasa)</span>
                </span>
              </div>
            )}

            {/* Intro Instrumental Indicator (Synced Mode Only) */}
            {effectiveIsSynced && activeIndex === -1 && (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/40 animate-pulse text-center">
                <Disc3 className="w-7 h-7 animate-spin text-white/40" style={{ animationDuration: '4s' }} />
                <span className="text-xs font-bold tracking-widest uppercase text-white/50">
                  Musik Mengalun • Intro
                </span>
              </div>
            )}

            {/* Lyric Lines (Supports Synced Lyrics, Auto-Converted, and Plain Lyrics) */}
            {effectiveLyrics.map((line, idx) => {
              const textTrimmed = (line.text || '').trim();
              const isSectionHeader = /^\[.*?\]$/.test(textTrimmed);

              const roundedKey = Math.round(line.time * 10) / 10;
              const transEntry =
                translations.get(roundedKey) ||
                translations.get(Math.round(line.time)) ||
                translationsByIndex.get(idx);
              const hasTrans = Boolean(isTranslationEnabled && (transEntry?.translation || transEntry?.romaji));

              const position = getLyricPosition(idx, activeIndex);
              const isActive = idx === activeIndex;

              return (
                <FullScreenLyricRow
                  key={`fs-lyric-${idx}`}
                  idx={idx}
                  text={line.text}
                  time={line.time}
                  position={position}
                  isActive={isActive}
                  isSectionHeader={isSectionHeader}
                  translation={transEntry?.translation}
                  romaji={transEntry?.romaji}
                  hasTrans={hasTrans}
                  translationMode={translationMode}
                  isSynced={effectiveIsSynced}
                  onSeek={handleSeekToLyric}
                  setRef={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Floating Re-Sync Button */}
        {showSyncButton && activeIndex >= 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleManualSync();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Kembali ke lirik aktif</span>
            </button>
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM CONTROLLER ISLAND */}
      <footer className="relative z-20 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1 px-4 flex justify-center">
        <div className="flex items-center gap-3.5 sm:gap-4 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full py-2 px-5 sm:py-2.5 sm:px-6 shadow-2xl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (currentTrack) toggleLike(currentTrack);
            }}
            className="p-1.5 text-white/60 hover:text-white transition-colors cursor-pointer"
            title="Sukai lagu"
          >
            <Heart className={cn('w-5 h-5', isLiked && 'fill-[#1DB954] text-[#1DB954]')} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              playPrev();
            }}
            className="p-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Sebelumnya"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              togglePlay();
            }}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying && isBuffering ? (
              <Loader2 className="w-5 h-5 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              playNext();
            }}
            className="p-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Berikutnya"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Isolated Time Display: Prevents root re-rendering on every audio tick */}
          <LyricsTimeDisplay />
        </div>
      </footer>
    </motion.div>
  );
});

export default FullScreenLyrics;
