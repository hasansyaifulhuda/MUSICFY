'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  DownloadCloud,
  Play,
  Shuffle,
  Search,
  History,
  Settings,
  CheckCircle2,
  Music,
  ArrowRight,
  HardDriveDownload,
  Info,
  Sparkles,
  Heart,
  User,
} from 'lucide-react';
import { db, OfflineTrack } from '@/lib/db';
import { Track, usePlayerStore } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { getHighResImage, cn } from '@/lib/utils';
import { MarqueeText } from '@/components/MarqueeText';
import { toast } from '@/lib/toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import dynamic from 'next/dynamic';
import { CommunityPlaylistCard } from '@/components/CommunityPlaylistCard';
import { HomeSkeleton } from '@/components/HomeSkeleton';
import { Equalizer } from '@/components/Equalizer';
import { prefetchArtist, getHomeCache, setHomeCache } from '@/lib/clientDataCache';
import { useTapGesture } from '@/hooks/useTapGesture';

const HomeQuickGridItem = memo(function HomeQuickGridItem({
  track,
  idx,
  onlineQuickGridItems,
  isCurrent,
}: {
  track: Track;
  idx: number;
  onlineQuickGridItems: Track[];
  isCurrent: boolean;
}) {
  const { playTrack } = useMusic();
  const thumb = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );

  const handlePlay = useCallback(() => {
    playTrack(track, onlineQuickGridItems, 'similar', idx);
  }, [playTrack, track, onlineQuickGridItems, idx]);

  const tapGesture = useTapGesture({
    onTap: handlePlay,
    threshold: 8,
  });

  return (
    <div
      {...tapGesture}
      className={`flex items-center transition-all duration-200 rounded-xl overflow-hidden cursor-pointer group shadow-sm select-none relative border ${
        isCurrent
          ? 'bg-white/[0.18] border-white/20'
          : 'bg-white/[0.05] hover:bg-white/[0.10] border-white/[0.06]'
      }`}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="relative w-12 h-12 md:w-16 md:h-16 shrink-0 shadow bg-black/40">
        <Image
          src={thumb}
          alt={track.name}
          fill
          sizes="64px"
          className="object-cover"
          priority={idx < 3}
          loading={idx < 3 ? undefined : 'lazy'}
          decoding="async"
        />
      </div>
      <div className="flex-1 min-w-0 px-3 flex items-center justify-between">
        <span
          className={`text-xs md:text-sm font-bold truncate pr-2 leading-snug ${
            isCurrent ? 'text-[#1DB954]' : 'text-white'
          }`}
        >
          {track.name}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            playTrack(track, onlineQuickGridItems, 'similar', idx);
          }}
          className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-[0_8px_16px_rgba(29,185,84,0.4)] hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 cursor-pointer"
          title="Putar"
        >
          <Play className="w-4 h-4 md:w-5 md:h-5 fill-current ml-0.5" />
        </button>
      </div>
    </div>
  );
});

