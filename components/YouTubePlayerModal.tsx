'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Youtube, Loader2, AlertCircle, Play, RotateCcw } from 'lucide-react';
import { extractYouTubeVideoId } from '@/lib/youtubeParser';
import { usePlayerStore } from '@/lib/store';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

let apiLoadedPromise: Promise<any> | null = null;

function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (!apiLoadedPromise) {
    apiLoadedPromise = new Promise((resolve) => {
      const existing = document.getElementById('youtube-iframe-api');
      if (!existing) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === 'function') previousReady();
        resolve(window.YT);
      };
    });
  }
  return apiLoadedPromise;
}

export function YouTubePlayerModal({ isOpen, onClose }: YouTubePlayerModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pauseMusicFYAudio = useCallback(() => {
    const store = usePlayerStore.getState();
    if (store.isPlaying) {
      store.setPlaying(false);
    }
    const audioEl = document.querySelector('audio');
    if (audioEl && !audioEl.paused) {
      audioEl.pause();
    }
  }, []);

  // Coordinate: if MusicFY audio starts playing, pause YouTube video
  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe((state) => {
      if (state.isPlaying && playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        try {
          playerRef.current.pauseVideo();
        } catch {}
      }
    });
    return () => unsubscribe();
  }, []);

  // Initialize YouTube IFrame Player when activeVideoId changes
  useEffect(() => {
    if (!isOpen || !activeVideoId || !containerRef.current) return;

    let isSubscribed = true;
    setIsLoading(true);
    setError(null);

    loadYouTubeIframeApi().then((YT) => {
      if (!isSubscribed || !YT || !containerRef.current) return;

      // Clean up previous instance
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }

      // Create new player element inside container
      const mountDiv = document.createElement('div');
      mountDiv.id = 'musicfy-yt-iframe-instance';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(mountDiv);

      try {
        playerRef.current = new YT.Player(mountDiv, {
          videoId: activeVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              if (!isSubscribed) return;
              setIsLoading(false);
              pauseMusicFYAudio();
              try {
                event.target.playVideo();
              } catch {}
            },
            onStateChange: (event: any) => {
              if (!isSubscribed) return;
              // YT.PlayerState.PLAYING is 1
              if (event.data === 1) {
                pauseMusicFYAudio();
              }
            },
            onError: (event: any) => {
              if (!isSubscribed) return;
              setIsLoading(false);
              let msg = 'Terjadi kesalahan saat memuat video YouTube.';
              if (event.data === 2) msg = 'Link atau ID video YouTube tidak valid.';
              else if (event.data === 100) msg = 'Video tidak ditemukan, berstatus privat, atau telah dihapus.';
              else if (event.data === 101 || event.data === 150) {
                msg = 'Pemilik video tidak mengizinkan pemutaran di luar platform YouTube.';
              }
              setError(msg);
            },
          },
        });
      } catch (err: any) {
        setIsLoading(false);
        setError('Gagal menginisialisasi YouTube Player API.');
      }
    });

    return () => {
      isSubscribed = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [isOpen, activeVideoId, pauseMusicFYAudio]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) {
      setError('Masukkan link atau ID video YouTube.');
      return;
    }

    const videoId = extractYouTubeVideoId(raw);
    if (!videoId) {
      setError('Link YouTube tidak valid. Gunakan format youtube.com/watch?v=..., youtu.be/..., shorts, atau ID video 11 karakter.');
      return;
    }

    setError(null);
    setActiveVideoId(videoId);
  };

  const handleResetVideo = () => {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {}
      playerRef.current = null;
    }
    setActiveVideoId(null);
    setUrlInput('');
    setError(null);
  };

  const handleClose = () => {
    if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
      try {
        playerRef.current.stopVideo();
      } catch {}
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-600/10 text-red-500 border border-red-500/20">
              <Youtube className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-white tracking-tight">
                Pemutar YouTube
              </h3>
              <p className="text-[11px] text-white/50">
                Streaming langsung via YouTube IFrame Player API resmi
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {!activeVideoId ? (
            /* URL Input Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/80">
                  Link Video YouTube
                </label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=... atau youtu.be/..."
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition-all font-mono"
                />
                <p className="text-[11px] text-white/40">
                  Mendukung link youtube.com, youtu.be, shorts, YouTube Music, dan ID video 11 karakter.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!urlInput.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:scale-105 active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Putar Video</span>
                </button>
              </div>
            </form>
          ) : (
            /* Active Video Playback View */
            <div className="space-y-3">
              {/* IFrame Container with 16:9 Aspect Ratio */}
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-lg">
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 gap-2 text-white/60">
                    <Loader2 className="w-7 h-7 animate-spin text-red-500" />
                    <span className="text-xs">Memuat YouTube Player...</span>
                  </div>
                )}
                <div ref={containerRef} className="w-full h-full" />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleResetVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Ganti Video</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="px-5 py-2.5 bg-black/40 border-t border-white/5 text-[11px] text-white/40 text-center">
          Pemutaran berjalan bertahap via streaming YouTube Player resmi tanpa mengunduh file atau membuat playlist.
        </div>
      </div>
    </div>
  );
}
