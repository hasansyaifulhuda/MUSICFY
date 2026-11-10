'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const AddToPlaylistModal = dynamic(
  () => import('@/components/AddToPlaylistModal').then((mod) => mod.AddToPlaylistModal || mod.default || mod),
  { ssr: false, loading: () => null }
);

const ToastContainer = dynamic(
  () => import('@/components/ToastContainer').then((mod) => mod.ToastContainer || mod.default || mod),
  { ssr: false, loading: () => null }
);

const PWARegister = dynamic(
  () => import('@/components/PWARegister').then((mod) => mod.PWARegister || mod.default || mod),
  { ssr: false, loading: () => null }
);

const OfflineIndicator = dynamic(
  () => import('@/components/OfflineIndicator').then((mod) => mod.OfflineIndicator || mod.default || mod),
  { ssr: false, loading: () => null }
);

const SleepTimerModal = dynamic(
  () => import('@/components/SleepTimerModal').then((mod) => mod.SleepTimerModal || mod.default || mod),
  { ssr: false, loading: () => null }
);

const EqualizerModal = dynamic(
  () => import('@/components/EqualizerModal').then((mod) => mod.EqualizerModal || mod.default || mod),
  { ssr: false, loading: () => null }
);

const FloatingWidget = dynamic(
  () => import('@/components/FloatingWidget').then((mod) => mod.FloatingWidget || mod.default || mod),
  { ssr: false, loading: () => null }
);

const TrackContextMenu = dynamic(
  () => import('@/components/TrackContextMenu').then((mod) => mod.TrackContextMenu || mod.default || mod),
  { ssr: false, loading: () => null }
);

const DevDiagnosticModal = dynamic(
  () => import('@/components/DevDiagnosticModal').then((mod) => mod.DevDiagnosticModal || mod.default || mod),
  { ssr: false, loading: () => null }
);

import { ComponentErrorBoundary } from '@/components/ComponentErrorBoundary';
import { usePlayerStore } from '@/lib/store';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useSleepTimerStore } from '@/lib/sleepTimerStore';
import { useContextMenuStore } from '@/lib/contextMenuStore';
import { useDevModalStore } from '@/lib/devModalStore';
import { useFloatingWidgetStore } from '@/lib/floatingWidgetStore';

export function ClientModals() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasTrackToAdd = usePlayerStore((state) => state.trackToAdd !== null);
  const isEqualizerOpen = useEqualizerStore((state) => state.isModalOpen);
  const isSleepTimerOpen = useSleepTimerStore((state) => state.isModalOpen);
  const isContextMenuOpen = useContextMenuStore((state) => state.isOpen);
  const isDevModalOpen = useDevModalStore((state) => state.isOpen);

  const isWidgetEnabled = useFloatingWidgetStore((state) => state.isEnabled);
  const isWidgetOpen = useFloatingWidgetStore((state) => state.isOpen);
  const hasCurrentTrack = usePlayerStore((state) => Boolean(state.currentTrack));
  const isPlayerExpanded = usePlayerStore((state) => state.isExpanded);

  const showFloatingWidget = Boolean(isWidgetEnabled && isWidgetOpen && hasCurrentTrack && !isPlayerExpanded);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      {hasTrackToAdd && (
        <ComponentErrorBoundary fallbackTitle="Playlist Modal">
          <AddToPlaylistModal />
        </ComponentErrorBoundary>
      )}

      {isSleepTimerOpen && (
        <ComponentErrorBoundary fallbackTitle="Sleep Timer Modal">
          <SleepTimerModal />
        </ComponentErrorBoundary>
      )}

      {isEqualizerOpen && (
        <ComponentErrorBoundary fallbackTitle="Equalizer Modal">
          <EqualizerModal />
        </ComponentErrorBoundary>
      )}

      {showFloatingWidget && (
        <ComponentErrorBoundary fallbackTitle="Floating Widget">
          <FloatingWidget />
        </ComponentErrorBoundary>
      )}

      {isContextMenuOpen && (
        <ComponentErrorBoundary fallbackTitle="Context Menu">
          <TrackContextMenu />
        </ComponentErrorBoundary>
      )}

      {isDevModalOpen && (
        <ComponentErrorBoundary fallbackTitle="Developer Diagnostic Modal">
          <DevDiagnosticModal />
        </ComponentErrorBoundary>
      )}

      <ToastContainer />
      <PWARegister />
      <OfflineIndicator />
    </>
  );
}

export default ClientModals;

