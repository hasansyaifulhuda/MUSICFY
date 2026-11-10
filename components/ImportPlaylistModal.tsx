'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { X, DownloadCloud, Loader2, Music, CheckCircle2, AlertCircle, Disc3, Play, ListMusic } from 'lucide-react';
import Image from 'next/image';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { usePlayerStore } from '@/lib/store';
import { getHighResImage } from '@/lib/utils';
import { useMusic } from '@/context/MusicContext';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ImportPlaylistModal({ isOpen, onClose, onSuccess }: ImportPlaylistModalProps) {
  const [url, setUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [autoPlayOnImport, setAutoPlayOnImport] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { playTrack } = useMusic();

  // Detect input type in real time
  const detectedType = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.includes('playlist?list=') || trimmed.startsWith('PL') || trimmed.startsWith('OLAK')) {
      return 'playlist';
    }
    if (
      trimmed.includes('watch?v=') ||
      trimmed.includes('youtu.be/') ||
      trimmed.includes('shorts/') ||
      trimmed.includes('music.youtube.com/watch') ||
      /^[a-zA-Z0-9_-]{11}$/.test(trimmed)
    ) {
      return 'video';
    }
    return 'unknown';
  }, [url]);

  const handleImport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) {
        setError('Masukkan link atau ID YouTube.');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/playlist/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || 'Gagal mengimpor dari YouTube.');
        }

        const data = json.data;
        const finalTitle = customTitle.trim() || data.title || (data.type === 'video' ? 'Audio Impor' : 'Playlist Impor');

        // 1. Insert into user's IndexedDB playlists
        await db.createPlaylist(finalTitle, data.tracks, data.thumbnail);

        // 2. If single video / long audio and autoPlay is checked, start playing immediately!
        if (data.type === 'video' && autoPlayOnImport && data.tracks?.[0]) {
          try {
            await playTrack(data.tracks[0], data.tracks);
          } catch {}
        }

        const durationInfo =
          data.type === 'video' && data.duration > 0
            ? ` (${Math.round(data.duration / 60)} menit)`
            : ` (${data.totalTracks} lagu)`;

        toast.success(`Berhasil mengimpor "${finalTitle}"${durationInfo} ke Koleksi!`);
        setUrl('');
        setCustomTitle('');
        onSuccess?.();
        onClose();
      } catch (err: any) {
        console.error('[ImportPlaylistModal] Import error:', err);
        setError(err.message || 'Terjadi kesalahan saat memproses data YouTube.');
      } finally {
        setIsLoading(false);
      }
    },
    [url, customTitle, autoPlayOnImport, playTrack, onSuccess, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md p-6 bg-[#181818]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Impor YouTube Audio & Playlist</h3>
              <p className="text-xs text-white/50">Mendukung Playlist, Full Album 1 Jam, atau Video Musik</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleImport} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white/70">Link Video / Playlist YouTube</label>
              {detectedType === 'video' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <Disc3 className="w-3 h-3" />
                  <span>Video / Album Mix Terdeteksi</span>
                </span>
              )}
              {detectedType === 'playlist' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  <ListMusic className="w-3 h-3" />
                  <span>Playlist Terdeteksi</span>
                </span>
              )}
            </div>

            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://www.youtube.com/watch?v=... atau playlist?list=..."
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all font-mono"
            />
            <p className="text-[11px] text-white/40">
              Tempel link YouTube satuan (termasuk video panjang 1 jam), YouTube Music, atau Playlist.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">Judul Kustom (Opsional)</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Biarkan kosong untuk menggunakan judul asli YouTube"
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
            />
          </div>

          {detectedType === 'video' && (
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPlayOnImport}
                onChange={(e) => setAutoPlayOnImport(e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 rounded text-red-500 accent-red-500 cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-xs font-medium text-white/90">Putar langsung setelah diimpor</span>
                <p className="text-[11px] text-white/40">Otomatis mulai audio di player dengan cover art YouTube asli.</p>
              </div>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black hover:bg-neutral-200 rounded-full text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Mengekstrak Metadata...</span>
                </>
              ) : (
                <>
                  <DownloadCloud className="w-4 h-4" />
                  <span>Impor Sekarang</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
