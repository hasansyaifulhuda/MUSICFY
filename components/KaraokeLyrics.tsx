'use client';

import React, {
  memo,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { cn } from '@/lib/utils';
import { getPersistentAudioElement, safePlayAudio } from '@/lib/audioElement';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { parseTimestampToSeconds, findActiveLyricIndex } from '@/lib/performance';
import { Radio, Sparkles, Disc3 } from 'lucide-react';

export interface KaraokeWord {
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface KaraokeLine {
  id: string | number;
  time: number; // Start time in seconds
  endTime: number; // End time in seconds
  duration: number; // Total duration in seconds
  text: string; // Plain line text
  words: KaraokeWord[]; // Word-by-word timestamps
  isSectionHeader?: boolean;
}

export interface KaraokeLyricsProps {
  /**
   * Lyrics data: can be raw LRC string, array of LyricLine { time, text },
   * or pre-parsed KaraokeLine array.
   */
  lyrics?: string | KaraokeLine[] | any[];
  /**
   * Optional externally controlled current playback time (in seconds).
   * If omitted, component syncs directly to the global HTML5 audio element.
   */
  currentTime?: number;
  /**
   * Total song duration in seconds (used for timing estimation of last lines).
   */
  duration?: number;
  /**
   * Callback fired when user clicks a lyric line or word to seek.
   */
  onSeek?: (time: number) => void;
  /**
   * Custom audio element to listen to. If omitted, uses getPersistentAudioElement().
   */
  audioElement?: HTMLAudioElement | null;
  /**
   * Active highlight color (default: '#FFFFFF' Pure White).
   */
  activeColor?: string;
  /**
   * Inactive unplayed color (default: 'rgba(255, 255, 255, 0.45)' soft white).
   */
  inactiveColor?: string;
  /**
   * Completed played color (default: '#FFFFFF').
   */
  completedColor?: string;
  /**
   * Custom CSS classes for the scrollable container.
   */
  className?: string;
  /**
   * Whether to automatically scroll active lyric to vertical center (default: true).
   */
  autoScroll?: boolean;
  /**
   * Font size scale: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' (default: '2xl').
   */
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  /**
   * Header or intro badge label when playback is before the first line.
   */
  showIntroIndicator?: boolean;
  /**
   * Custom videoId or track identifier for calibrated offset lookup.
   */
  videoId?: string;
}

/**
 * Robust parser for both Standard LRC ([mm:ss.xx]) and Enhanced Word-by-Word LRC ([mm:ss.xx]<mm:ss.xx>word).
 * Also handles JSON object arrays and plain text lyrics.
 */
export function parseKaraokeLyrics(
  rawLyrics: any,
  trackDuration: number = 180
): KaraokeLine[] {
  if (!rawLyrics) return [];

  // 1. If rawLyrics is already parsed KaraokeLine array
  if (
    Array.isArray(rawLyrics) &&
    rawLyrics.length > 0 &&
    typeof rawLyrics[0] === 'object' &&
    Array.isArray(rawLyrics[0].words)
  ) {
    return rawLyrics as KaraokeLine[];
  }

  // 2. Parse LRC string or array of strings / objects
  const rawLines: { time: number; rawText: string; words?: KaraokeWord[] }[] = [];
  const lineTagRegex = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:,](\d{1,3}))?\]/g;
  const wordTagRegex = /<(\d{1,2}):(\d{2})(?:[.:,](\d{1,3}))?>([^<]+)/g;

  if (typeof rawLyrics === 'string') {
    const lines = rawLyrics.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || /^\[(ti|ar|al|by|offset|length):/i.test(trimmed)) continue;

      const matches = Array.from(trimmed.matchAll(lineTagRegex));
      if (matches.length > 0) {
        const textWithoutLineTags = trimmed.replace(lineTagRegex, '').trim();

        // Check for Enhanced Word Tags: <mm:ss.xx>word
        const wordMatches = Array.from(textWithoutLineTags.matchAll(wordTagRegex));
        let parsedWords: KaraokeWord[] | undefined = undefined;

        if (wordMatches.length > 0) {
          parsedWords = [];
          for (let w = 0; w < wordMatches.length; w++) {
            const wm = wordMatches[w];
            const wTime = parseTimestampToSeconds(wm[1], wm[2], wm[3]);
            const nextWm = wordMatches[w + 1];
            const wNextTime = nextWm
              ? parseTimestampToSeconds(nextWm[1], nextWm[2], nextWm[3])
              : wTime + 0.8;
            parsedWords.push({
              text: wm[4].trim(),
              startTime: wTime,
              endTime: Math.max(wTime + 0.1, wNextTime),
              duration: Math.max(0.1, wNextTime - wTime),
            });
          }
        }

        const cleanText = textWithoutLineTags
          .replace(/<\d{1,2}:\d{2}(?:[.:,]\d{1,3})?>/g, '')
          .trim();

        for (const match of matches) {
          const hasHours = Boolean(match[1]);
          const lineTime = hasHours
            ? parseTimestampToSeconds(match[1], match[2], match[3], match[4])
            : parseTimestampToSeconds(match[2], match[3], match[4]);

          rawLines.push({
            time: Math.max(0, Math.round(lineTime * 1000) / 1000),
            rawText: cleanText,
            words: parsedWords,
          });
        }
      } else if (trimmed) {
        rawLines.push({
          time: 0,
          rawText: trimmed,
        });
      }
    }
  } else if (Array.isArray(rawLyrics)) {
    for (const item of rawLyrics) {
      if (!item) continue;
      if (typeof item === 'string') {
        const subParsed = parseKaraokeLyrics(item, trackDuration);
        for (const sp of subParsed) {
          rawLines.push({
            time: sp.time,
            rawText: sp.text,
            words: sp.words,
          });
        }
        continue;
      }
      const text = (item.text ?? item.words ?? item.line ?? '').toString().trim();
      const timeMs =
        item.startTimeMs !== undefined
          ? Number(item.startTimeMs) / 1000
          : item.timeMs !== undefined
          ? Number(item.timeMs) / 1000
          : item.time !== undefined
          ? Number(item.time) > 10000
            ? Number(item.time) / 1000
            : Number(item.time)
          : 0;

      rawLines.push({
        time: Math.max(0, Math.round(timeMs * 1000) / 1000),
        rawText: text,
      });
    }
  }

  if (rawLines.length === 0) return [];

  // Sort chronologically by timestamp
  rawLines.sort((a, b) => a.time - b.time);

  // If all timestamps are 0 (plain lyrics), synthesize timing across song duration
  const allZero = rawLines.every((l) => l.time === 0);
  if (allZero) {
    const introTime = Math.min(12, Math.max(4, trackDuration * 0.05));
    const avail = Math.max(10, trackDuration - introTime - 5);
    const totalChars = rawLines.reduce((acc, cur) => acc + Math.max(8, cur.rawText.length), 0);
    let curTime = introTime;

    for (let i = 0; i < rawLines.length; i++) {
      rawLines[i].time = Math.round(curTime * 100) / 100;
      const weight = Math.max(8, rawLines[i].rawText.length) / totalChars;
      curTime += weight * avail;
    }
  }

  // 3. Assemble complete KaraokeLine structures with calculated durations and word partitions
  const result: KaraokeLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    const next = rawLines[i + 1];
    const isSectionHeader = /^\[.*?\]$/.test(current.rawText);

    // Calculate line duration
    let lineEndTime: number;
    if (next && next.time > current.time) {
      lineEndTime = next.time;
    } else {
      lineEndTime = Math.min(trackDuration, current.time + Math.max(3.5, current.rawText.length * 0.12));
    }
    const lineDuration = Math.max(1.0, lineEndTime - current.time);

    // Build word list
    let words: KaraokeWord[] = [];
    if (current.words && current.words.length > 0) {
      words = current.words;
    } else {
      // Synthesize words evenly based on word length for fluid left-to-right karaoke wipe
      const splitTokens = current.rawText.split(/\s+/).filter(Boolean);
      if (splitTokens.length > 0) {
        const totalWordChars = splitTokens.reduce((sum, w) => sum + Math.max(1, w.length), 0);
        let wordStart = current.time;

        for (let w = 0; w < splitTokens.length; w++) {
          const wText = splitTokens[w];
          const wRatio = Math.max(1, wText.length) / totalWordChars;
          const wDur = Math.max(0.15, lineDuration * wRatio);
          const wEnd = Math.min(lineEndTime, wordStart + wDur);

          words.push({
            text: wText,
            startTime: wordStart,
            endTime: wEnd,
            duration: Math.max(0.1, wEnd - wordStart),
          });

          wordStart = wEnd;
        }
      } else {
        words.push({
          text: current.rawText,
          startTime: current.time,
          endTime: lineEndTime,
          duration: lineDuration,
        });
      }
    }

    result.push({
      id: `k-line-${i}`,
      time: current.time,
      endTime: lineEndTime,
      duration: lineDuration,
      text: current.rawText,
      words,
      isSectionHeader,
    });
  }

  return result;
}

