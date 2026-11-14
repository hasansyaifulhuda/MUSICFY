'use client';

import React, { memo, useCallback, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getHighResImage, cn } from '@/lib/utils';
import { useTapGesture } from '@/hooks/useTapGesture';
import { User } from 'lucide-react';

export const ArtistItem = memo(function ArtistItem({ artist }: { artist: any }) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const thumbnail = getHighResImage(artist.thumbnails?.[artist.thumbnails.length - 1]?.url, 200);

  const handleNavigate = useCallback(() => {
    if (artist?.artistId) {
      router.push(`/artist/${artist.artistId}`);
    }
  }, [router, artist?.artistId]);

  const tapGesture = useTapGesture({
    onTap: handleNavigate,
    threshold: 8,
  });

  return (
    <div
      {...tapGesture}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
      className="flex items-center p-2.5 hover:bg-white/[0.06] active:bg-white/[0.10] rounded-xl cursor-pointer group transition-colors duration-150 select-none content-auto gpu-accelerated border border-transparent hover:border-white/5"
    >
      <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 shadow bg-white/5 border border-white/10 aspect-square">
        {thumbnail && !imgError ? (
          <Image
            src={thumbnail}
            alt={artist.name || 'Artis'}
            fill
            sizes="48px"
            loading="lazy"
            decoding="async"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.08] text-white/40">
            <User className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="ml-3.5 flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-white group-hover:text-[#1DB954] transition-colors truncate">
          {artist.name}
        </h4>
        <span className="text-xs text-white/50">Artis</span>
      </div>
    </div>
  );
});
