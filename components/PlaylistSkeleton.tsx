import React from 'react';
import { Skeleton, TrackListSkeleton } from './Skeleton';

export function PlaylistSkeleton() {
  return (
    <div className="min-h-screen pb-28 space-y-6">
      <div className="sticky top-0 z-10 glass-header px-4 py-4 flex items-center gap-4">
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>

      <div className="px-4 pt-2 pb-6 flex flex-col items-center text-center max-w-xl mx-auto space-y-4">
        <Skeleton className="w-48 h-48 sm:w-60 sm:h-60 rounded-3xl shadow-2xl" />
        <div className="space-y-2 w-full flex flex-col items-center">
          <Skeleton className="h-7 w-3/4 max-w-sm rounded-xl" />
          <Skeleton className="h-4 w-1/3 max-w-[180px] rounded-lg" />
        </div>

        <div className="flex items-center gap-4 w-full justify-center pt-2">
          <Skeleton className="w-36 h-12 rounded-full" />
          <Skeleton className="w-12 h-12 rounded-full" />
        </div>
      </div>

      <div className="px-4 max-w-4xl mx-auto">
        <TrackListSkeleton count={7} />
      </div>
    </div>
  );
}