/**
 * Active Lyric Line Renderer (Spotify Premium pure white text).
 */
interface ActiveKaraokeRowProps {
  line: KaraokeLine;
  onSeek: (time: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
  fontSizeClass: string;
}

const ActiveKaraokeRow = memo(function ActiveKaraokeRow({
  line,
  onSeek,
  setRef,
  fontSizeClass,
}: ActiveKaraokeRowProps) {
  const handleClick = useCallback(() => {
    onSeek(line.time);
  }, [onSeek, line.time]);

  return (
    <div
      ref={setRef}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Lirik aktif: ${line.text}`}
      style={{
        color: '#FFFFFF',
        WebkitTextFillColor: '#FFFFFF',
        opacity: 1,
        fontWeight: 800,
        transform: 'scale(1.03)',
      }}
      className={cn(
        'musicfy-lyric-item lyric-active py-3 px-4 cursor-pointer select-none origin-center text-center rounded-2xl transition-all duration-300 transform-gpu will-change-transform font-extrabold text-white',
        fontSizeClass
      )}
    >
      <p
        className="leading-tight tracking-tight text-center select-none"
        style={{
          color: '#FFFFFF',
          WebkitTextFillColor: '#FFFFFF',
          fontWeight: 800,
        }}
      >
        {line.text}
      </p>
    </div>
  );
});

/**
 * Self-contained active lyric line with Spotify Premium pure white text.
 */
export interface KaraokeLineWipeProps {
  text: string;
  startTime?: number;
  endTime?: number;
  isActive?: boolean;
  isPast?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  completedColor?: string;
  className?: string;
  videoId?: string;
  words?: KaraokeWord[];
}

export const KaraokeLineWipe = memo(function KaraokeLineWipe({
  text,
  className,
}: KaraokeLineWipeProps) {
  return (
    <span
      className={cn('inline-block select-none transition-all duration-300 ease-out', className)}
      style={{
        color: '#FFFFFF',
        WebkitTextFillColor: '#FFFFFF',
      }}
    >
      {text}
    </span>
  );
});

/**
 * Inactive Lyric Line Renderer:
 * Memoized to prevent re-rendering when other lines progress.
 */
interface InactiveKaraokeRowProps {
  line: KaraokeLine;
  position: 'prev' | 'prev-distant' | 'next' | 'next-distant';
  onSeek: (time: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
  fontSizeClass: string;
}

const InactiveKaraokeRow = memo(
  function InactiveKaraokeRow({
    line,
    position,
    onSeek,
    setRef,
    fontSizeClass,
  }: InactiveKaraokeRowProps) {
    const handleClick = useCallback(() => {
      onSeek(line.time);
    }, [onSeek, line.time]);

    const opacity =
      position === 'prev' ? 0.35 : position === 'next' ? 0.45 : 0.20;

    return (
      <div
        ref={setRef}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Lirik: ${line.text}`}
        style={{
          color: '#A1A1AA',
          WebkitTextFillColor: '#A1A1AA',
          opacity,
          fontWeight: 500,
          transform: position === 'prev' || position === 'next' ? 'scale(1)' : 'scale(0.98)',
        }}
        className={cn(
          'musicfy-lyric-item py-2.5 px-4 cursor-pointer select-none origin-center text-center rounded-2xl transition-all duration-300 transform-gpu focus:outline-none will-change-transform',
          position === 'prev' && 'lyric-prev font-medium text-[#A1A1AA] hover:opacity-85 hover:text-white',
          position === 'prev-distant' && 'lyric-distant font-medium text-[#A1A1AA] hover:opacity-85 hover:text-white',
          position === 'next' && 'lyric-next font-medium text-[#A1A1AA] hover:opacity-85 hover:text-white',
          position === 'next-distant' && 'lyric-distant font-medium text-[#A1A1AA] hover:opacity-85 hover:text-white',
          fontSizeClass
        )}
      >
        <p
          className="leading-relaxed tracking-tight text-center select-none"
          style={{
            color: '#A1A1AA',
            WebkitTextFillColor: '#A1A1AA',
            fontWeight: 500,
          }}
        >
          {line.text}
        </p>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.line.id === next.line.id &&
      prev.position === next.position &&
      prev.fontSizeClass === next.fontSizeClass
    );
  }
);

