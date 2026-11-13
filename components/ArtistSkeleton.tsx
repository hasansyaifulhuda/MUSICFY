import React from 'react';
import { Skeleton, TrackListSkeleton } from './Skeleton';

export function ArtistSkeleton() {
  return (
    <div className="min-h-screen pb-32 space-y-6">
      <div className="relative h-[38vh] min-h-[280px] w-full bg-white/[0.03] border-b border-white/[0.06] animate-shimmer">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="w-10 h-10 rounded-full" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/60 to-transparent space-y-3">
          <Skeleton className="h-10 w-2/3 max-w-md rounded-xl" />
          <Skeleton className="h-4 w-1/3 max-w-[200px] rounded-lg" />
        </div>
      </div>

      <div className="px-4 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <Skeleton className="w-14 h-14 rounded-full" />
          </div>
          <Skeleton className="w-28 h-10 rounded-full" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-6 w-36 rounded-lg" />
          <TrackListSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
