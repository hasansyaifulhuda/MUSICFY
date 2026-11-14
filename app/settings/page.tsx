'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  Database,
  SlidersHorizontal,
  DownloadCloud,
  History,
  AlertTriangle,
  X,
  ShieldAlert,
} from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type ActionId = 'cache' | 'storage' | 'idb' | 'downloads' | 'history' | 'all';

interface ActionConfig {
  id: ActionId;
  order: number;
  title: string;
  badge: string;
  description: string;
  buttonLabel: string;
  isDestructive: boolean;
  requiresTwoStep?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  details: string[];
}

const SETTINGS_ACTIONS: ActionConfig[] = [
  {
    id: 'cache',
    order: 1,
    title: 'Clear Cache',
    badge: 'Cache Storage',
    description:
      'Bersihkan cache browser dan Cache Storage aplikasi (thumbnail gambar, respon audio sementara, dan cache jaringan).',
    buttonLabel: 'Bersihkan Cache',
    isDestructive: false,
    icon: RefreshCw,
    details: [
      'Menghapus seluruh cache HTTP dan Cache Storage browser.',
      'Menghapus thumbnail sementara yang disimpan di cache perangkat.',
      'Aplikasi akan memuat ulang aset terbaru langsung dari server.',
      'Data playlist, lagu favorit, unduhan, dan preferensi TIDAK akan terhapus.',
    ],
  },
  {
    id: 'storage',
    order: 2,
    title: 'Clear LocalStorage',
    badge: 'Preferensi Lokal',
    description:
      'Reset seluruh preferensi pengguna, pengaturan volume, mode acak/repeat, dan sesi pemutar ke setelan default pabrik.',
    buttonLabel: 'Reset LocalStorage',
    isDestructive: false,
    icon: SlidersHorizontal,
    details: [
      'Mereset preferensi pemutar (volume, shuffle, repeat, crossfade).',
      'Mereset preferensi audio dan pemutar ke setelan default.',
      'Menghapus sesi audio sementara yang tersimpan di browser.',
      'Lagu offline dan playlist yang tersimpan di IndexedDB TIDAK akan terhapus.',
    ],
  },
  {
    id: 'idb',
    order: 3,
    title: 'Clear IndexedDB',
    badge: 'Basis Data Lokal',
    description:
      'Kosongkan seluruh basis data IndexedDB lokal (seluruh lagu unduhan offline, daftar putar kustom, lagu disukai, artis langganan, dan album tersimpan).',
    buttonLabel: 'Kosongkan IndexedDB',
    isDestructive: true,
    icon: Database,
    details: [
      'Mengosongkan seluruh tabel data pada database IndexedDB (SannMusicDB).',
      'Menghapus seluruh file lagu unduhan offline dari penyimpanan perangkat.',
      'Menghapus seluruh daftar putar (playlists) kustom yang dibuat lokal.',
      'Menghapus daftar lagu yang disukai (liked songs) dan album tersimpan.',
      'Pengaturan volume dan preferensi LocalStorage TIDAK akan terhapus.',
    ],
  },
  {
    id: 'downloads',
    order: 4,
    title: 'Clear Offline Downloads',
    badge: 'File Audio Offline',
    description:
      'Hapus seluruh file audio musik yang diunduh untuk pemutaran offline guna membebaskan ruang penyimpanan perangkat. Metadata playlist dan lagu favorit tetap aman.',
    buttonLabel: 'Hapus Unduhan',
    isDestructive: true,
    icon: DownloadCloud,
    details: [
      'Menghapus seluruh file audio (MP3/Blob) yang diunduh untuk mode offline.',
      'Membebaskan ruang penyimpanan memori perangkat Anda.',
      'Daftar putar, riwayat, dan lagu favorit Anda TETAP UTUH dan aman.',
      'Pengaturan dan cache aplikasi lainnya TIDAK akan terhapus.',
    ],
  },
  {
    id: 'history',
    order: 5,
    title: 'Clear Song History',
    badge: 'Riwayat Putar',
    description:
      'Bersihkan seluruh riwayat pemutaran lagu yang pernah Anda dengarkan dan reset statistik jumlah putar (play counts).',
    buttonLabel: 'Hapus Riwayat',
    isDestructive: false,
    icon: History,
    details: [
      'Mengosongkan seluruh daftar riwayat pemutaran lagu.',
      'Mereset penghitung frekuensi putar (play counts) untuk tangga lagu Top 50.',
      'Menghapus riwayat pencarian terbaru (recent searches).',
      'Lagu offline, playlist, dan favorit Anda TIDAK akan terhapus.',
    ],
  },
  {
    id: 'all',
    order: 6,
    title: 'Clear All App/Web Data',
    badge: 'Pembersihan Total',
    description:
      'Pembersihan menyeluruh dan reset total. Hapus Cache Storage, LocalStorage, IndexedDB, riwayat, unduhan offline, dan sesi aktif sekaligus (kondisi instalasi awal).',
    buttonLabel: 'Hapus Seluruh Data',
    isDestructive: true,
    requiresTwoStep: true,
    icon: AlertTriangle,
    details: [
      'Menghapus SELURUH lagu yang diunduh untuk pemutaran offline.',
      'Menghapus SELURUH playlist lokal, lagu favorit, riwayat putar, dan album.',
      'Mereset SELURUH pengaturan pemutar dan preferensi ke setelan awal pabrik.',
      'Membersihkan seluruh cache browser dan Cache Storage aplikasi.',
      'Mengembalikan aplikasi ke kondisi bersih seperti pertama kali dibuka.',
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();

  // Active confirmation modal state
  const [activeAction, setActiveAction] = useState<ActionConfig | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepTwoConfirm, setStepTwoConfirm] = useState(false);

  // Close modal helper
  const closeModal = useCallback(() => {
    if (isProcessing) return;
    setActiveAction(null);
    setStepTwoConfirm(false);
  }, [isProcessing]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeAction && !isProcessing) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeAction, isProcessing, closeModal]);

  // 1. Clear Cache
  const handleClearCache = async () => {
    setIsProcessing(true);
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await Promise.race([
          caches.keys(),
          new Promise<string[]>((_, reject) =>
            setTimeout(() => reject(new Error('Cache keys timeout')), 4000)
          ),
        ]);
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.clear();
      }
      toast.success('Cache aplikasi dan aset sementara berhasil dibersihkan.');
    } catch (err: any) {
      console.error('[Settings] Error clearing cache:', err);
      toast.error('Gagal membersihkan cache: ' + (err?.message || 'Terjadi kesalahan sistem'));
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  };

  // 2. Clear LocalStorage
  const handleClearLocalStorage = async () => {
    setIsProcessing(true);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.clear();
      }
      toast.success('Data preferensi dan LocalStorage berhasil dibersihkan.');
    } catch (err: any) {
      console.error('[Settings] Error clearing localStorage:', err);
      toast.error('Gagal membersihkan LocalStorage: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  };

  // 3. Clear IndexedDB
  const handleClearIndexedDB = async () => {
    setIsProcessing(true);
    try {
      // Safety check: pause audio if currently playing offline track
      const currentTrack = usePlayerStore.getState().currentTrack;
      if (currentTrack?.videoId) {
        const isOffline = db.isOfflineTrackSync(currentTrack.videoId);
        if (isOffline) {
          usePlayerStore.getState().setPlaying(false);
          const audio = typeof window !== 'undefined' ? (document.getElementById('musicfy-persistent-audio') as HTMLAudioElement) : null;
          audio?.pause();
        }
      }

      const success = await Promise.race([
        db.clearAllIndexedDB(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('IndexedDB clear timeout')), 5000)
        ),
      ]);

      if (!success) {
        throw new Error('Gagal mengosongkan store IndexedDB');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('musicfy:offline-updated', { detail: { action: 'clear' } })
        );
        window.dispatchEvent(new Event('musicfy:library-updated'));
      }

      toast.success('Seluruh data IndexedDB berhasil dikosongkan.');
    } catch (err: any) {
      console.error('[Settings] Error clearing IndexedDB:', err);
      toast.error('Gagal mengosongkan IndexedDB: ' + (err?.message || 'Terjadi galat basis data'));
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  };

  // 4. Clear Offline Downloads
  const handleClearOfflineDownloads = async () => {
    setIsProcessing(true);
    try {
      // Safety check: pause audio if currently playing offline track
      const currentTrack = usePlayerStore.getState().currentTrack;
      if (currentTrack?.videoId) {
        const isOffline = db.isOfflineTrackSync(currentTrack.videoId);
        if (isOffline) {
          usePlayerStore.getState().setPlaying(false);
          const audio = typeof window !== 'undefined' ? (document.getElementById('musicfy-persistent-audio') as HTMLAudioElement) : null;
          audio?.pause();
        }
      }

      const success = await Promise.race([
        db.clearOfflineTracks(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Clear downloads timeout')), 5000)
        ),
      ]);

      if (!success) {
        throw new Error('Gagal menghapus file unduhan offline');
      }

      toast.success('Semua unduhan lagu offline berhasil dihapus.');
    } catch (err: any) {
      console.error('[Settings] Error clearing offline downloads:', err);
      toast.error('Gagal menghapus unduhan: ' + (err?.message || 'Terjadi kesalahan sistem'));
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  };

  // 5. Clear Song History
  const handleClearSongHistory = async () => {
    setIsProcessing(true);
    try {
      usePlayerStore.getState().clearHistory();
      await db.clearRecentSearches().catch(() => {});
      toast.success('Riwayat pemutaran lagu berhasil dibersihkan.');
    } catch (err: any) {
      console.error('[Settings] Error clearing history:', err);
      toast.error('Gagal membersihkan riwayat: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  };

  // 6. Clear All App/Web Data
  const handleClearAllData = async () => {
    setIsProcessing(true);
    try {
      // 1. Pause audio immediately
      usePlayerStore.getState().setPlaying(false);
      const audio = typeof window !== 'undefined' ? (document.getElementById('musicfy-persistent-audio') as HTMLAudioElement) : null;
      audio?.pause();

      // 2. Clear IndexedDB stores safely
      try {
        await Promise.race([
          db.clearAllIndexedDB(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('IndexedDB clear timeout')), 5000)
          ),
        ]);
      } catch (e) {
        console.warn('[Settings] IndexedDB clear warning:', e);
      }

      // 3. Close database connection cleanly
      try {
        db.closeDatabase();
      } catch {}

      // 4. Clear Cache Storage
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (e) {
          console.warn('[Settings] Cache storage clear warning:', e);
        }
      }

      // 5. Clear LocalStorage & SessionStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {}
      }

      // 6. Reset in-memory player state
      try {
        usePlayerStore.getState().clearHistory();
      } catch {}

      toast.success('Seluruh data aplikasi berhasil dibersihkan. Memuat ulang aplikasi...');

      // 7. Clean redirect to home
      setTimeout(() => {
        window.location.href = '/';
      }, 700);
    } catch (err: any) {
      console.error('[Settings] Error clearing all data:', err);
      toast.error('Gagal membersihkan seluruh data: ' + (err?.message || 'Terjadi kesalahan'));
      setIsProcessing(false);
      closeModal();
    }
  };

  // Route action execution by ID
  const executeAction = async () => {
    if (!activeAction) return;
    switch (activeAction.id) {
      case 'cache':
        await handleClearCache();
        break;
      case 'storage':
        await handleClearLocalStorage();
        break;
      case 'idb':
        await handleClearIndexedDB();
        break;
      case 'downloads':
        await handleClearOfflineDownloads();
        break;
      case 'history':
        await handleClearSongHistory();
        break;
      case 'all':
        await handleClearAllData();
        break;
    }
  };

  return (
    <main className="min-h-screen pb-32 select-none bg-black text-white">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-black/70 backdrop-blur-md pt-5 pb-4 px-4 md:px-8 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
              Pengaturan
            </h1>
            <p className="text-xs text-white/50">Manajemen Data &amp; Penyimpanan Aplikasi</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        {/* The 6 Actions List */}
        <div className="bg-[#121212] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.05] overflow-hidden shadow-xl">
          {SETTINGS_ACTIONS.map((action) => {
            const Icon = action.icon;
            const isAll = action.id === 'all';

            return (
              <div
                key={action.id}
                className={cn(
                  'p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors',
                  isAll
                    ? 'hover:bg-red-500/[0.03] bg-red-950/[0.08]'
                    : 'hover:bg-white/[0.03]'
                )}
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div
                    className={cn(
                      'p-2.5 rounded-xl shrink-0 mt-0.5',
                      action.isDestructive
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-white/10 text-white border border-white/10'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2
                        className={cn(
                          'text-sm md:text-base font-bold tracking-tight',
                          action.isDestructive ? 'text-red-400' : 'text-white'
                        )}
                      >
                        {action.title}
                      </h2>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          action.isDestructive
                            ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                            : 'bg-white/10 text-white/70'
                        )}
                      >
                        {action.badge}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">{action.description}</p>
                  </div>
                </div>

                <div className="sm:self-center shrink-0 pl-12 sm:pl-0">
                  <button
                    onClick={() => {
                      setActiveAction(action);
                      setStepTwoConfirm(false);
                    }}
                    className={cn(
                      'w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95',
                      action.isDestructive
                        ? 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 hover:border-red-500/50'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20'
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{action.buttonLabel}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal */}
      {activeAction && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-200"
          onClick={closeModal}
        >
          <div
            className={cn(
              'bg-[#181818] border rounded-2xl p-5 md:p-6 max-w-md w-full shadow-2xl relative transition-all duration-200',
              activeAction.isDestructive ? 'border-red-500/30' : 'border-white/10'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={closeModal}
              disabled={isProcessing}
              className="absolute top-4 right-4 p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Tutup dialog"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className={cn(
                  'p-3 rounded-2xl shrink-0',
                  activeAction.isDestructive
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                )}
              >
                {activeAction.isDestructive ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <ShieldAlert className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
                    {stepTwoConfirm ? 'Konfirmasi Akhir (Permanen)' : `Konfirmasi: ${activeAction.title}`}
                  </h3>
                  {activeAction.requiresTwoStep && (
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                        stepTwoConfirm
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      )}
                    >
                      {stepTwoConfirm ? 'Tahap 2 / 2: Peringatan Kritis' : 'Tahap 1 / 2: Konfirmasi Awal'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mt-0.5">
                  {stepTwoConfirm
                    ? 'Peringatan: Tindakan ini tidak dapat dibatalkan.'
                    : 'Periksa dampak penghapusan data di bawah ini:'}
                </p>
              </div>
            </div>

            {/* Step 1 Content */}
            {!stepTwoConfirm && (
              <div className="space-y-3 mb-6">
                <p className="text-xs md:text-sm text-white/80 leading-relaxed">
                  {activeAction.description}
                </p>

                <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06] space-y-2 text-xs">
                  <span className="font-semibold text-white/90 block">Rincian Efek Tindakan:</span>
                  <ul className="space-y-1.5 text-white/70">
                    {activeAction.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#1DB954] mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Step 2 Content (For Clear All Data) */}
            {stepTwoConfirm && (
              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs md:text-sm text-red-200 leading-relaxed">
                  <p className="font-bold text-red-400 mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>PERINGATAN PEMULIHAN PABRIK</span>
                  </p>
                  Apakah Anda benar-benar yakin ingin melanjutkan? Seluruh unduhan offline,
                  daftar putar kustom, lagu favorit, riwayat, dan preferensi lokal akan
                  <strong> DIHAPUS SECARA PERMANEN</strong> dan aplikasi akan dimulai ulang dari awal.
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={closeModal}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              {activeAction.requiresTwoStep && !stepTwoConfirm ? (
                <button
                  type="button"
                  onClick={() => setStepTwoConfirm(true)}
                  disabled={isProcessing}
                  className="px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer shadow-lg shadow-red-950/50"
                >
                  Lanjutkan Konfirmasi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={executeAction}
                  disabled={isProcessing}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer shadow-lg disabled:opacity-50 active:scale-95',
                    activeAction.isDestructive
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50'
                      : 'bg-[#1DB954] hover:bg-[#1ed760] text-black shadow-[#1DB954]/20'
                  )}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{stepTwoConfirm ? 'Ya, Hapus Semua Sekarang' : 'Lanjutkan Penghapusan'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
