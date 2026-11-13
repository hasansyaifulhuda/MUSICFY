import React from 'react';
import { Skeleton, CardSkeleton, TrackSkeleton } from './Skeleton';

export function HomeSkeleton() {
  return (
    <div className="space-y-8 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Hero Glass Banner Skeleton */}
      <div className="flex overflow-x-hidden gap-4 pb-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="relative w-[85vw] sm:w-[420px] shrink-0 aspect-[16/9] rounded-3xl bg-white/[0.04] border border-white/[0.06] p-6 flex flex-col justify-between animate-shimmer"
          >
            <div className="space-y-2.5">
              <Skeleton className="h-7 w-2/3 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
            </div>
            <Skeleton className="h-4 w-1/3 rounded-md" />
          </div>
        ))}
      </div>

      {/* Speed Dial / Quick Picks Skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-7 w-48 rounded-lg ml-1" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-shimmer"
            >
              <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Horizontal Shelves Skeletons */}
      {[1, 2].map((section) => (
        <div key={section} className="space-y-4">
          <Skeleton className="h-7 w-44 rounded-lg ml-1" />
          <div className="flex overflow-x-hidden gap-4 pb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-none w-36 sm:w-44">
                <CardSkeleton />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
