'use client';

import { Suspense, useState, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, ListMusic, Trash2, Play, Youtube } from 'lucide-react';
import { db, CustomPlaylist } from '@/lib/db';
import { usePlayerStore } from '@/lib/store';
import { useTapGesture } from '@/hooks/useTapGesture';
import { toast } from '@/lib/toast';
import dynamic from 'next/dynamic';

const YouTubePlayerModal = dynamic(
  () => import('@/components/YouTubePlayerModal').then((m) => m.YouTubePlayerModal),
  { ssr: false, loading: () => null }
);

interface PlaylistCardProps {
  pl: CustomPlaylist;
  index: number;
  onDelete: (id: string, name: string) => void;
}

const LibraryPlaylistItem = memo(function LibraryPlaylistItem({
  pl,
  index,
  onDelete,
}: PlaylistCardProps) {
  const router = useRouter();
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [imgError, setImgError] = useState(false);

  const handleNavigate = useCallback(() => {
    router.push(`/playlist/${pl.id}`);
  }, [router, pl.id]);

  const tapGesture = useTapGesture({
    onTap: handleNavigate,
    threshold: 8,
  });

  const hasValidImg = Boolean(pl.img && pl.img.trim() && pl.img !== '/icon.png' && !imgError);

  return (
    <div
      {...tapGesture}
      className="flex flex-col justify-between p-3.5 bg-[#181818]/70 hover:bg-[#282828] rounded-2xl cursor-pointer transition-all duration-200 group select-none border border-white/5 shadow-sm relative min-h-[190px] md:min-h-[220px]"
      style={{
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    >
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5 shadow mb-3">
        {hasValidImg ? (
          <Image
            src={pl.img}
            alt={pl.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={index < 4}
            loading={index < 4 ? undefined : 'lazy'}
            decoding="async"
            onError={() => setImgError(true)}
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 text-white/30 group-hover:text-white/50 transition-colors">
            <ListMusic className="w-8 h-8 md:w-10 md:h-10 mb-1" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (pl.tracks && pl.tracks.length > 0) {
                playTrack(pl.tracks[0], pl.tracks, 'playlist');
              } else {
                toast.info('Playlist ini masih kosong.');
              }
            }}
            className="w-11 h-11 bg-[#1DB954] hover:bg-[#1ed760] rounded-full flex items-center justify-center text-black shadow-lg hover:scale-105 transition-transform cursor-pointer"
            title="Putar Playlist"
          >
            <Play className="w-5 h-5 ml-0.5 fill-current" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-2">
          <h4
            className="text-white font-bold text-sm truncate group-hover:text-[#1DB954] transition-colors"
            title={pl.name}
          >
            {pl.name}
          </h4>
          <p className="text-[#b3b3b3] text-xs mt-0.5">
            {pl.tracks?.length || 0} lagu
          </p>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(pl.id, pl.name);
          }}
          className="p-2 text-white/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors cursor-pointer"
          title="Hapus playlist"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

function LibraryContent() {
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>(() =>
    typeof window !== 'undefined' ? db.getCachedPlaylists() : []
  );
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistImg, setNewPlaylistImg] = useState('');

  const loadPlaylists = useCallback(async () => {
    try {
      const pl = await db.getPlaylists();
      setPlaylists(pl);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();

    const handlePlaylistChange = () => {
      loadPlaylists();
    };

    window.addEventListener('musicfy:playlists-changed', handlePlaylistChange);
    window.addEventListener('storage', handlePlaylistChange);

    return () => {
      window.removeEventListener('musicfy:playlists-changed', handlePlaylistChange);
      window.removeEventListener('storage', handlePlaylistChange);
    };
  }, [loadPlaylists]);

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    try {
      const newPlaylist: CustomPlaylist = {
        id: `pl_${Date.now()}`,
        name,
        img: newPlaylistImg || '',
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.addPlaylist(newPlaylist);
      toast.success(`Playlist "${name}" berhasil dibuat`);
      setShowCreate(false);
      setNewPlaylistName('');
      setNewPlaylistImg('');
      await loadPlaylists();
    } catch (err) {
      console.error('Failed to create playlist:', err);
      toast.error('Gagal membuat playlist');
    }
  };

  const handleDeletePlaylist = async (id: string, name: string) => {
    if (confirm(`Hapus playlist "${name}"?`)) {
      try {
        await db.deletePlaylist(id);
        toast.info(`Playlist "${name}" berhasil dihapus`);
        await loadPlaylists();
      } catch (err) {
        console.error('Failed to delete playlist:', err);
        toast.error('Gagal menghapus playlist');
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPlaylistImg(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <main className="min-h-screen pt-4 px-4 md:px-8 pb-32 max-w-6xl mx-auto select-none space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Koleksi
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Tepat SATU Tombol YouTube di Header dengan Label Singkat "YouTube" */}
          <button
            onPointerDown={(e) => {
              if (e.button === 0) setShowYouTubeModal(true);
            }}
            onClick={() => setShowYouTubeModal(true)}
            style={{ touchAction: 'manipulation' }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all cursor-pointer border border-white/10 hover:border-white/20 active:scale-95"
            title="Putar Link YouTube"
          >
            <Youtube className="w-4 h-4 text-red-500 shrink-0 fill-current" />
            <span>YouTube</span>
          </button>

          {/* Tombol Buat Playlist Baru */}
          <button
            onPointerDown={(e) => {
              if (e.button === 0) setShowCreate(true);
            }}
            onClick={() => setShowCreate(true)}
            style={{ touchAction: 'manipulation' }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-xs font-bold text-black transition-all cursor-pointer shadow-md hover:scale-105 active:scale-95"
            title="Buat Playlist Baru"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Buat Playlist</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4 md:gap-5">
          {playlists.map((pl, i) => (
            <LibraryPlaylistItem
              key={pl.id}
              pl={pl}
              index={i}
              onDelete={handleDeletePlaylist}
            />
          ))}
        </div>
      ) : (
        /* Empty State: Tanpa Tombol YouTube, Hanya Tombol Buat Playlist */
        <div className="py-20 md:py-28 flex flex-col items-center justify-center text-center px-4 bg-[#181818]/30 rounded-2xl border border-white/5">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-white/40">
            <ListMusic className="w-8 h-8" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-white mb-2">
            Belum ada playlist
          </h2>
          <p className="text-xs md:text-sm text-white/50 max-w-sm mb-6 leading-relaxed">
            Buat playlist baru untuk mulai mengumpulkan lagu-lagu favorit Anda.
          </p>
          <div className="flex items-center justify-center">
            <button
              onClick={() => setShowCreate(true)}
              style={{ touchAction: 'manipulation' }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-xs sm:text-sm font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#1DB954]/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Buat Playlist</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal Buat Playlist */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-[#242424] rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">Buat Playlist Baru</h2>

            <div className="flex justify-center my-3">
              <label className="relative w-28 h-28 rounded-xl overflow-hidden cursor-pointer group bg-white/5 flex items-center justify-center border border-dashed border-white/20 hover:border-white/50 transition-colors">
                {newPlaylistImg ? (
                  <Image
                    src={newPlaylistImg}
                    alt="Preview"
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <ListMusic className="w-8 h-8 text-white/50" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[11px] font-semibold text-white">Upload Cover</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPlaylistName.trim()) {
                  handleCreatePlaylist();
                }
              }}
              placeholder="Nama playlist"
              autoFocus
              className="w-full bg-[#181818] text-white rounded-xl py-2.5 px-4 focus:outline-none focus:border-[#1DB954] border border-white/10 text-sm"
            />

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-full font-semibold text-white bg-white/10 hover:bg-white/20 transition-colors text-xs sm:text-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="flex-1 py-2.5 rounded-full font-bold text-black bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs sm:text-sm shadow-md cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pemutar YouTube via IFrame Player API */}
      <YouTubePlayerModal
        isOpen={showYouTubeModal}
        onClose={() => setShowYouTubeModal(false)}
      />
    </main>
  );
}

export default function Library() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-8 px-6 text-white/40">Memuat koleksi...</div>}>
      <LibraryContent />
    </Suspense>
  );
}
