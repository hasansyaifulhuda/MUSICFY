'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-white/[0.06] rounded-xl border border-white/[0.04] animate-shimmer gpu-accelerated',
        className
      )}
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
      {...props}
    />
  );
}

export function TrackSkeleton({ index }: { index?: number }) {
  return (
    <div className="flex items-center gap-3.5 p-2 md:p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03] animate-shimmer">
      {index !== undefined && (
        <div className="w-5 h-4 bg-white/10 rounded hidden sm:block shrink-0" />
      )}
      <div className="w-11 h-11 rounded-lg bg-white/10 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-white/10 rounded-md w-3/4 max-w-[240px]" />
        <div className="h-3 bg-white/5 rounded-md w-1/2 max-w-[160px]" />
      </div>
      <div className="w-10 h-3 bg-white/5 rounded-md hidden sm:block shrink-0" />
      <div className="w-6 h-6 rounded-full bg-white/5 shrink-0" />
    </div>
  );
}

export function TrackListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1.5 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <TrackSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-shimmer space-y-3',
        className
      )}
    >
      <div className="w-full aspect-square rounded-xl bg-white/10" />
      <div className="space-y-2 pt-1">
        <div className="h-4 bg-white/10 rounded-md w-4/5" />
        <div className="h-3 bg-white/5 rounded-md w-3/5" />
      </div>
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative w-full rounded-3xl overflow-hidden bg-white/[0.04] border border-white/[0.06] p-6 sm:p-8 animate-shimmer">
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
        <div className="w-36 h-36 sm:w-48 sm:h-48 rounded-2xl bg-white/10 shrink-0 shadow-2xl" />
        <div className="flex-1 w-full space-y-3 text-center sm:text-left">
          <div className="h-4 bg-white/10 rounded-full w-24 mx-auto sm:mx-0" />
          <div className="h-8 sm:h-12 bg-white/10 rounded-xl w-3/4 mx-auto sm:mx-0" />
          <div className="h-4 bg-white/5 rounded-md w-1/2 mx-auto sm:mx-0" />
        </div>
      </div>
    </div>
  );
}