const HomeQuickPickItem = memo(function HomeQuickPickItem({
  track,
  quickPicksTracks,
  chunkIndex,
  itemIndex,
  isCurrent,
}: {
  track: Track;
  quickPicksTracks: Track[];
  chunkIndex: number;
  itemIndex: number;
  isCurrent: boolean;
}) {
  const { playTrack } = useMusic();
  const thumb = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 100),
    [track.thumbnails]
  );
  const art = useMemo(
    () =>
      Array.isArray(track.artist)
        ? track.artist.map((a: any) => a.name).join(', ')
        : track.artist?.name || 'Unknown Artist',
    [track.artist]
  );

  const handlePlay = useCallback(() => {
    playTrack(track, quickPicksTracks, 'similar');
  }, [playTrack, track, quickPicksTracks]);

  const tapGesture = useTapGesture({
    onTap: handlePlay,
    threshold: 8,
  });

  return (
    <div
      {...tapGesture}
      className="flex items-center gap-3 cursor-pointer group hover:bg-white/[0.08] active:bg-white/[0.12] p-2 rounded-xl transition-all duration-150 select-none border border-transparent hover:border-white/5"
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md bg-white/5 border border-white/5">
        <Image
          src={thumb}
          alt={track.name}
          fill
          sizes="48px"
          priority={chunkIndex === 0 && itemIndex < 3}
          loading={chunkIndex === 0 && itemIndex < 3 ? undefined : 'lazy'}
          decoding="async"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 fill-white text-white ml-0.5" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={`font-semibold text-sm truncate transition-colors leading-tight ${
            isCurrent ? 'text-[#1DB954]' : 'text-white group-hover:text-[#1DB954]'
          }`}
        >
          {track.name}
        </h4>
        <p className="text-[#b3b3b3] text-xs truncate mt-0.5">{art}</p>
      </div>
    </div>
  );
});

const CURATED_POPULAR_ARTISTS = [
  {
    artistId: 'UC_DHlXllTSMB8pTC38_leFg',
    name: 'Tulus',
    thumbnails: [
      { url: 'https://yt3.googleusercontent.com/h8P1jEIZLM8lkMxNA6Nbq98b43wcqllJSNmcZTCRPAB-F6rG_0Nqw5w7fwou0PN1QGwSW5viwWD5NV0=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCa1eYN7cwBQrOFQLt_K8c-Q',
    name: 'Mahalini',
    thumbnails: [
      { url: 'https://yt3.googleusercontent.com/VdgLqr3Sno_U1IXj9qzk43azloCsjBeDy6MpFjfD8kMmco0AeL81qow0cpHynDfpaVlujCY11O7QO4d6=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCoy8sTKrImqfSq6TYOSW81A',
    name: 'Sheila On 7',
    thumbnails: [
      { url: 'https://lh3.googleusercontent.com/ZBI5XEhdUvkE59Kr7HKZYIjoopuA_kC0uPAWNsEw-EmLfTtRaXuDEv-qYWTv_lahkpA8Yuhe7P-sO2Y=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCCMnLkUAdm_NGMDTTC-nvDQ',
    name: 'Noah',
    thumbnails: [
      { url: 'https://lh3.googleusercontent.com/6xEP8mOA5xguCiwfeNq08D1o0GK7iPSNMwp80jJpyxw4bwdOgo4EO-8T4rnb8gv3_283YEoQsZvRLD4k=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UC1COz5-ymC7FALbIPii5dwQ',
    name: 'Lyodra',
    thumbnails: [
      { url: 'https://yt3.googleusercontent.com/fX1X2u4D_p36NXWXqmOJneksx8UuAC4YaZGU4IKShOMX4NtaA3CCKyMoFDh4B3WHEIjL6fg7Z4zwb0s=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCbwDovhiwBefYbJWw8aYNMA',
    name: 'Iwan Fals',
    thumbnails: [
      { url: 'https://lh3.googleusercontent.com/zau9NHD_yabaiGfvwf52ckNIP2KVKh9RDZgMsGkAnAvb2ZJxw9P9icgFE8ROabj9S5Dq3HS5mhO9LY8=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCPLQQRzfvggMf4tQ9KougTQ',
    name: 'Judika',
    thumbnails: [
      { url: 'https://yt3.googleusercontent.com/Vr6B71VpRIpPBcnWMObuZid84nmmfe6jFIXJd7pLdcvSF8KkMx-CHrUZiMZdMnGnwOekYt_J56EaLpvT=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UC5XiB9X7a-ZzwiM-Xk0e-7g',
    name: 'ROSSA',
    thumbnails: [
      { url: 'https://yt3.googleusercontent.com/WD6ITlanyUoaEogBdR7BlJVSOSa_C8vUsR-P376x9Pfdr1GbPr8FX8NIOkxWDTTeWwr9TDvieQ-Z=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCDkv8TdCmYHL9sep2Ag3SFw',
    name: 'Geisha',
    thumbnails: [
      { url: 'https://lh3.googleusercontent.com/o7133qRp70fjJZi5vqQrZ5B66FIbfiJ9ELWq3YaAQR05uVvIY0fcW4E4U33cBdzxpGR8O1Gy7_A7OakI=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
  {
    artistId: 'UCiItEIDWUhb8ySYckd8hZZQ',
    name: 'Lesty',
    thumbnails: [
      { url: 'https://lh3.googleusercontent.com/F6haU7UfLQ_LFRkD1BPoF_SB38x46bmqW8LxONV3Q91sW_SR5mJ1myOQPaB3AUB711KtqgmloGP9Alie=w400-h400-p-l90-rj', width: 400, height: 400 },
    ],
  },
];

const HomeOfflineTrackItem = memo(function HomeOfflineTrackItem({
  item,
  index,
  filteredOfflineTracks,
  isCurrent,
  isPlaying,
}: {
  item: OfflineTrack;
  index: number;
  filteredOfflineTracks: OfflineTrack[];
  isCurrent: boolean;
  isPlaying: boolean;
}) {
  const { playTrack, isLiked, toggleLike } = useMusic();
  const [imgError, setImgError] = useState(false);
  const track = item.track;
  const liked = Boolean(track?.videoId && isLiked(track.videoId));

  const thumb = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );
  const artistName = useMemo(
    () =>
      Array.isArray(track.artist)
        ? track.artist.map((a: any) => a.name).join(', ')
        : track.artist?.name || 'Unknown Artist',
    [track.artist]
  );

  const handlePlay = useCallback(() => {
    const allTracks = filteredOfflineTracks.map((t) => t.track);
    playTrack(track, allTracks, 'playlist', index);
  }, [playTrack, track, filteredOfflineTracks, index]);

  const tapGesture = useTapGesture({
    onTap: handlePlay,
    threshold: 8,
  });

  const handleLikePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
  }, []);

  const handleLikeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (track) {
        toggleLike(track);
      }
    },
    [track, toggleLike]
  );

  return (
    <div
      {...tapGesture}
      className={cn(
        "flex items-center py-2.5 px-3 md:py-2.5 md:px-3.5 rounded-xl transition-colors duration-150 cursor-pointer group select-none border-b border-white/[0.04] last:border-b-0",
        isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.06] active:bg-white/[0.10]"
      )}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="w-7 text-center text-xs md:text-sm text-white/40 group-hover:text-white/80 font-mono shrink-0 mr-1 tabular-nums">
        {isCurrent && isPlaying ? <Equalizer size="sm" /> : index + 1}
      </div>

      <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 shadow-sm bg-white/5 border border-white/[0.06]">
        {thumb && !imgError ? (
          <Image
            src={thumb}
            alt={track.name}
            fill
            sizes="48px"
            loading="lazy"
            decoding="async"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.08] text-white/30">
            <Music className="w-5 h-5" />
          </div>
        )}
        <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#1DB954] flex items-center justify-center shadow">
          <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />
        </div>
      </div>

      <div className="ml-3 sm:ml-3.5 flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          className={`font-semibold text-sm leading-snug tracking-tight ${
            isCurrent ? 'text-[#1DB954]' : 'text-white'
          }`}
        />
        <p className="text-xs text-white/60 truncate group-hover:text-white/80 transition-colors mt-0.5">{artistName}</p>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="text-[11px] sm:text-xs text-white/40 font-mono tabular-nums shrink-0 px-1 sm:px-2">
          {formatDuration(track.duration)}
        </span>

        <button
          type="button"
          onPointerDown={handleLikePointerDown}
          onClick={handleLikeClick}
          className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-all cursor-pointer rounded-lg hover:bg-white/10 active:scale-90 shrink-0"
          title={liked ? 'Hapus dari Lagu Disukai' : 'Sukai Lagu'}
          aria-label={liked ? 'Hapus dari Lagu Disukai' : 'Sukai Lagu'}
          style={{ touchAction: 'manipulation' }}
        >
          <Heart
            className={cn(
              'w-4 h-4 transition-transform duration-150',
              liked ? 'fill-[#1DB954] text-[#1DB954] scale-105' : 'hover:scale-110'
            )}
          />
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (e.button === 0) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            handlePlay();
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            isCurrent
              ? 'bg-[#1DB954] text-black opacity-100 shadow'
              : 'bg-white/10 text-white opacity-0 group-hover:opacity-100 hover:bg-[#1DB954] hover:text-black'
          }`}
          title="Putar"
        >
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        </button>
      </div>
    </div>
  );
});