/**
 * Main Standalone Karaoke Synchronized Lyrics Component.
 */
export const KaraokeLyrics = memo(function KaraokeLyrics({
  lyrics,
  currentTime: controlledTime,
  duration = 180,
  onSeek,
  audioElement,
  activeColor = '#FFFFFF',
  inactiveColor = 'rgba(255, 255, 255, 0.45)',
  completedColor = '#FFFFFF',
  className,
  autoScroll = true,
  fontSize = '2xl',
  showIntroIndicator = true,
  videoId,
}: KaraokeLyricsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Parse raw lyrics to structured KaraokeLine array
  const parsedLines = useMemo(() => {
    return parseKaraokeLyrics(lyrics, duration);
  }, [lyrics, duration]);

  // Keep lineRefs array in sync
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, parsedLines.length);
  }, [parsedLines.length]);

  // State: current active line index & high-frequency audio time
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const [realTime, setRealTime] = useState<number>(0);

  // User scrolling safeguards
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstScrollRef = useRef<boolean>(true);
  const [showReSyncPill, setShowReSyncPill] = useState<boolean>(false);

  // Global calibrated lyrics offset
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(videoId));

  // Determine font size classes
  const fontSizeClass = useMemo(() => {
    switch (fontSize) {
      case 'sm':
        return 'text-sm sm:text-base';
      case 'base':
        return 'text-base sm:text-lg';
      case 'lg':
        return 'text-lg sm:text-xl';
      case 'xl':
        return 'text-xl sm:text-2xl';
      case '3xl':
        return 'text-3xl sm:text-4xl md:text-5xl';
      case '2xl':
      default:
        return 'text-2xl sm:text-3xl md:text-4xl';
    }
  }, [fontSize]);

  // 1. Smooth Centering Auto-Scroll Logic using viewport-relative bounding box math:
  const scrollToActiveLine = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      if (!autoScroll || index < 0 || isUserScrollingRef.current) return;
      const container = containerRef.current;
      const targetEl = lineRefs.current[index];
      if (!container || !targetEl) return;

      const containerRect = container.getBoundingClientRect();
      const lineRect = targetEl.getBoundingClientRect();
      const lineRelativeTop = lineRect.top - containerRect.top + container.scrollTop;
      const targetScrollTop = lineRelativeTop - (containerRect.height / 2) + (lineRect.height / 2);

      try {
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
      } catch {
        container.scrollTop = Math.max(0, targetScrollTop);
      }
    },
    [autoScroll]
  );

  // Trigger auto-scroll on activeIndex change
  useEffect(() => {
    if (activeIndex < 0 || isUserScrollingRef.current) return;
    const behavior: ScrollBehavior = isFirstScrollRef.current ? 'auto' : 'smooth';
    isFirstScrollRef.current = false;
    scrollToActiveLine(activeIndex, behavior);
  }, [activeIndex, scrollToActiveLine]);

  // 2. High-Frequency Real-Time 60fps Synchronization:
  useEffect(() => {
    if (parsedLines.length === 0) return;

    const audio = audioElement || getPersistentAudioElement();
    let rafId: number | null = null;

    const tick = () => {
      const rawCurrent = audio ? audio.currentTime : controlledTime || 0;
      const effectiveCurrent = Math.max(0, rawCurrent + lyricsOffset);
      setRealTime(effectiveCurrent);

      // Binary search active line with calibrated 50ms display-frame tolerance window
      const foundIdx = findActiveLyricIndex(parsedLines, effectiveCurrent, 0.05);

      if (foundIdx !== activeIndexRef.current) {
        activeIndexRef.current = foundIdx;
        setActiveIndex(foundIdx);
      }

      if (audio && !audio.paused && !audio.ended) {
        rafId = requestAnimationFrame(tick);
      }
    };

    // Event listeners
    const handlePlay = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    };

    const handlePause = () => {
      if (rafId) cancelAnimationFrame(rafId);
      tick();
    };

    const handleImmediate = () => {
      tick();
    };

    // Initial tick
    tick();

    if (audio) {
      if (!audio.paused) {
        rafId = requestAnimationFrame(tick);
      }
      audio.addEventListener('play', handlePlay, { passive: true });
      audio.addEventListener('pause', handlePause, { passive: true });
      audio.addEventListener('timeupdate', handleImmediate, { passive: true });
      audio.addEventListener('seeked', handleImmediate, { passive: true });
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (audio) {
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('timeupdate', handleImmediate);
        audio.removeEventListener('seeked', handleImmediate);
      }
    };
  }, [parsedLines, audioElement, controlledTime, lyricsOffset]);

  // 3. User Touch / Wheel Scroll Handler:
  const handleUserInteraction = useCallback(() => {
    isUserScrollingRef.current = true;
    setShowReSyncPill(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    // Auto-resume smooth tracking after 3.2 seconds
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      setShowReSyncPill(false);
      if (activeIndexRef.current >= 0) {
        scrollToActiveLine(activeIndexRef.current, 'smooth');
      }
    }, 3200);
  }, [scrollToActiveLine]);

  // Manual re-sync button click
  const handleManualSync = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    isUserScrollingRef.current = false;
    setShowReSyncPill(false);
    if (activeIndexRef.current >= 0) {
      scrollToActiveLine(activeIndexRef.current, 'smooth');
    }
  }, [scrollToActiveLine]);

  // Handle Seek callback
  const handleSeek = useCallback(
    (time: number) => {
      if (onSeek) {
        onSeek(time);
      } else {
        const audio = audioElement || getPersistentAudioElement();
        if (audio) {
          audio.currentTime = time;
          if (audio.paused) {
            safePlayAudio(audio).catch(() => {});
          }
        }
      }
    },
    [onSeek, audioElement]
  );

  return (
    <div className="relative w-full h-full flex flex-col items-center select-none overflow-hidden">
      {/* Scrollable Lyrics Container */}
      <div
        ref={containerRef}
        onTouchStart={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onWheel={handleUserInteraction}
        className={cn(
          'flex-1 overflow-y-auto no-scrollbar py-[38vh] px-4 sm:px-8 md:px-16 w-full max-w-4xl mx-auto text-center space-y-4 md:space-y-6 lyrics-mask gpu-accelerated relative',
          className
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Intro Instrumental Indicator */}
        {showIntroIndicator && activeIndex === -1 && parsedLines.length > 0 && (
          <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-white/40 animate-pulse text-center">
            <Disc3
              className="w-8 h-8 animate-spin text-white/40"
              style={{ animationDuration: '4s' }}
            />
            <span className="text-xs font-bold tracking-widest uppercase text-white/50">
              Musik Mengalun • Intro
            </span>
          </div>
        )}

        {/* Lines Rendering */}
        {parsedLines.map((line, idx) => {
          if (line.isSectionHeader) {
            return (
              <div key={line.id} className="pt-4 pb-1 text-center">
                <span className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-white/40">
                  {line.text.replace(/[\[\]]/g, '')}
                </span>
              </div>
            );
          }

          if (idx === activeIndex) {
            return (
              <ActiveKaraokeRow
                key={line.id}
                line={line}
                onSeek={handleSeek}
                setRef={(el) => {
                  lineRefs.current[idx] = el;
                }}
                fontSizeClass={fontSizeClass}
              />
            );
          }

          const position: 'prev' | 'prev-distant' | 'next' | 'next-distant' =
            idx === activeIndex - 1
              ? 'prev'
              : idx < activeIndex - 1
              ? 'prev-distant'
              : idx === activeIndex + 1
              ? 'next'
              : 'next-distant';

          return (
            <InactiveKaraokeRow
              key={line.id}
              line={line}
              position={position}
              onSeek={handleSeek}
              setRef={(el) => {
                lineRefs.current[idx] = el;
              }}
              fontSizeClass={fontSizeClass}
            />
          );
        })}
      </div>

      {/* Floating Re-Sync Button */}
      {showReSyncPill && activeIndex >= 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
    </div>
  );
});

export default KaraokeLyrics;
