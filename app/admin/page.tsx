'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Activity,
  Cpu,
  Users,
  Radio,
  TrendingUp,
  Layers,
  FileText,
  ShieldAlert,
  Settings,
  RefreshCw,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpRight,
  HardDrive,
  Wifi,
  Terminal,
  Server,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Search,
  Trash2,
  Database,
  Music,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

type AdminTab =
  | 'overview'
  | 'monitoring'
  | 'vps'
  | 'visitors'
  | 'live'
  | 'traffic'
  | 'application'
  | 'logs'
  | 'security'
  | 'settings';

interface AdminStatsResponse {
  vps: {
    health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    healthReasons: string[];
    specs: {
      cpu: {
        model: string;
        architecture: string;
        cores: number;
        threads: number;
        frequencyMhz: number;
        loadAverage: [number, number, number];
      };
      ram: {
        totalBytes: number;
        usedBytes: number;
        availableBytes: number;
        freeBytes: number;
        usagePercent: number;
        swapTotalBytes: number;
        swapUsedBytes: number;
        swapPercent: number;
      };
      storage: {
        diskType: string;
        filesystem: string;
        mountPoint: string;
        totalBytes: number;
        usedBytes: number;
        freeBytes: number;
        usagePercent: number;
      };
      system: {
        osName: string;
        osVersion: string;
        kernelVersion: string;
        hostname: string;
        serverUptimeSeconds: number;
        serverTimeIso: string;
        timezone: string;
      };
    };
    network: {
      downloadSpeedKbps: number;
      uploadSpeedKbps: number;
      totalRxBytes: number;
      totalTxBytes: number;
      interfaces: string[];
    };
    application: {
      status: string;
      nodeVersion: string;
      nextVersion: string;
      processUptimeSeconds: number;
      memoryRssMb: number;
      memoryHeapUsedMb: number;
      memoryHeapTotalMb: number;
    };
    history: Array<{
      timestamp: number;
      cpuPercent: number;
      ramPercent: number;
      diskPercent: number;
      loadAvg1m: number;
      networkRxRateKbps: number;
      networkTxRateKbps: number;
    }>;
  };
  visitors: {
    totalVisitors: number;
    uniqueVisitors: number;
    totalPageViews: number;
    visitorsToday: number;
    visitorsThisWeek: number;
    visitorsThisMonth: number;
    activeVisitorsNow: number;
    newVisitorsToday: number;
    returningVisitorsToday: number;
    popularPages: Array<{ page: string; views: number }>;
    trafficByDevice: { Desktop: number; Mobile: number; Tablet: number };
    trafficByBrowser: Record<string, number>;
    hourlyTrend: Array<{ hour: string; pageViews: number; visitors: number }>;
  };
  liveVisitors: Array<{
    visitorId: string;
    accountName?: string;
    deviceLabel: string;
    deviceType: 'Desktop' | 'Mobile' | 'Tablet';
    os: string;
    browser: string;
    browserVersion?: string;
    ip: string;
    country: string;
    city?: string;
    currentPage: string;
    firstVisit: number;
    lastActive: number;
    sessionDurationSeconds: number;
    isOnline: boolean;
  }>;
  logs: Array<{
    id: string;
    timestamp: number;
    type: string;
    message: string;
    ip: string;
    severity: 'info' | 'warning' | 'critical';
    details?: Record<string, any>;
  }>;
  subsystems: {
    queues: {
      stream: { active: number; queued: number; peakConcurrency: number; totalCompleted: number };
      download: { active: number; queued: number; peakConcurrency: number; totalCompleted: number };
    };
    audioCache: { count: number; totalSizeBytes: number; formattedSize: string };
    meilisearch: { healthy: boolean; numberOfDocuments: number };
    cookies: { total: number; valid: number; inUse: number };
    umami: { configured: boolean; websiteId: string | null; dashboardUrl: string | null };
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '0 menit';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0 || days > 0) parts.push(`${hours}j`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(5);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [visitorFilter, setVisitorFilter] = useState<string>('');
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [maskIp, setMaskIp] = useState<boolean>(false);

  // Digital clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch admin stats from API
  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data);
        }
      } else if (res.status === 401) {
        toast.error('Sesi admin berakhir. Silakan login kembali.');
        router.push('/settings');
      }
    } catch (err) {
      console.warn('[Admin] Failed to load server metrics:', err);
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, [router]);

  // Initial load
  useEffect(() => {
    fetchStats(false);
  }, [fetchStats]);

  // Polling loop
  useEffect(() => {
    if (pollIntervalSec <= 0) return;
    const interval = setInterval(() => {
      fetchStats(false);
    }, pollIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [pollIntervalSec, fetchStats]);

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      toast.success('Sesi administrator ditutup.');
      router.push('/');
    } catch {
      router.push('/');
    }
  };

  // Execute admin maintenance action
  const handleAdminAction = async (action: string, label: string) => {
    const confirmed = window.confirm(`Jalankan aksi: "${label}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || `Aksi "${label}" berhasil dijalankan.`);
        fetchStats(true);
      } else {
        toast.error(json.message || 'Gagal menjalankan aksi.');
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan.');
    }
  };

  const vps = data?.vps;
  const visitors = data?.visitors;
  const liveVisitors = useMemo(() => data?.liveVisitors || [], [data?.liveVisitors]);
  const logs = useMemo(() => data?.logs || [], [data?.logs]);
  const subsystems = data?.subsystems;

  // Filtered live visitors
  const filteredVisitors = useMemo(() => {
    if (!visitorFilter) return liveVisitors;
    const q = visitorFilter.toLowerCase();
    return liveVisitors.filter(
      (v) =>
        v.visitorId.toLowerCase().includes(q) ||
        v.deviceLabel.toLowerCase().includes(q) ||
        v.ip.toLowerCase().includes(q) ||
        v.currentPage.toLowerCase().includes(q) ||
        v.browser.toLowerCase().includes(q) ||
        v.os.toLowerCase().includes(q)
    );
  }, [liveVisitors, visitorFilter]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((l) => l.severity === logFilter);
  }, [logs, logFilter]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#09090b] text-white space-y-4">
        <RefreshCw className="w-9 h-9 text-emerald-500 animate-spin" />
        <p className="text-sm font-semibold tracking-wide text-white/70">
          Memuat Server Monitoring & VPS Specifications...
        </p>
      </div>
    );
  }

  const healthColor =
    vps?.health === 'CRITICAL'
      ? 'text-red-400 bg-red-500/10 border-red-500/30'
      : vps?.health === 'WARNING'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-[#09090b]">
      {/* ------------------------------------------------------------- */}
      {/* 1. DEDICATED SUPER ADMIN SIDEBAR                              */}
      {/* ------------------------------------------------------------- */}
      <aside className="w-full md:w-64 lg:w-72 bg-[#101014] border-r border-white/[0.08] flex flex-col shrink-0 z-20">
        {/* Brand Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 font-black text-sm">
              M
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-white">MusicFY</span>
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Control
                </span>
              </div>
              <p className="text-[11px] text-white/50">VPS & Server Monitor</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'monitoring', label: 'Server Monitoring', icon: Activity },
            { id: 'vps', label: 'VPS Specifications', icon: Cpu },
            { id: 'visitors', label: 'Visitor Analytics', icon: Users },
            { id: 'live', label: 'Live Visitors', icon: Radio, badge: visitors?.activeVisitorsNow },
            { id: 'traffic', label: 'Traffic Analytics', icon: TrendingUp },
            { id: 'application', label: 'Application Health', icon: Layers },
            { id: 'logs', label: 'Activity Logs', icon: FileText },
            { id: 'security', label: 'Security & Access', icon: ShieldAlert },
            { id: 'settings', label: 'System Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none text-left',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cn('w-4 h-4', isActive ? 'text-emerald-400' : 'text-white/50')} />
                  <span>{tab.label}</span>
                </div>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Server Mini Status Footnote */}
        <div className="p-3 border-t border-white/[0.08] bg-[#0c0c0f]">
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Hostname:</span>
              <span className="font-mono text-white/90 truncate max-w-[120px]">{vps?.specs.system.hostname || 'VPS'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">OS:</span>
              <span className="text-white/90 truncate max-w-[120px]">{vps?.specs.system.osName || 'Linux'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">Uptime:</span>
              <span className="font-mono text-emerald-400">{formatUptime(vps?.specs.system.serverUptimeSeconds || 0)}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN ADMIN CONTENT WORKSPACE                               */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 px-6 border-b border-white/[0.08] bg-[#101014]/90 backdrop-blur-xl flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-white tracking-tight capitalize">
              {activeTab === 'overview' && 'System Overview'}
              {activeTab === 'monitoring' && 'Server & Hardware Monitoring'}
              {activeTab === 'vps' && 'VPS Hardware Specifications'}
              {activeTab === 'visitors' && 'Visitor Analytics'}
              {activeTab === 'live' && 'Real-Time Connected Visitors'}
              {activeTab === 'traffic' && 'Network & Traffic Analytics'}
              {activeTab === 'application' && 'Application Subsystems & Queues'}
              {activeTab === 'logs' && 'Administrative Audit Logs'}
              {activeTab === 'security' && 'Security & Threat Prevention'}
              {activeTab === 'settings' && 'System Settings & Maintenance'}
            </h1>

            {/* Server Health Status Pill */}
            <div className={cn('hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', healthColor)}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              <span>{vps?.health || 'HEALTHY'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live Digital Clock */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-white/80">
              <Clock className="w-3.5 h-3.5 text-white/50" />
              <span>{currentTime || '00:00:00'}</span>
            </div>

            {/* Auto Refresh Interval Selector */}
            <div className="hidden sm:flex items-center gap-1 text-xs">
              <select
                value={pollIntervalSec}
                onChange={(e) => setPollIntervalSec(Number(e.target.value))}
                className="bg-white/[0.04] border border-white/[0.08] text-white/80 rounded-xl px-2.5 py-1.5 text-xs outline-none cursor-pointer focus:border-emerald-500/50"
              >
                <option value={3} className="bg-[#16161a]">Setiap 3s</option>
                <option value={5} className="bg-[#16161a]">Setiap 5s</option>
                <option value={10} className="bg-[#16161a]">Setiap 10s</option>
                <option value={30} className="bg-[#16161a]">Setiap 30s</option>
                <option value={0} className="bg-[#16161a]">Jeda</option>
              </select>
            </div>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={() => fetchStats(true)}
              disabled={isRefreshing}
              className="p-2 text-white/70 hover:text-white rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
              title="Perbarui data server manual"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin text-emerald-400')} />
            </button>

            {/* Back to MusicFY link */}
            <button
              type="button"
              onClick={() => router.push('/')}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-emerald-400" />
              <span>Buka MusicFY</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-semibold text-red-300 hover:text-red-200 transition-colors cursor-pointer"
              title="Keluar dari sesi administrator"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* ========================================================= */}
          {/* TAB 1: OVERVIEW                                           */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* 8 Primary KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {/* 1. Total Visitors */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Total Pengunjung</span>
                    <Users className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
                      {visitors?.totalVisitors.toLocaleString('id-ID') || 0}
                    </span>
                    <p className="text-[11px] text-white/50 mt-1">Semua waktu (Unik)</p>
                  </div>
                </div>

                {/* 2. Active Visitors Now */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Pengunjung Online</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl md:text-3xl font-black text-emerald-400 tracking-tight">
                      {visitors?.activeVisitorsNow || 0}
                    </span>
                    <p className="text-[11px] text-white/50 mt-1">Sedang aktif di web</p>
                  </div>
                </div>

                {/* 3. CPU Usage */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>CPU Usage</span>
                    <Cpu className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
                      {vps?.history[vps.history.length - 1]?.cpuPercent || 0}%
                    </span>
                    <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${vps?.history[vps.history.length - 1]?.cpuPercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. RAM Usage */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>RAM Usage</span>
                    <Activity className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        {vps?.specs.ram.usagePercent || 0}%
                      </span>
                      <span className="text-xs text-white/50">
                        ({formatBytes(vps?.specs.ram.usedBytes || 0)})
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-teal-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${vps?.specs.ram.usagePercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Storage Usage */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Storage NVMe</span>
                    <HardDrive className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        {vps?.specs.storage.usagePercent || 0}%
                      </span>
                      <span className="text-xs text-white/50">
                        (Sisa {formatBytes(vps?.specs.storage.freeBytes || 0)})
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-amber-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${vps?.specs.storage.usagePercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 6. Server Uptime */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Server Uptime</span>
                    <Clock className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
                      {formatUptime(vps?.specs.system.serverUptimeSeconds || 0)}
                    </span>
                    <p className="text-[11px] text-white/50 mt-1">Tanpa restart</p>
                  </div>
                </div>

                {/* 7. Network Transfer */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>Network Rate</span>
                    <Wifi className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl md:text-2xl font-black text-white tracking-tight">
                        ↓{vps?.network.downloadSpeedKbps || 0}
                      </span>
                      <span className="text-xs text-white/60">kB/s</span>
                      <span className="text-xl md:text-2xl font-black text-white/80 tracking-tight">
                        ↑{vps?.network.uploadSpeedKbps || 0}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-1">Total {formatBytes(vps?.network.totalRxBytes || 0)}</p>
                  </div>
                </div>

                {/* 8. Application Status */}
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-md flex flex-col justify-between">
                  <div className="flex items-center justify-between text-white/50 text-xs">
                    <span>App Status</span>
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl md:text-3xl font-black text-emerald-400 tracking-tight">
                      {vps?.application.status || 'ONLINE'}
                    </span>
                    <p className="text-[11px] text-white/50 mt-1">Node {vps?.application.nodeVersion}</p>
                  </div>
                </div>
              </div>

              {/* Real-time Hardware Charts (CPU & RAM) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* CPU Real-Time Graph */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-lg flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">CPU Usage Real-Time</h3>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      {vps?.history[vps.history.length - 1]?.cpuPercent || 0}%
                    </span>
                  </div>

                  {/* SVG Historical Chart */}
                  <div className="h-44 w-full relative flex items-end">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
                      <defs>
                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Grid lines */}
                      <line x1="0" y1="25" x2="300" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="75" x2="300" y2="75" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                      {/* Area & Line */}
                      {vps?.history && vps.history.length > 1 && (
                        <>
                          <polygon
                            fill="url(#cpuGradient)"
                            points={`0,100 ${vps.history
                              .map((h, i) => `${(i / (vps.history.length - 1)) * 300},${100 - h.cpuPercent}`)
                              .join(' ')} 300,100`}
                          />
                          <polyline
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            points={vps.history
                              .map((h, i) => `${(i / (vps.history.length - 1)) * 300},${100 - h.cpuPercent}`)
                              .join(' ')}
                          />
                        </>
                      )}
                    </svg>
                  </div>
                  <div className="flex justify-between text-[11px] text-white/40 mt-2">
                    <span>30 sampel lalu</span>
                    <span>Load 1m: {vps?.specs.cpu.loadAverage[0]}</span>
                    <span>Sekarang</span>
                  </div>
                </div>

                {/* RAM Real-Time Graph */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-lg flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-400" />
                      <h3 className="text-sm font-bold text-white">RAM Usage Real-Time</h3>
                    </div>
                    <span className="text-xs font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                      {vps?.specs.ram.usagePercent || 0}%
                    </span>
                  </div>

                  {/* SVG Historical Chart */}
                  <div className="h-44 w-full relative flex items-end">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
                      <defs>
                        <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="25" x2="300" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="75" x2="300" y2="75" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                      {vps?.history && vps.history.length > 1 && (
                        <>
                          <polygon
                            fill="url(#ramGradient)"
                            points={`0,100 ${vps.history
                              .map((h, i) => `${(i / (vps.history.length - 1)) * 300},${100 - h.ramPercent}`)
                              .join(' ')} 300,100`}
                          />
                          <polyline
                            fill="none"
                            stroke="#14b8a6"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            points={vps.history
                              .map((h, i) => `${(i / (vps.history.length - 1)) * 300},${100 - h.ramPercent}`)
                              .join(' ')}
                          />
                        </>
                      )}
                    </svg>
                  </div>
                  <div className="flex justify-between text-[11px] text-white/40 mt-2">
                    <span>Terpakai: {formatBytes(vps?.specs.ram.usedBytes || 0)}</span>
                    <span>Tersedia: {formatBytes(vps?.specs.ram.availableBytes || 0)}</span>
                    <span>Total: {formatBytes(vps?.specs.ram.totalBytes || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Split: Mini Live Visitors & Recent Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Live Visitors Mini Table */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">Live Visitors Terbaru</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('live')}
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>Lihat Semua</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.06]">
                    {liveVisitors.slice(0, 5).map((vis) => (
                      <div key={vis.visitorId} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full shrink-0',
                              vis.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'
                            )}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">
                              {vis.deviceLabel}
                            </p>
                            <p className="text-[11px] text-white/50 truncate font-mono">
                              {vis.currentPage} • {maskIp ? 'xxx.xxx.xxx' : vis.ip}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-white/40 shrink-0 ml-2">
                          {formatUptime(vis.sessionDurationSeconds)}
                        </span>
                      </div>
                    ))}
                    {liveVisitors.length === 0 && (
                      <p className="py-4 text-center text-xs text-white/40">Belum ada pengunjung tercatat.</p>
                    )}
                  </div>
                </div>

                {/* Recent Activity Mini */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold text-white">Log Aktivitas Terbaru</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('logs')}
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <span>Lihat Log</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.06]">
                    {logs.slice(0, 5).map((log) => (
                      <div key={log.id} className="py-2.5 text-xs flex items-start gap-2.5">
                        <span
                          className={cn(
                            'text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0',
                            log.severity === 'critical'
                              ? 'bg-red-500/20 text-red-400'
                              : log.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-400'
                          )}
                        >
                          {log.type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-white/80 leading-relaxed truncate">{log.message}</p>
                          <p className="text-[10px] font-mono text-white/40 mt-0.5">
                            {new Date(log.timestamp).toLocaleTimeString('id-ID')} • IP {maskIp ? 'xxx' : log.ip}
                          </p>
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="py-4 text-center text-xs text-white/40">Belum ada log aktivitas tercatat.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: SERVER MONITORING                                  */}
          {/* ========================================================= */}
          {activeTab === 'monitoring' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Health Evaluation Banner */}
              <div className={cn('p-4 rounded-2xl border flex items-center gap-3', healthColor)}>
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Status Kesehatan Server: {vps?.health}</h4>
                  <p className="text-xs opacity-80 mt-0.5">
                    {vps?.healthReasons.join(' • ')}
                  </p>
                </div>
              </div>

              {/* Hardware Progress Bars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CPU Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">CPU Utilized</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {vps?.history[vps.history.length - 1]?.cpuPercent || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${vps?.history[vps.history.length - 1]?.cpuPercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-white/60 space-y-1 pt-1">
                    <p>Load 1m: {vps?.specs.cpu.loadAverage[0]}</p>
                    <p>Load 5m: {vps?.specs.cpu.loadAverage[1]}</p>
                    <p>Load 15m: {vps?.specs.cpu.loadAverage[2]}</p>
                  </div>
                </div>

                {/* RAM Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">RAM Utilized</span>
                    <span className="text-xs font-mono font-bold text-teal-400">
                      {vps?.specs.ram.usagePercent || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${vps?.specs.ram.usagePercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-white/60 space-y-1 pt-1">
                    <p>Terpakai: {formatBytes(vps?.specs.ram.usedBytes || 0)}</p>
                    <p>Tersedia: {formatBytes(vps?.specs.ram.availableBytes || 0)}</p>
                    <p>Swap: {vps?.specs.ram.swapPercent}% ({formatBytes(vps?.specs.ram.swapUsedBytes || 0)})</p>
                  </div>
                </div>

                {/* Disk Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">NVMe Storage</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {vps?.specs.storage.usagePercent || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${vps?.specs.storage.usagePercent || 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-white/60 space-y-1 pt-1">
                    <p>Terpakai: {formatBytes(vps?.specs.storage.usedBytes || 0)}</p>
                    <p>Sisa: {formatBytes(vps?.specs.storage.freeBytes || 0)}</p>
                    <p>Total: {formatBytes(vps?.specs.storage.totalBytes || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Network Interfaces Detail */}
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08]">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-blue-400" />
                  <span>Network Interfaces & Transfer Rate</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-white/50 block">Download Speed</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">
                      {vps?.network.downloadSpeedKbps} kB/s
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-white/50 block">Upload Speed</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">
                      {vps?.network.uploadSpeedKbps} kB/s
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-white/50 block">Total Ingress (RX)</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">
                      {formatBytes(vps?.network.totalRxBytes || 0)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-white/50 block">Total Egress (TX)</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">
                      {formatBytes(vps?.network.totalTxBytes || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: VPS SPECIFICATIONS (DATA AKTUAL)                    */}
          {/* ========================================================= */}
          {activeTab === 'vps' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                Data spesifikasi di bawah dideteksi secara dinamis langsung dari sistem operasi Linux VPS yang sedang menjalankan MusicFY.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Hardware Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/[0.08] pb-3">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Processor & Hardware</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Model CPU:</span>
                      <span className="font-semibold text-white text-right">{vps?.specs.cpu.model}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Arsitektur:</span>
                      <span className="font-mono text-white">{vps?.specs.cpu.architecture}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Total CPU Cores:</span>
                      <span className="font-bold text-emerald-400">{vps?.specs.cpu.cores} Core</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Threads:</span>
                      <span className="font-mono text-white">{vps?.specs.cpu.threads} Threads</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Clock Frequency:</span>
                      <span className="font-mono text-white">{vps?.specs.cpu.frequencyMhz} MHz</span>
                    </div>
                  </div>
                </div>

                {/* Storage & Memory Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/[0.08] pb-3">
                    <HardDrive className="w-4 h-4 text-amber-400" />
                    <span>Memory & NVMe Storage</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Kapasitas RAM Fisik:</span>
                      <span className="font-bold text-teal-400">{formatBytes(vps?.specs.ram.totalBytes || 0)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Tipe Storage:</span>
                      <span className="font-mono text-white uppercase">{vps?.specs.storage.diskType} Storage</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Filesystem:</span>
                      <span className="font-mono text-white">{vps?.specs.storage.filesystem}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Mount Point:</span>
                      <span className="font-mono text-white">{vps?.specs.storage.mountPoint}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-white/50">Total Storage Disk:</span>
                      <span className="font-bold text-amber-400">{formatBytes(vps?.specs.storage.totalBytes || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Operating System Card */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-4 md:col-span-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/[0.08] pb-3">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Sistem Operasi & Host Environment</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Operating System:</span>
                        <span className="font-semibold text-white">{vps?.specs.system.osName}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Kernel Version:</span>
                        <span className="font-mono text-white">{vps?.specs.system.kernelVersion}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Hostname:</span>
                        <span className="font-mono text-white">{vps?.specs.system.hostname}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Domain Utama:</span>
                        <span className="font-mono text-emerald-400">shanz.my.id</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Timezone Server:</span>
                        <span className="font-mono text-white">{vps?.specs.system.timezone}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-white/50">Node.js Runtime:</span>
                        <span className="font-mono text-white">{vps?.application.nodeVersion}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: VISITOR ANALYTICS                                  */}
          {/* ========================================================= */}
          {activeTab === 'visitors' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Analytics KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-xs text-white/50">Pengunjung Hari Ini</span>
                  <p className="text-2xl font-black text-white mt-2">{visitors?.visitorsToday || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-xs text-white/50">Pengunjung Minggu Ini</span>
                  <p className="text-2xl font-black text-white mt-2">{visitors?.visitorsThisWeek || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-xs text-white/50">Pengunjung Bulan Ini</span>
                  <p className="text-2xl font-black text-white mt-2">{visitors?.visitorsThisMonth || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-xs text-white/50">Total Page Views</span>
                  <p className="text-2xl font-black text-emerald-400 mt-2">{visitors?.totalPageViews || 0}</p>
                </div>
              </div>

              {/* Popular Routes */}
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08]">
                <h3 className="text-sm font-bold text-white mb-3">Halaman Paling Sering Dikunjungi</h3>
                <div className="space-y-2.5">
                  {visitors?.popularPages.map((p) => (
                    <div key={p.page} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-white/90">{p.page}</span>
                      <span className="font-bold text-emerald-400">{p.views} tayangan</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Device and Browser Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <h3 className="text-sm font-bold text-white mb-3">Distribusi Perangkat</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" /> Desktop</span>
                      <span className="font-bold">{visitors?.trafficByDevice.Desktop || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Mobile</span>
                      <span className="font-bold">{visitors?.trafficByDevice.Mobile || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5"><Tablet className="w-3.5 h-3.5" /> Tablet</span>
                      <span className="font-bold">{visitors?.trafficByDevice.Tablet || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <h3 className="text-sm font-bold text-white mb-3">Browser Pengunjung</h3>
                  <div className="space-y-2 text-xs">
                    {Object.entries(visitors?.trafficByBrowser || {}).map(([b, count]) => (
                      <div key={b} className="flex justify-between">
                        <span>{b}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: LIVE VISITORS (REAL-TIME CONNECTED DEVICES TABLE)  */}
          {/* ========================================================= */}
          {activeTab === 'live' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Filter and IP Mask Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={visitorFilter}
                    onChange={(e) => setVisitorFilter(e.target.value)}
                    placeholder="Cari ID, OS, browser, IP..."
                    className="w-full bg-[#121216] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-white/60">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={maskIp}
                      onChange={(e) => setMaskIp(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Sensor Alamat IP</span>
                  </label>
                  <span>Total: {filteredVisitors.length} perangkat</span>
                </div>
              </div>

              {/* Connected Visitors Table */}
              <div className="rounded-2xl bg-[#121216] border border-white/[0.08] overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#18181e] text-white/50 border-b border-white/[0.06] text-[11px] uppercase font-mono">
                      <tr>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Pengunjung / ID</th>
                        <th className="py-3 px-4">Perangkat & OS</th>
                        <th className="py-3 px-4">Browser</th>
                        <th className="py-3 px-4">Alamat IP</th>
                        <th className="py-3 px-4">Halaman Aktif</th>
                        <th className="py-3 px-4">Durasi Sesi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredVisitors.map((vis) => (
                        <tr key={vis.visitorId} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4">
                            {vis.isOnline ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/40">
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-white">
                            {vis.accountName || vis.visitorId.slice(0, 14)}
                          </td>
                          <td className="py-3 px-4 text-white/80">
                            {vis.deviceLabel}
                          </td>
                          <td className="py-3 px-4 text-white/80">
                            {vis.browser} {vis.browserVersion ? `v${vis.browserVersion}` : ''}
                          </td>
                          <td className="py-3 px-4 font-mono text-white/60">
                            {maskIp ? 'xxx.xxx.xxx' : vis.ip}
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-400">
                            {vis.currentPage}
                          </td>
                          <td className="py-3 px-4 font-mono text-white/50">
                            {formatUptime(vis.sessionDurationSeconds)}
                          </td>
                        </tr>
                      ))}
                      {filteredVisitors.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-white/40">
                            Tidak ada pengunjung yang sesuai filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: TRAFFIC ANALYTICS                                  */}
          {/* ========================================================= */}
          {activeTab === 'traffic' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-white/50 block">Estimasi Kecepatan Masuk</span>
                  <span className="text-2xl font-mono font-bold text-white mt-1 block">
                    {vps?.network.downloadSpeedKbps} kB/s
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-white/50 block">Estimasi Kecepatan Keluar</span>
                  <span className="text-2xl font-mono font-bold text-white mt-1 block">
                    {vps?.network.uploadSpeedKbps} kB/s
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-[#121216] border border-white/[0.08]">
                  <span className="text-white/50 block">Total Bandwidth Terpakai</span>
                  <span className="text-2xl font-mono font-bold text-emerald-400 mt-1 block">
                    {formatBytes((vps?.network.totalRxBytes || 0) + (vps?.network.totalTxBytes || 0))}
                  </span>
                </div>
              </div>

              {/* Popular Routes Table */}
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08]">
                <h3 className="text-sm font-bold text-white mb-3">Distribusi Kunjungan URL Halaman</h3>
                <div className="space-y-3">
                  {visitors?.popularPages.map((p) => {
                    const pct = Math.round((p.views / (visitors.totalPageViews || 1)) * 100);
                    return (
                      <div key={p.page} className="space-y-1 text-xs">
                        <div className="flex justify-between font-mono">
                          <span className="text-white">{p.page}</span>
                          <span className="text-white/60">{p.views} views ({pct}%)</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: APPLICATION MONITORING                             */}
          {/* ========================================================= */}
          {activeTab === 'application' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Audio Stream Queue */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-2 text-xs">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Music className="w-4 h-4 text-emerald-400" />
                    <span>Audio Stream Queue</span>
                  </h3>
                  <div className="pt-2 space-y-1.5 text-white/70">
                    <p>Aktif Memutar: <span className="font-bold text-white">{subsystems?.queues.stream.active} stream</span></p>
                    <p>Antrean Menunggu: <span className="font-bold text-white">{subsystems?.queues.stream.queued}</span></p>
                    <p>Puncak Konkurensi: <span className="font-bold text-white">{subsystems?.queues.stream.peakConcurrency}</span></p>
                  </div>
                </div>

                {/* Audio File Cache */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-2 text-xs">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-teal-400" />
                    <span>Audio Disk Cache</span>
                  </h3>
                  <div className="pt-2 space-y-1.5 text-white/70">
                    <p>Jumlah File Tersimpan: <span className="font-bold text-white">{subsystems?.audioCache.count} lagu</span></p>
                    <p>Kapasitas Disk Terpakai: <span className="font-bold text-emerald-400">{subsystems?.audioCache.formattedSize}</span></p>
                  </div>
                </div>

                {/* Meilisearch Search Engine */}
                <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-2 text-xs">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>Meilisearch Engine</span>
                  </h3>
                  <div className="pt-2 space-y-1.5 text-white/70">
                    <p>Status: <span className={cn('font-bold', subsystems?.meilisearch.healthy ? 'text-emerald-400' : 'text-amber-400')}>{subsystems?.meilisearch.healthy ? 'Terhubung (<50ms)' : 'Offline/Fallback'}</span></p>
                    <p>Lagu Terindeks: <span className="font-bold text-white">{subsystems?.meilisearch.numberOfDocuments} tracks</span></p>
                  </div>
                </div>
              </div>

              {/* Node.js Process Memory */}
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-3">
                <h3 className="text-sm font-bold text-white">Memori Proses Node.js</h3>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.02]">
                    <span className="text-white/50 block">RSS Memory</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">{vps?.application.memoryRssMb} MB</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02]">
                    <span className="text-white/50 block">Heap Used</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">{vps?.application.memoryHeapUsedMb} MB</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02]">
                    <span className="text-white/50 block">Heap Total</span>
                    <span className="text-lg font-mono font-bold text-white mt-1 block">{vps?.application.memoryHeapTotalMb} MB</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: ACTIVITY LOGS                                      */}
          {/* ========================================================= */}
          {activeTab === 'logs' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(['all', 'info', 'warning', 'critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setLogFilter(sev)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-semibold uppercase transition-all cursor-pointer',
                        logFilter === sev
                          ? 'bg-white text-black font-bold'
                          : 'bg-white/[0.05] text-white/60 hover:text-white'
                      )}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-white/50">{filteredLogs.length} entri tercatat</span>
              </div>

              <div className="rounded-2xl bg-[#121216] border border-white/[0.08] divide-y divide-white/[0.04] overflow-hidden">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-start justify-between gap-4 text-xs">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded shrink-0 mt-0.5',
                          log.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : log.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-blue-500/20 text-blue-400'
                        )}
                      >
                        {log.type}
                      </span>
                      <div>
                        <p className="text-white font-medium">{log.message}</p>
                        <p className="text-[11px] font-mono text-white/40 mt-1">
                          IP: {maskIp ? 'xxx.xxx.xxx' : log.ip}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-white/40 shrink-0 text-[11px]">
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <p className="p-8 text-center text-xs text-white/40">Tidak ada log pada filter ini.</p>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 9: SECURITY & ACCESS                                  */}
          {/* ========================================================= */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Sistem Proteksi Keamanan Admin</span>
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">Rate Limiter & Brute-Force Shield</p>
                      <p className="text-white/50 text-[11px] mt-0.5">Maksimum 5 kegagalan login sebelum IP dikunci selama 15 menit.</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      AKTIF
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">HttpOnly SameSite Cookie Session</p>
                      <p className="text-white/50 text-[11px] mt-0.5">Cookie sesi tidak dapat dibaca oleh script browser untuk mencegah pencurian token.</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      AKTIF
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">Timing-Safe Password Comparison</p>
                      <p className="text-white/50 text-[11px] mt-0.5">Mencegah serangan side-channel timing attack pada verifikasi password.</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      AKTIF
                    </span>
                  </div>
                </div>
              </div>

              {/* Trigger manual alert test */}
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Uji Coba Alarm Keamanan</h4>
                  <p className="text-xs text-white/50 mt-0.5">Mencatat pengujian audit log keamanan pada server.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdminAction('test_alert', 'Uji Coba Alert Keamanan')}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/30 transition-all cursor-pointer"
                >
                  Picu Uji Coba
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 10: SYSTEM SETTINGS & MAINTENANCE                     */}
          {/* ========================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-[#121216] border border-white/[0.08] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-400" />
                  <span>Pemeliharaan & Pembersihan Cache Server</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Action 1: Clear Audio Cache */}
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Bersihkan Cache Audio Disk</h4>
                      <p className="text-[11px] text-white/50 mt-1">
                        Menghapus file chunk audio yang tersimpan di disk server untuk menghemat ruang NVMe.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdminAction('clear_audio_cache', 'Bersihkan Cache Audio')}
                      className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-xs font-semibold border border-red-500/30 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Kosongkan Cache Audio</span>
                    </button>
                  </div>

                  {/* Action 2: Clear Lyrics Cache */}
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Bersihkan Cache Lirik Sinkron</h4>
                      <p className="text-[11px] text-white/50 mt-1">
                        Menghapus data lirik AI yang tersimpan di disk server agar dianalisis ulang.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdminAction('clear_lyrics_cache', 'Hapus Cache Lirik')}
                      className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Cache Lirik</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
