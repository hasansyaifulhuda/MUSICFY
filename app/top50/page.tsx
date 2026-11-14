'use client';

import { ArrowLeft, Search, Play, Shuffle, X, Clock, Heart, MoreHorizontal, Music } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePlayerStore, Track } from '@/lib/store';
import Image from 'next/image';
import { getHighResImage, cn } from '@/lib/utils';
import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { MarqueeText } from '@/components/MarqueeText';
import { useTapGesture } from '@/hooks/useTapGesture';
import { useMusic } from '@/context/MusicContext';
import { useContextMenuStore } from '@/lib/contextMenuStore';

const Top50TrackItem = memo(function Top50TrackItem({
  track,
  index,
  filteredTracks,
}: {
  track: Track;
  index: number;
  filteredTracks: Track[];
}) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === track.videoId);
  const isPlayingCurrent = usePlayerStore(
    (state) => state.isPlaying && state.currentTrack?.videoId === track.videoId
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const { isLiked, toggleLike } = useMusic();
  const [imgError, setImgError] = useState(false);

  const liked = Boolean(track?.videoId && isLiked(track.videoId));

  const artistName = useMemo(
    () =>
      Array.isArray(track.artist)
        ? track.artist.map((a: any) => a.name).join(', ')
        : track.artist?.name || 'Unknown Artist',
    [track.artist]
  );
  const thumb = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );

  const handlePlay = useCallback(() => {
    playTrack(track, filteredTracks, 'playlist');
  }, [playTrack, track, filteredTracks]);

  const handleLongPress = useCallback(
    (coords: { x: number; y: number }) => {
      openContextMenu(track, coords);
    },
    [openContextMenu, track]
  );

  const tapGesture = useTapGesture({
    onTap: handlePlay,
    onLongPress: handleLongPress,
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

  const handleOptionsPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openContextMenu(track, { x: rect.left - 140, y: rect.bottom + 6 });
    },
    [openContextMenu, track]
  );

  return (
    <div
      {...tapGesture}
      className={cn(
        "flex items-center py-2.5 px-3 md:py-2.5 md:px-3.5 rounded-xl hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors duration-150 cursor-pointer group select-none border-b border-white/[0.04] last:border-b-0",
        isCurrent && "bg-white/[0.05]"
      )}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="w-7 text-center text-white/40 group-hover:text-white/80 font-mono text-xs md:text-sm shrink-0 mr-1 tabular-nums">
        {isPlayingCurrent ? (
          <div className="flex gap-0.5 items-end h-3 justify-center">
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_0ms]" />
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_200ms]" />
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_400ms]" />
          </div>
        ) : (
          index + 1
        )}
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
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-4 h-4 fill-white text-white ml-0.5" />
        </div>
      </div>

      <div className="ml-3 sm:ml-3.5 flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          className={`font-semibold text-sm leading-snug tracking-tight transition-colors ${
            isCurrent ? 'text-[#1DB954]' : 'text-white group-hover:text-white'
          }`}
        />
        <p className="text-xs text-white/60 truncate group-hover:text-white/80 transition-colors mt-0.5">
          {artistName}
        </p>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {track.duration ? (
          <span className="text-[11px] sm:text-xs text-white/40 font-mono tabular-nums shrink-0 px-1 sm:px-2">
            {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
          </span>
        ) : null}

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
          onPointerDown={handleOptionsPointerDown}
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 shrink-0"
          title="Opsi"
          aria-label="Opsi lagu"
          style={{ touchAction: 'manipulation' }}
        >
          <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
});

export default function Top50Page() {
  const router = useRouter();
  const history = usePlayerStore((state) => state.history);
  const playCounts = usePlayerStore((state) => state.playCounts);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate top 50 tracks
  const uniqueTracks = useMemo(() => {
    const valid = history.filter((item) => item?.track?.videoId);
    return Array.from(new Map(valid.map((item) => [item.track.videoId, item.track])).values());
  }, [history]);

  const topTracks = useMemo(() => {
    return uniqueTracks
      .map((track) => ({
        track,
        count: (track?.videoId && playCounts[track.videoId]) || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((item) => item.track);
  }, [uniqueTracks, playCounts]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return topTracks;
    const q = searchQuery.toLowerCase();
    return topTracks.filter((t) => {
      if (!t?.name) return false;
      const art = Array.isArray(t.artist)
        ? t.artist.map((a) => a?.name).filter(Boolean).join(' ').toLowerCase()
        : t.artist?.name?.toLowerCase() || '';
      return t.name.toLowerCase().includes(q) || art.includes(q);
    });
  }, [topTracks, searchQuery]);

  if (!mounted) return null;

  const totalDuration = topTracks.reduce((acc, track) => acc + (track.duration || 0), 0);
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h} jam ${m} mnt`;
    return `${m} mnt ${s} dtk`;
  };

  const coverImage =
    topTracks.length > 0
      ? getHighResImage(topTracks[0].thumbnails?.[topTracks[0].thumbnails.length - 1]?.url, 800) || '/icon.png'
      : '/icon.png';

  const handleShufflePlay = () => {
    if (topTracks.length === 0) return;
    const shuffled = [...topTracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, 'playlist');
  };

  return (
    <main className="min-h-screen pb-32 max-w-5xl mx-auto px-4 md:px-8 pt-4">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-[#121212]/90 backdrop-blur-xl py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Top 50 Teratas Saya</h1>
        </div>
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (showSearch) setSearchQuery('');
          }}
          className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
          title="Cari lagu"
        >
          {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {/* Search Input Box */}
      {showSearch && (
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari lagu di Top 50..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#1DB954] transition-colors"
          />
        </div>
      )}

      {/* Playlist Hero Banner */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mt-6 mb-8 p-4 bg-gradient-to-b from-white/10 to-transparent rounded-2xl">
        <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden shadow-2xl shrink-0 bg-black/40">
          <Image src={coverImage} alt="Top 50" fill priority sizes="224px" className="object-cover" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">Daftar Putar Pribadi</span>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-1 mb-2">
            Top 50 Teratas
          </h2>
          <p className="text-[#b3b3b3] text-xs md:text-sm mb-4">
            Lagu yang paling sering Anda putar sepanjang waktu • {topTracks.length} lagu • {formatDuration(totalDuration)}
          </p>

          <div className="flex items-center justify-center md:justify-start gap-4">
            <button
              className="w-14 h-14 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
              onClick={() => topTracks.length > 0 && playTrack(topTracks[0], topTracks, 'playlist')}
              title="Putar Semua"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>
            <button
              onClick={handleShufflePlay}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Putar Acak"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="space-y-1">
        {filteredTracks.map((track, index) => (
          <Top50TrackItem
            key={track.videoId + index}
            track={track}
            index={index}
            filteredTracks={filteredTracks}
          />
        ))}

        {filteredTracks.length === 0 && (
          <div className="text-center py-16 text-white/50 space-y-2">
            <Clock className="w-12 h-12 mx-auto opacity-30" />
            <p className="text-base font-medium">
              {searchQuery ? 'Tidak ada lagu yang cocok dengan pencarian' : 'Belum ada lagu yang sering diputar'}
            </p>
            <p className="text-xs text-white/40">
              Putar lagu favorit Anda beberapa kali untuk melihat peringkatnya di sini.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
