'use client';

import React, { memo, useCallback } from 'react';
import { MoreHorizontal, Heart } from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { MarqueeText } from '@/components/MarqueeText';
import { useTapGesture } from '@/hooks/useTapGesture';
import { useMusic } from '@/context/MusicContext';
import { useContextMenuStore } from '@/lib/contextMenuStore';
import { cn } from '@/lib/utils';

interface AlbumTrackClientProps {
  track: any;
  index: number;
  album: any;
  artistName: string;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const AlbumTrackClient = memo(function AlbumTrackClient({
  track,
  index,
  album,
  artistName,
}: AlbumTrackClientProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === track.videoId);
  const isPlayingCurrent = usePlayerStore(
    (state) => state.isPlaying && state.currentTrack?.videoId === track.videoId
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const { isLiked, toggleLike } = useMusic();

  const liked = Boolean(track?.videoId && isLiked(track.videoId));

  const handlePlay = useCallback(() => {
    playTrack?.(track, album?.songs || [], 'playlist', index);
  }, [playTrack, track, album?.songs, index]);

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
        "flex items-center py-2.5 px-3 md:py-2.5 md:px-3.5 rounded-xl hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors duration-150 cursor-pointer group select-none content-auto gpu-accelerated border-b border-white/[0.04] last:border-b-0",
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

      <div className="flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          enabled={isCurrent}
          className={`font-semibold text-sm leading-snug tracking-tight ${
            isCurrent ? 'text-[#1DB954]' : 'text-white'
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

export default AlbumTrackClient;