const PopularArtistCard = memo(function PopularArtistCard({
  artist,
  index,
}: {
  artist: any;
  index: number;
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const artistName = artist.name || 'Artis';
  const thumb = useMemo(
    () => getHighResImage(artist.thumbnails?.[artist.thumbnails.length - 1]?.url, 400),
    [artist.thumbnails]
  );

  const artistId = artist?.artistId;
  const handleNavigate = useCallback(() => {
    if (artistId) {
      router.push(`/artist/${artistId}`);
    }
  }, [router, artistId]);

  const tapGesture = useTapGesture({
    onTap: handleNavigate,
    threshold: 8,
  });

  return (
    <div
      {...tapGesture}
      onMouseEnter={() => artist?.artistId && prefetchArtist(artist.artistId)}
      className="flex-none w-36 md:w-44 p-3 bg-white/[0.03] hover:bg-white/[0.08] rounded-2xl cursor-pointer group snap-start transition-colors duration-200 select-none shadow-sm flex flex-col items-center text-center border border-white/[0.04] hover:border-white/[0.08]"
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden shadow-xl bg-neutral-900 border border-white/10 mb-3 group-hover:scale-105 transition-transform duration-200 aspect-square">
        {thumb && !imgError ? (
          <Image
            src={thumb}
            alt={artistName}
            fill
            sizes="(max-width: 768px) 112px, 144px"
            priority={index < 3}
            loading={index < 3 ? undefined : 'lazy'}
            decoding="async"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 text-white/40">
            <User className="w-10 h-10 md:w-12 md:h-12" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <div className="w-full px-1">
        <span className="text-sm font-bold text-white truncate block group-hover:text-[#1DB954] transition-colors">
          {artistName}
        </span>
        <span className="text-xs text-white/50 block mt-0.5">Artis</span>
      </div>
    </div>
  );
});

const HorizontalScroll = dynamic(
  () => import('@/components/HorizontalScroll').then((m) => m.HorizontalScroll),
  {
    ssr: false,
    loading: () => (
      <div className="mb-6 px-4 animate-pulse">
        <div className="w-40 h-6 bg-white/10 rounded-lg mb-3" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-36 md:w-44 shrink-0 space-y-2">
              <div className="aspect-square bg-white/5 rounded-xl" />
              <div className="h-3.5 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    ),
  }
);

const MixedScroll = dynamic(
  () => import('@/components/MixedScroll').then((m) => m.MixedScroll),
  {
    ssr: false,
    loading: () => (
      <div className="mb-6 px-4 animate-pulse">
        <div className="w-40 h-6 bg-white/10 rounded-lg mb-3" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-48 md:w-56 shrink-0 h-24 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    ),
  }
);

const ONLINE_PILLS = ['Semua', 'Musik', 'Trending', 'Santai', 'Fokus', 'Pop', 'Rock', 'Akustik'];

function formatDuration(seconds?: number | string): string {
  if (!seconds) return '0:00';
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (isNaN(num)) return '0:00';
  const m = Math.floor(num / 60);
  const s = Math.floor(num % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Fisher-Yates (Knuth) In-Place / Non-Mutating Shuffle Algorithm
 * O(n) linear performance with unbiased distribution.
 * Guarantees a fresh, dynamic playlist arrangement on every load/visit.
 */
function shuffleArray<T>(array: T[]): T[] {
  if (!array || array.length <= 1) return array ? [...array] : [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

// In-memory raw pools cache for dynamic on-the-fly randomization without static locking
let homeCache: {
  rawPools: Record<string, any[]>;
  categoriesConfig: { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[];
} | null = null;

export default function Home() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const { playTrack } = useMusic();
  const currentVideoId = usePlayerStore((state) => state.currentTrack?.videoId);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const history = usePlayerStore((state) => state.history);

  const isQuickPicksScrollingRef = useRef(false);
  const quickPicksScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleQuickPicksScroll = useCallback(() => {
    isQuickPicksScrollingRef.current = true;
    if (quickPicksScrollTimeoutRef.current) clearTimeout(quickPicksScrollTimeoutRef.current);
    quickPicksScrollTimeoutRef.current = setTimeout(() => {
      isQuickPicksScrollingRef.current = false;
    }, 150);
  }, []);

  const handleQuickPicksClickCapture = useCallback((e: React.MouseEvent) => {
    if (isQuickPicksScrollingRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // -------------------------------------------------------------
  // Offline State (IndexedDB)
  // -------------------------------------------------------------
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>(() =>
    typeof window !== 'undefined' ? db.getCachedOfflineTracks() : []
  );
  const [offlineLoading, setOfflineLoading] = useState(() =>
    typeof window !== 'undefined' ? db.getCachedOfflineTracks().length === 0 : true
  );
  const [searchQuery, setSearchQuery] = useState('');

  // -------------------------------------------------------------
  // Online State (API Stream & Shelves)
  // -------------------------------------------------------------
  const [heroTracks, setHeroTracks] = useState<Track[]>([]);
  const [speedDialTracks, setSpeedDialTracks] = useState<Track[]>([]);
  const [quickPicksTracks, setQuickPicksTracks] = useState<Track[]>([]);
  const [communityPlaylists, setCommunityPlaylists] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [categories, setCategories] = useState<
    { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[]
  >([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [activeOnlineFilter, setActiveOnlineFilter] = useState<string>('Semua');
  const [filterData, setFilterData] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingFilter, setLoadingFilter] = useState(false);

  /**
   * Applies dynamic Fisher-Yates shuffle across all music shelves.
   * Ensures instant, unbiased randomization without hydration mismatch.
   */
  const applyRandomizedShelves = useCallback(
    (
      pools: Record<string, any[]>,
      catsConfig: { key: string; title: string; type: 'song' | 'mixed'; items?: any[] }[]
    ) => {
      const heroes = shuffleArray(pools['hero'] || []).slice(0, 4);
      const dials = shuffleArray(pools['speedDial'] || []).slice(0, 30);
      const picks = shuffleArray(pools['quickPicks'] || []).slice(0, 16);
      const playlists = shuffleArray(pools['community'] || []).slice(0, 10);
      const rawArts = (pools['artists'] || []).filter(
        (a: any) => a && (a.artistId || a.id) && a.name && a.type !== 'ALBUM' && a.type !== 'SONG'
      );
      const combinedArts = rawArts.length >= 6 ? rawArts : [...rawArts, ...CURATED_POPULAR_ARTISTS];
      const arts = shuffleArray(combinedArts).slice(0, 14);

      const cats = catsConfig.map((cat) => {
        const poolItems = pools[cat.key] || cat.items || [];
        return {
          ...cat,
          type: cat.type || ('song' as const),
          items: shuffleArray(poolItems).slice(0, 12),
        };
      });

      setHeroTracks(heroes);
      setSpeedDialTracks(dials);
      setQuickPicksTracks(picks);
      setCommunityPlaylists(playlists);
      setArtists(arts);
      setCategories(cats);
    },
    []
  );

  const handleRandomizeHome = useCallback(() => {
    const pools = homeCache || getHomeCache();
    if (pools?.rawPools && pools.categoriesConfig?.length > 0) {
      applyRandomizedShelves(pools.rawPools, pools.categoriesConfig);
      toast.success('Rekomendasi Beranda diacak ulang!');
    }
  }, [applyRandomizedShelves]);



  // -------------------------------------------------------------
  // 1. Load Downloaded Tracks from IndexedDB
  // -------------------------------------------------------------
  const loadDownloadedTracks = useCallback(async () => {
    try {
      setOfflineLoading(true);
      const items = await db.getOfflineTracks();
      const sorted = (items || []).sort(
        (a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)
      );
      setOfflineTracks(sorted);
    } catch (err) {
      console.warn('Failed to load downloaded tracks on Home:', err);
    } finally {
      setOfflineLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadDownloadedTracks();

    // Auto-sync when window regains focus in case user downloaded/deleted a track
    const handleSync = () => {
      db.getOfflineTracks()
        .then((items) => {
          if (!mounted) return;
          const sorted = (items || []).sort(
            (a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)
          );
          setOfflineTracks(sorted);
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleSync);
    return () => {
      mounted = false;
      window.removeEventListener('focus', handleSync);
    };
  }, [loadDownloadedTracks]);

  // -------------------------------------------------------------
  // 2. Load Online Data (when online)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const fetchHomeData = async () => {
      try {
        const queries = [
          { key: 'hero', q: 'top hits indonesia viral', type: 'song' },
          { key: 'speedDial', q: 'lagu hits viral 2024', type: 'song' },
          { key: 'quickPicks', q: 'pop indonesia hits terbaru', type: 'song' },
          { key: 'community', q: 'chill acoustic indonesia', type: 'playlist' },
          { key: 'artists', q: 'artis indonesia populer', type: 'artist' },
          { key: 'cat0', title: 'Trending Hari Ini', q: 'lagu indonesia hits terbaru', type: 'song' },
          { key: 'cat1', title: 'Rilis Terbaru Pilihan', q: 'lagu pop indonesia rilis terbaru', type: 'song' },
          { key: 'cat2', title: 'Top 50 Indonesia', q: 'top 50 indonesia playlist update', type: 'song' },
          { key: 'cat3', title: 'Viral di TikTok', q: 'lagu fyp tiktok viral', type: 'song' },
          { key: 'cat4', title: 'Santai Bersama Akustik', q: 'lagu akustik cafe santai', type: 'song' },
          { key: 'cat5', title: 'Rock & Alternatif Terbaik', q: 'lagu rock indonesia terbaik', type: 'song' },
        ];

        const chunkResults = await Promise.all(
          queries.map(async ({ key, title, q, type }) => {
            try {
              const url = type
                ? `/api/search?q=${encodeURIComponent(q)}&type=${type}`
                : `/api/search?q=${encodeURIComponent(q)}`;
              const res = await fetch(url);
              if (!res.ok) return { key, title, data: [] };
              const raw = await res.json();
              const data = Array.isArray(raw) ? raw : raw?.result || [];
              return { key, title, data };
            } catch {
              return { key, title, data: [] };
            }
          })
        );

        if (cancelled) return;

        const rawPools: Record<string, any[]> = {};
        const catsConfig: { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[] = [];

        chunkResults.forEach(({ key, title, data }) => {
          if (!data || data.length === 0) return;
          rawPools[key] = data;
          if (key.startsWith('cat') && title) {
            catsConfig.push({ key, title, type: 'song', items: data });
          }
        });

        homeCache = {
          rawPools,
          categoriesConfig: catsConfig,
        };
        setHomeCache(homeCache);

        applyRandomizedShelves(rawPools, catsConfig);
      } catch (error) {
        console.warn('Failed to fetch home data:', error);
      } finally {
        if (!cancelled) setOnlineLoading(false);
      }
    };

    const cachedHome = homeCache || getHomeCache();
    if (cachedHome?.rawPools && cachedHome.categoriesConfig?.length > 0) {
      homeCache = cachedHome;
      applyRandomizedShelves(cachedHome.rawPools, cachedHome.categoriesConfig);
      setOnlineLoading(false);
    } else {
      fetchHomeData();
    }

    return () => {
      cancelled = true;
    };
  }, [isOnline, applyRandomizedShelves]);

  // Online Filter Query handling
  useEffect(() => {
    if (!isOnline || activeOnlineFilter === 'Semua') {
      setFilterData([]);
      return;
    }

    let cancelled = false;
    const fetchFilterData = async () => {
      setLoadingFilter(true);
      try {
        const queries = [
          { title: `Hits ${activeOnlineFilter} Pilihan`, q: `top ${activeOnlineFilter} songs indonesia` },
          { title: `Suasana ${activeOnlineFilter}`, q: `${activeOnlineFilter} vibes mood songs` },
        ];

        const results = [];
        for (const { title, q } of queries) {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=song`);
          if (res.ok) {
            const raw = await res.json();
            const data = (Array.isArray(raw) ? raw : raw?.result || []) as Track[];
            results.push({ title, tracks: shuffleArray(data).slice(0, 12) });
          }
        }

        if (!cancelled) setFilterData(results);
      } catch (error) {
        console.warn('Filter fetch error:', error);
      } finally {
        if (!cancelled) setLoadingFilter(false);
      }
    };

    fetchFilterData();
    return () => {
      cancelled = true;
    };
  }, [activeOnlineFilter, isOnline]);

  // Online Quick Play Grid (History + SpeedDial)
  const onlineQuickGridItems = useMemo(() => {
    const list: Track[] = [];
    history.slice(0, 8).forEach((h) => {
      if (!list.some((t) => t.videoId === h.track.videoId)) {
        list.push(h.track);
      }
    });
    heroTracks.concat(speedDialTracks).forEach((t) => {
      if (list.length < 8 && !list.some((x) => x.videoId === t.videoId)) {
        list.push(t);
      }
    });
    return list.slice(0, 8);
  }, [history, heroTracks, speedDialTracks]);

  // -------------------------------------------------------------
  // 3. Offline Mode Helpers (Filtered tracks)
  // -------------------------------------------------------------
  const filteredOfflineTracks = useMemo(() => {
    let result = [...offlineTracks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        const title = item.track?.name?.toLowerCase() || '';
        const artist = Array.isArray(item.track?.artist)
          ? item.track.artist.map((a: any) => a.name).join(' ').toLowerCase()
          : item.track?.artist?.name?.toLowerCase() || '';
        return title.includes(q) || artist.includes(q);
      });
    }

    return result;
  }, [offlineTracks, searchQuery]);

  const handlePlayAllOffline = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = filteredOfflineTracks.map((item) => item.track);
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  const handleShufflePlayOffline = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = [...filteredOfflineTracks.map((item) => item.track)];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar acak ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  const handlePlayAllQuickPicks = useCallback(() => {
    if (quickPicksTracks.length > 0) {
      playTrack(quickPicksTracks[0], quickPicksTracks, 'playlist');
    }
  }, [quickPicksTracks, playTrack]);

  // =========================================================================
  // VIEW RENDERER: Dynamically Switch based on isOnline (No Full-Screen Blocker)
  // =========================================================================

  return (
    <main className="min-h-screen pt-4 pb-28 px-4 md:px-8 max-w-7xl mx-auto select-none">
      {/* 1. OFFLINE VIEW HEADER (When Offline) */}
      {!isOnline && (
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pt-1">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate">
              Lagu Unduhan
            </h1>
            {!offlineLoading && offlineTracks.length > 0 && (
              <span className="text-xs text-white/40 font-medium shrink-0">
                {filteredOfflineTracks.length} lagu
              </span>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {filteredOfflineTracks.length > 0 && (
              <>
                <button
                  onClick={handlePlayAllOffline}
                  className="px-3.5 py-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-xs rounded-full flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm shrink-0"
                  title="Putar Semua"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span className="inline">Putar Semua</span>
                </button>
                <button
                  onClick={handleShufflePlayOffline}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-full border border-white/10 transition-colors cursor-pointer shrink-0"
                  title="Putar Acak"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <Link
              href="/history"
              prefetch={false}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10 shrink-0"
              title="Riwayat Pemutaran"
            >
              <History className="w-4 h-4" />
            </Link>
            <Link
              href="/download"
              prefetch={false}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10 relative shrink-0"
              title="Kelola Unduhan"
            >
              <DownloadCloud className="w-4 h-4" />
              {offlineTracks.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1DB954] text-black text-[10px] font-black flex items-center justify-center">
                  {offlineTracks.length > 99 ? '99+' : offlineTracks.length}
                </span>
              )}
            </Link>
            <Link
              href="/settings"
              prefetch={false}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10 shrink-0"
              title="Pengaturan"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </header>
      )}

      {/* 2. DYNAMIC VIEW SWITCHER */}
      {isOnline ? (
        /* ========================================================================= */
        /* ONLINE VIEW: Clean Direct Categories & Music Shelves (No Greeting Header) */
        /* ========================================================================= */
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Online Category Pills & Top Utility Navigation */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center overflow-x-auto no-scrollbar gap-2 snap-x snap-mandatory py-1 flex-1 min-w-0">
              {ONLINE_PILLS.map((pill) => {
                const isActive = activeOnlineFilter === pill;
                return (
                  <button
                    key={pill}
                    onClick={() => setActiveOnlineFilter(pill)}
                    style={{ touchAction: 'manipulation' }}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all select-none snap-start cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-white text-black shadow-md'
                        : 'bg-white/10 hover:bg-white/15 text-white/80 hover:text-white border border-white/5'
                    }`}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRandomizeHome}
                className="p-2.5 bg-white/5 hover:bg-white/10 active:scale-95 text-white/80 hover:text-white rounded-full transition-all cursor-pointer border border-white/10"
                title="Acak Rekomendasi Beranda"
                style={{ touchAction: 'manipulation' }}
              >
                <Shuffle className="w-4 h-4 text-[#1DB954]" />
              </button>
              <Link
                href="/history"
                prefetch={true}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10"
                title="Riwayat Pemutaran"
              >
                <History className="w-4 h-4" />
              </Link>
              <Link
                href="/download"
                prefetch={true}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10 relative"
                title="Kelola Unduhan"
              >
                <DownloadCloud className="w-4 h-4" />
                {offlineTracks.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1DB954] text-black text-[10px] font-black flex items-center justify-center">
                    {offlineTracks.length > 99 ? '99+' : offlineTracks.length}
                  </span>
                )}
              </Link>
              <Link
                href="/settings"
                prefetch={true}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10"
                title="Pengaturan"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Quick Play 6-8 Grid */}
          {activeOnlineFilter === 'Semua' && onlineQuickGridItems.length > 0 && (
            <section className="mb-8">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3">
                {onlineQuickGridItems.map((track, idx) => (
                  <HomeQuickGridItem
                    key={`quick-grid-${track.videoId}-${idx}`}
                    track={track}
                    idx={idx}
                    onlineQuickGridItems={onlineQuickGridItems}
                    isCurrent={currentVideoId === track.videoId}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Online Main Dashboard Content Area */}
          {onlineLoading || (activeOnlineFilter !== 'Semua' && loadingFilter) ? (
            <HomeSkeleton />
          ) : activeOnlineFilter !== 'Semua' ? (
            <div className="space-y-8">
              {filterData.map((cat, i) => (
                <HorizontalScroll key={`filter-${cat.title}-${i}`} title={cat.title} tracks={cat.tracks} isFirstShelf={i === 0} />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Quick Picks Shelf */}
              {quickPicksTracks.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                        Pilihan Cepat
                      </h2>
                      <p className="text-xs text-[#b3b3b3] mt-0.5">Dipilih khusus sesuai selera musik Anda</p>
                    </div>
                    <button
                      onClick={handlePlayAllQuickPicks}
                      className="text-xs font-bold text-white/90 hover:text-white border border-white/20 rounded-full px-3.5 py-1.5 hover:border-white hover:scale-105 transition-all cursor-pointer"
                    >
                      Putar Semua
                    </button>
                  </div>

                  <div
                    onScroll={handleQuickPicksScroll}
                    onClickCapture={handleQuickPicksClickCapture}
                    className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth"
                  >
                    {Array.from({ length: Math.ceil(quickPicksTracks.length / 4) }).map((_, i) => {
                      const chunk = quickPicksTracks.slice(i * 4, i * 4 + 4);
                      return (
                        <div
                          key={`quickpicks-chunk-${i}`}
                          className="w-[85vw] sm:w-[380px] shrink-0 snap-start flex flex-col gap-1.5"
                        >
                          {chunk.map((track, j) => (
                            <HomeQuickPickItem
                              key={`quickpicks-${track.videoId}-${j}`}
                              track={track}
                              quickPicksTracks={quickPicksTracks}
                              chunkIndex={i}
                              itemIndex={j}
                              isCurrent={currentVideoId === track.videoId}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Downloaded Songs Shelf (accessible even while Online!) */}
              {offlineTracks.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                        Lagu Terunduh (Offline Ready)
                      </h2>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30">
                        {offlineTracks.length} Lagu
                      </span>
                    </div>
                    <Link
                      href="/download"
                      prefetch={false}
                      className="text-xs font-bold text-white/80 hover:text-white transition-colors"
                    >
                      Lihat Semua
                    </Link>
                  </div>
                  <HorizontalScroll
                    title=""
                    tracks={offlineTracks.slice(0, 15).map((it) => it.track)}
                  />
                </section>
              )}

              {/* Popular Artists Shelf */}
              {artists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                      Artis Terpopuler
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth">
                    {artists.map((artist, i) => (
                      <PopularArtistCard
                        key={`artist-${artist.artistId || i}-${i}`}
                        artist={artist}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Categorized Shelves */}
              {categories.map((cat, i) =>
                cat.type === 'mixed' ? (
                  <MixedScroll key={`cat-mixed-${cat.key || i}`} title={cat.title} items={cat.items} />
                ) : (
                  <HorizontalScroll key={`cat-song-${cat.key || i}`} title={cat.title} tracks={cat.items} isFirstShelf={i === 0 && quickPicksTracks.length === 0} />
                )
              )}

              {/* Community Playlists */}
              {communityPlaylists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                      Playlist Komunitas
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth">
                    {communityPlaylists.map((playlist, i) => {
                      const id = playlist.playlistId;
                      if (!id) return null;
                      return <CommunityPlaylistCard key={`community-playlist-${id}-${i}`} playlistId={id} />;
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* OFFLINE VIEW: 100% Focused on Downloaded Tracks List (Clean & Minimalist)  */
        /* ========================================================================= */
        <div className="space-y-4 animate-in fade-in duration-300">
          {offlineLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-white/[0.03] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : offlineTracks.length === 0 ? (
            /* Clean Minimalist Empty State */
            <div className="py-20 text-center text-xs text-white/40">
              Belum ada lagu terunduh. Lagu yang disimpan saat online akan otomatis muncul di sini.
            </div>
          ) : (
            /* Total Focus on Downloaded Track List */
            <>
              {/* Compact Search Bar if user has multiple tracks */}
              {offlineTracks.length > 4 && (
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari lagu unduhan..."
                    className="w-full max-w-xs bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/10 rounded-full py-1.5 pl-9 pr-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              )}

              {filteredOfflineTracks.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  Tidak ditemukan lagu offline dengan kata kunci &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredOfflineTracks.map((item, index) => (
                    <HomeOfflineTrackItem
                      key={`offline-track-${item.track.videoId}-${index}`}
                      item={item}
                      index={index}
                      filteredOfflineTracks={filteredOfflineTracks}
                      isCurrent={currentVideoId === item.track.videoId}
                      isPlaying={isPlaying}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
