'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  X,
  RefreshCw,
  Server,
  Layers,
  Database,
  BarChart3,
  HardDrive,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  LogOut,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminDashboardModal({ isOpen, onClose }: AdminDashboardModalProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [token, setToken] = useState<string>('');

  const fetchStats = useCallback(
    async (adminToken?: string) => {
      setIsLoadingStats(true);
      try {
        const headers: Record<string, string> = {};
        const activeTok = adminToken || token;
        if (activeTok) {
          headers['Authorization'] = `Bearer ${activeTok}`;
        }
        const res = await fetch('/api/admin/stats', { headers });
        if (res.ok) {
          const json = await res.json();
          setStats(json?.data || json?.result || json);
        } else if (res.status === 401) {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.warn('Failed to fetch admin stats:', err);
      } finally {
        setIsLoadingStats(false);
      }
    },
    [token]
  );

  const checkAuth = useCallback(async () => {
    setIsCheckingAuth(true);
    try {
      const res = await fetch('/api/admin/auth');
      if (res.ok) {
        const data = await res.json();
        const authed = Boolean(
          data?.data?.authenticated || data?.result?.authenticated || data?.authenticated
        );
        setIsAuthenticated(authed);
        if (authed) {
          fetchStats();
        }
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsCheckingAuth(false);
    }
  }, [fetchStats]);

  useEffect(() => {
    if (isOpen) {
      checkAuth();
    }
  }, [isOpen, checkAuth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoadingAuth(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok && (data?.data?.authenticated || data?.result?.authenticated || data?.authenticated)) {
        setIsAuthenticated(true);
        const tok = data?.data?.token || data?.result?.token || data?.token || '';
        setToken(tok);
        setPassword('');
        toast.success('Autentikasi admin berhasil!');
        fetchStats(tok);
      } else {
        toast.error(data?.message || 'Kata sandi admin salah!');
      }
    } catch {
      toast.error('Gagal memproses autentikasi admin.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {}
    setIsAuthenticated(false);
    setToken('');
    setStats(null);
    document.cookie = 'musicfy_admin_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    toast.info('Keluar dari mode admin.');
  };

  // Normalized Telemetry Metrics (Supports both vpsSpecs and legacy flat payload)
  const normalizedStats = useMemo(() => {
    if (!stats) return null;
    const vps = stats.vps || {};
    const subs = stats.subsystems || {};

    const memoryRssMb =
      vps.application?.memoryRssMb ?? stats.system?.memoryRssMb ?? '...';
    const memoryHeapUsedMb =
      vps.application?.memoryHeapUsedMb ?? stats.system?.memoryHeapUsedMb ?? 0;
    const memoryHeapTotalMb =
      vps.application?.memoryHeapTotalMb ?? stats.system?.memoryHeapTotalMb ?? 0;
    const uptimeSeconds =
      vps.specs?.system?.serverUptimeSeconds ??
      vps.application?.processUptimeSeconds ??
      stats.system?.uptimeSeconds ??
      0;
    const cpuCount =
      vps.specs?.cpu?.cores ?? stats.system?.cpuCount ?? 4;
    const nodeVersion =
      vps.application?.nodeVersion ?? stats.system?.nodeVersion ?? 'v20';

    const queueStream =
      subs.streamQueue?.stream ?? stats.queue?.stream ?? { running: 0, queued: 0, totalCompleted: 0 };
    const meilisearch =
      subs.meilisearch ?? stats.meilisearch ?? { healthy: false, numberOfDocuments: 0 };
    const cookies =
      subs.cookies ?? stats.cookies ?? { totalDiscovered: 0, currentBatchCount: 0, maxRequestsPerBatch: 5 };
    const cache =
      subs.audioCache ?? stats.cache ?? { totalFiles: 0, totalSizeGB: 0, maxLimitGB: 10, cacheDir: 'storage/audio-cache' };
    const umami =
      stats.umami ?? { configured: false, websiteId: '', dashboardUrl: '' };

    return {
      memoryRssMb,
      memoryHeapUsedMb,
      memoryHeapTotalMb,
      uptimeSeconds,
      cpuCount,
      nodeVersion,
      queueStream,
      meilisearch,
      cookies,
      cache,
      umami,
    };
  }, [stats]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-4xl max-h-[90vh] glass-panel rounded-3xl border border-white/15 shadow-2xl flex flex-col overflow-hidden text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pusat Kendali Admin MusicFY
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                  Rahasia
                </span>
              </h2>
              <p className="text-xs text-[#b3b3b3]">
                Telemetri server VPS, antrean streaming, rotasi cookie & kontrol sistem
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  onClick={() => fetchStats()}
                  className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                  title="Perbarui data"
                >
                  <RefreshCw className={cn('w-4 h-4', isLoadingStats && 'animate-spin')} />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-colors cursor-pointer"
                  title="Keluar dari Admin"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              title="Tutup (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          {!isAuthenticated ? (
            /* Login Form */
            <div className="py-12 px-4 max-w-sm mx-auto text-center space-y-5">
              <div className="w-14 h-14 mx-auto rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 shadow-lg">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Masukkan Kata Sandi Admin</h3>
                <p className="text-xs text-[#b3b3b3] mt-1">
                  Panel analitik privat dilindungi oleh variabel <code>ADMIN_PASSWORD</code> di server.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ketik kata sandi admin..."
                  autoFocus
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 focus:border-emerald-500 rounded-2xl text-sm text-white placeholder-white/40 focus:outline-none transition-all text-center tracking-widest"
                />
                <button
                  type="submit"
                  disabled={!password.trim() || isLoadingAuth}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-sm rounded-2xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingAuth ? 'Memverifikasi...' : 'Buka Dashboard'}
                </button>
              </form>
            </div>
          ) : (
            /* Authenticated Dashboard Metrics */
            <div className="space-y-6">
              {/* Full Super Admin Control Center Banner Link */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-teal-950/40 to-black/60 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Super Admin Control Center (/admin)
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        10 Tab Terintegrasi
                      </span>
                    </h3>
                    <p className="text-xs text-white/70 mt-0.5">
                      Monitoring VPS real-time, live visitor tracking, grafik CPU/RAM, dan log audit keamanan.
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <span>Buka Layar Penuh</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Top Row: System & Memory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl glass-card border border-white/10">
                  <div className="flex items-center justify-between text-white/60 mb-2">
                    <span className="text-xs font-semibold">Memori RAM (RSS)</span>
                    <Cpu className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-white">
                    {normalizedStats?.memoryRssMb ?? '...'} MB
                  </div>
                  <p className="text-[11px] text-[#b3b3b3] mt-1">
                    Heap Used: {normalizedStats?.memoryHeapUsedMb ?? 0} MB / {normalizedStats?.memoryHeapTotalMb ?? 0} MB
                  </p>
                </div>

                <div className="p-4 rounded-2xl glass-card border border-white/10">
                  <div className="flex items-center justify-between text-white/60 mb-2">
                    <span className="text-xs font-semibold">Waktu Aktif (Uptime)</span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-xl font-bold text-white">
                    {normalizedStats?.uptimeSeconds
                      ? `${Math.floor(normalizedStats.uptimeSeconds / 3600)}j ${Math.floor(
                          (normalizedStats.uptimeSeconds % 3600) / 60
                        )}m`
                      : '...'}
                  </div>
                  <p className="text-[11px] text-[#b3b3b3] mt-1">
                    CPU: {normalizedStats?.cpuCount ?? 4} Core • Node {normalizedStats?.nodeVersion}
                  </p>
                </div>

                <div className="p-4 rounded-2xl glass-card border border-white/10">
                  <div className="flex items-center justify-between text-white/60 mb-2">
                    <span className="text-xs font-semibold">Antrean Streaming</span>
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl font-bold text-white">
                    {normalizedStats?.queueStream?.running ?? 0} Berjalan /{' '}
                    {normalizedStats?.queueStream?.queued ?? 0} Antre
                  </div>
                  <p className="text-[11px] text-[#b3b3b3] mt-1">
                    Total Selesai: {normalizedStats?.queueStream?.totalCompleted ?? 0}
                  </p>
                </div>

                <div className="p-4 rounded-2xl glass-card border border-white/10">
                  <div className="flex items-center justify-between text-white/60 mb-2">
                    <span className="text-xs font-semibold">Meilisearch Cluster</span>
                    <Database className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-white flex items-center gap-1.5">
                    <span
                      className={cn(
                        'w-2.5 h-2.5 rounded-full',
                        normalizedStats?.meilisearch?.healthy ? 'bg-emerald-400' : 'bg-rose-400'
                      )}
                    />
                    {normalizedStats?.meilisearch?.healthy ? 'Online (<50ms)' : 'Offline'}
                  </div>
                  <p className="text-[11px] text-[#b3b3b3] mt-1">
                    {normalizedStats?.meilisearch?.numberOfDocuments ?? 0} lagu terindeks
                  </p>
                </div>
              </div>

              {/* Umami Analytics Integration Card */}
              <div className="p-5 rounded-2xl glass-card border border-white/15 bg-gradient-to-r from-white/[0.03] to-white/[0.01]">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Umami Analytics (Statistik Pengunjung)
                        {normalizedStats?.umami?.configured ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                            Terkonfigurasi
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                            Belum Dikonfigurasi
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-[#b3b3b3] mt-0.5">
                        {normalizedStats?.umami?.websiteId
                          ? `Website ID: ${normalizedStats.umami.websiteId}`
                          : 'Tambahkan NEXT_PUBLIC_UMAMI_WEBSITE_ID di berkas .env untuk mengaktifkan pelacakan.'}
                      </p>
                    </div>
                  </div>

                  {normalizedStats?.umami?.dashboardUrl && (
                    <a
                      href={normalizedStats.umami.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg cursor-pointer"
                    >
                      <span>Buka Dashboard Umami</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Bottom Row: Cookie Rotation Pool & Server Audio Disk Cache */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cookie Pool */}
                <div className="p-4 md:p-5 rounded-2xl glass-card border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-emerald-400" />
                      Status Kolam Cookie yt-dlp
                    </h4>
                    <span className="text-xs text-[#b3b3b3]">
                      {normalizedStats?.cookies?.totalDiscovered ?? 0} Berkas Terdeteksi
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-white/60">Cookie Aktif:</span>
                      <span className="text-emerald-300 font-bold">
                        {normalizedStats?.cookies?.currentActiveFilename || 'Fallback Standar'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Permintaan Batch Saat Ini:</span>
                      <span className="text-white">
                        {normalizedStats?.cookies?.currentBatchCount ?? 0} /{' '}
                        {normalizedStats?.cookies?.maxRequestsPerBatch ?? 5}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Berkas Terdaftar:</span>
                      <span className="text-white/90 truncate max-w-[200px]">
                        {normalizedStats?.cookies?.activeCookieFilenames?.join(', ') || 'cookies.txt'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Disk Cache */}
                <div className="p-4 md:p-5 rounded-2xl glass-card border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-sky-400" />
                      Penyimpanan Cache MP3 Server
                    </h4>
                    <span className="text-xs text-[#b3b3b3]">
                      {normalizedStats?.cache?.totalFiles ?? 0} Berkas Audio
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-white/60">Kapasitas Terpakai:</span>
                      <span className="text-sky-300 font-bold">
                        {normalizedStats?.cache?.totalSizeGB ?? '0'} GB /{' '}
                        {normalizedStats?.cache?.maxLimitGB ?? 10} GB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Direktori Cache:</span>
                      <span className="text-white/80 truncate max-w-[200px]">
                        {normalizedStats?.cache?.cacheDir || 'storage/audio-cache'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default AdminDashboardModal;
