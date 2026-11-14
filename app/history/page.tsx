'use client';

import { ArrowLeft, Search, Trash2, X, AlertCircle, Clock, Play, Heart, Music } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePlayerStore, Track } from '@/lib/store';
import Image from 'next/image';
import { getHighResImage, cn } from '@/lib/utils';
import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { MarqueeText } from '@/components/MarqueeText';
import { useTapGesture } from '@/hooks/useTapGesture';
import { useMusic } from '@/context/MusicContext';

const HistoryTrackItem = memo(function HistoryTrackItem({
  item,
  index,
  filteredTracks,
  onRemove,
}: {
  item: { track: Track; playedAt: number };
  index: number;
  filteredTracks: Track[];
  onRemove: (videoId: string, playedAt: number) => void;
}) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === item.track?.videoId);
  const { isLiked, toggleLike } = useMusic();
  const [imgError, setImgError] = useState(false);
  const track = item.track;

  const liked = Boolean(track?.videoId && isLiked(track.videoId));

  const artistName = useMemo(
    () =>
      Array.isArray(track.artist)
        ? track.artist.map((a: any) => a.name).join(', ')
        : track.artist?.name || 'Unknown Artist',
    [track.artist]
  );
  const thumbnail = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlay = useCallback(() => {
    playTrack(track, filteredTracks);
  }, [playTrack, track, filteredTracks]);

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
        "flex items-center py-2.5 px-3 md:py-2.5 md:px-3.5 rounded-xl hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors duration-150 group cursor-pointer border-b border-white/[0.04] last:border-b-0",
        isCurrent && "bg-white/[0.05]"
      )}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 shadow-sm bg-white/5 border border-white/[0.06]">
        {thumbnail && !imgError ? (
          <Image
            src={thumbnail}
            alt={track.name}
            fill
            sizes="48px"
            priority={index < 4}
            loading={index < 4 ? undefined : 'lazy'}
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
            {formatDuration(track.duration)}
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
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.stopPropagation();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(track.videoId, item.playedAt);
          }}
          className="p-1.5 sm:p-2 text-white/40 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
          title="Hapus dari riwayat"
          aria-label="Hapus dari riwayat"
          style={{ touchAction: 'manipulation' }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export default function HistoryPage() {
  const router = useRouter();
  const history = usePlayerStore((state) => state.history);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const clearHistory = usePlayerStore((state) => state.clearHistory);
  const removeFromHistory = usePlayerStore((state) => state.removeFromHistory);

  const [mounted, setMounted] = useState(() => typeof window !== 'undefined');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter history based on search query
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history.filter((item) => item?.track?.name);
    const q = searchQuery.toLowerCase();
    return history.filter((item) => {
      if (!item?.track?.name) return false;
      const title = item.track.name.toLowerCase();
      const artist = Array.isArray(item.track.artist)
        ? item.track.artist.map((a) => a?.name).filter(Boolean).join(' ').toLowerCase()
        : item.track.artist?.name?.toLowerCase() || '';
      return title.includes(q) || artist.includes(q);
    });
  }, [history, searchQuery]);

  if (!mounted) return null;

  // Group history by Today, This Week, and Older
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const todayHistory = filteredHistory.filter((item) => new Date(item.playedAt) >= today);
  const thisWeekHistory = filteredHistory.filter((item) => {
    const date = new Date(item.playedAt);
    return date >= startOfWeek && date < today;
  });
  const olderHistory = filteredHistory.filter((item) => new Date(item.playedAt) < startOfWeek);

  return (
    <main className="min-h-screen pb-32 max-w-4xl mx-auto px-4 pt-4">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-20 bg-[#121212]/90 backdrop-blur-xl py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Riwayat Pemutaran</h1>
            <p className="text-xs text-white/50">{history.length} lagu diputar</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Toggle */}
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery('');
            }}
            className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            title="Cari riwayat"
            aria-label="Cari riwayat"
          >
            {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          {/* Clear History Button */}
          {history.length > 0 && (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="px-3.5 py-1.5 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-300 rounded-full text-xs font-semibold transition-all border border-white/10 hover:border-red-500/30 flex items-center gap-1.5 cursor-pointer"
              title="Hapus semua riwayat"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input Box */}
      {showSearch && (
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari lagu atau artis di riwayat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#1DB954] transition-colors"
          />
        </div>
      )}

      {/* Grouped History List */}
      <div className="mt-6 space-y-8">
        {todayHistory.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white px-2 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1DB954]" />
              <span>Hari ini</span>
            </h2>
            <div className="space-y-0.5">
              {todayHistory.map((item, index) => (
                <HistoryTrackItem
                  key={`${item.playedAt}-${item.track?.videoId}`}
                  item={item}
                  index={index}
                  filteredTracks={filteredHistory.map((h) => h.track)}
                  onRemove={removeFromHistory}
                />
              ))}
            </div>
          </div>
        )}

        {thisWeekHistory.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white px-2 mb-2">Minggu ini</h2>
            <div className="space-y-0.5">
              {thisWeekHistory.map((item, index) => (
                <HistoryTrackItem
                  key={`${item.playedAt}-${item.track?.videoId}`}
                  item={item}
                  index={index}
                  filteredTracks={filteredHistory.map((h) => h.track)}
                  onRemove={removeFromHistory}
                />
              ))}
            </div>
          </div>
        )}

        {olderHistory.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white px-2 mb-2">Lebih lama</h2>
            <div className="space-y-0.5">
              {olderHistory.map((item, index) => (
                <HistoryTrackItem
                  key={`${item.playedAt}-${item.track?.videoId}`}
                  item={item}
                  index={index}
                  filteredTracks={filteredHistory.map((h) => h.track)}
                  onRemove={removeFromHistory}
                />
              ))}
            </div>
          </div>
        )}

        {filteredHistory.length === 0 && (
          <div className="text-center py-20 text-white/50 space-y-3">
            <Clock className="w-12 h-12 mx-auto opacity-30 text-white" />
            <p className="text-lg font-medium text-white/80">
              {searchQuery ? 'Tidak ada lagu yang cocok dengan pencarian' : 'Belum ada riwayat pemutaran'}
            </p>
            <p className="text-xs text-white/40">
              Lagu yang Anda putar akan otomatis tersimpan di sini.
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Clearing All History */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#242424] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Hapus Semua Riwayat?</h3>
              <p className="text-xs text-white/60 mt-1">
                Tindakan ini akan menghapus seluruh daftar riwayat lagu yang telah Anda putar.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  clearHistory();
                  setShowConfirmClear(false);
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold transition-colors shadow-lg"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
