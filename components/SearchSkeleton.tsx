import React from 'react';
import { TrackListSkeleton } from './Skeleton';

export function SearchSkeleton() {
  return (
    <div className="space-y-3 pt-3 px-4 max-w-5xl mx-auto">
      <TrackListSkeleton count={8} />
    </div>
  );
}
