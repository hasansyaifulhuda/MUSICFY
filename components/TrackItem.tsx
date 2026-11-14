'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Track, usePlayerStore } from '@/lib/store';
import { MoreHorizontal, Trash2, Play, Heart, Music } from 'lucide-react';
import Image from 'next/image';
import { getHighResImage, cn } from '@/lib/utils';
import { MarqueeText } from './MarqueeText';
import { Equalizer } from './Equalizer';
import { useContextMenuStore } from '@/lib/contextMenuStore';
import { useTapGesture } from '@/hooks/useTapGesture';
import { useMusic } from '@/context/MusicContext';

interface TrackItemProps {
  track: Track;
  queue?: Track[];
  index?: number;
  onRemove?: (track: Track) => void;
}

function formatTrackDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const TrackItem = memo(function TrackItem({
  track,
  queue,
  index,
  onRemove,
}: TrackItemProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === track.videoId);
  const isPlayingCurrent = usePlayerStore(
    (state) => state.isPlaying && state.currentTrack?.videoId === track.videoId
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const { isLiked, toggleLike } = useMusic();
  const [imgError, setImgError] = useState(false);

  const liked = Boolean(track?.videoId && isLiked(track.videoId));

  const thumbnail = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );

  const artistName = useMemo(() => {
    if (Array.isArray(track.artist)) {
      return track.artist.map((a: any) => (typeof a === 'string' ? a : a.name)).join(', ');
    }
    return (track.artist as any)?.name || 'Unknown Artist';
  }, [track.artist]);

  const executePlay = useCallback(() => {
    playTrack(track, queue, 'playlist', index);
  }, [playTrack, track, queue, index]);

  const handleLongPress = useCallback(
    (coords: { x: number; y: number }) => {
      openContextMenu(track, coords);
    },
    [openContextMenu, track]
  );

  const tapGesture = useTapGesture({
    onTap: executePlay,
    onLongPress: handleLongPress,
    threshold: 8,
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(track, { x: e.clientX, y: e.clientY });
    },
    [openContextMenu, track]
  );

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

  const handleRemovePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      if (onRemove) onRemove(track);
    },
    [onRemove, track]
  );

  return (
    <div
      className={cn(
        "flex items-center py-2.5 px-3 md:py-2.5 md:px-3.5 hover:bg-white/[0.06] active:bg-white/[0.10] rounded-xl cursor-pointer group transition-colors duration-150 select-none content-auto gpu-accelerated border-b border-white/[0.04] last:border-b-0",
        isCurrent && "bg-white/[0.05]"
      )}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
      {...tapGesture}
      onContextMenu={handleContextMenu}
    >
      {index !== undefined && (
        <span className="w-7 text-center text-xs md:text-sm font-medium text-white/40 group-hover:text-white/80 shrink-0 mr-1 tabular-nums">
          {index + 1}
        </span>
      )}

      <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 shadow-sm bg-white/5 border border-white/[0.06]">
        {thumbnail && !imgError ? (
          <Image
            src={thumbnail}
            alt={track.name}
            fill
            sizes="(max-width: 640px) 44px, 48px"
            priority={index !== undefined && index < 4}
            loading={index !== undefined && index < 4 ? undefined : 'lazy'}
            decoding="async"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.08] text-white/30">
            <Music className="w-5 h-5" />
          </div>
        )}
        {isPlayingCurrent ? (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
            <Equalizer size="sm" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
          </div>
        )}
      </div>

      <div className="ml-3 sm:ml-3.5 flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          enabled={isCurrent}
          className={`font-semibold text-sm leading-snug tracking-tight ${
            isCurrent ? 'text-[#1DB954]' : 'text-white'
          }`}
        />
        <div className="flex items-center gap-1.5 mt-0.5">
          {track.isExplicit && (
            <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded font-bold text-white shrink-0">
              E
            </span>
          )}
          <span className="text-xs text-white/60 group-hover:text-white/80 transition-colors truncate">
            {artistName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {track.duration ? (
          <span className="text-[11px] sm:text-xs text-white/40 font-mono tabular-nums shrink-0 px-1 sm:px-2">
            {formatTrackDuration(track.duration)}
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

        {onRemove && (
          <button
            type="button"
            className="p-1.5 sm:p-2 text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer rounded-lg hover:bg-white/10 shrink-0"
            onPointerDown={handleRemovePointerDown}
            onClick={(e) => e.stopPropagation()}
            title="Hapus"
            aria-label="Hapus dari antrean"
            style={{ touchAction: 'manipulation' }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 shrink-0"
          onPointerDown={handleOptionsPointerDown}
          onClick={(e) => e.stopPropagation()}
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
