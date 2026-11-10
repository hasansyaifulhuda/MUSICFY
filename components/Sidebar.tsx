'use client';

import { memo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, Library, Clock, DownloadCloud, Smartphone, Settings, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAIN_NAV = [
  { name: 'Beranda', href: '/', icon: Home },
  { name: 'Cari', href: '/search', icon: Search },
];

const LIBRARY_NAV = [
  { name: 'Koleksi', href: '/library', icon: Library },
  { name: 'Download', href: '/download', icon: DownloadCloud },
  { name: 'Riwayat Putar', href: '/history', icon: Clock },
  { name: 'Install APK', href: '/install-apk', icon: Smartphone },
  { name: 'Pengaturan', href: '/settings', icon: Settings },
];

const ALL_NAV_ROUTES = ['/', '/search', '/library', '/download', '/history', '/settings', '/top50'];

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = pathname?.startsWith('/admin');

  // Proactive background prefetching for instant 0ms navigation
  useEffect(() => {
    if (isAdmin) return;

    const prefetchRoutes = () => {
      ALL_NAV_ROUTES.forEach((route) => {
        try {
          router.prefetch(route);
        } catch {}
      });
    };

    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetchRoutes, { timeout: 1500 });
      } else {
        setTimeout(prefetchRoutes, 200);
      }
    }
  }, [router, isAdmin]);

  if (isAdmin) {
    return null;
  }

  return (
    <aside className="hidden md:flex flex-col fixed top-0 left-0 bottom-24 w-64 lg:w-72 p-2 gap-2 z-30 select-none bg-transparent gpu-accelerated contain-paint">
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-5 border border-white/[0.08] shadow-2xl">
        <Link
          href="/"
          prefetch={true}
          className="flex items-center gap-3 text-white group cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        >
          <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center text-black shadow-lg shadow-[#1DB954]/25 group-hover:scale-105 active:scale-95 transition-all">
            <Music className="w-5 h-5 fill-current stroke-[2.5]" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white group-hover:text-[#1DB954] transition-colors">
            MusicFY
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {MAIN_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => {
                  try {
                    router.prefetch(item.href);
                  } catch {}
                }}
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    try {
                      router.prefetch(item.href);
                    } catch {}
                  }
                }}
                className={cn(
                  'flex items-center gap-4 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer select-none',
                  isActive
                    ? 'text-white bg-white/10 shadow-sm border border-white/10'
                    : 'text-[#b3b3b3] hover:text-white hover:bg-white/[0.06]'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <item.icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    isActive ? 'text-[#1DB954] fill-current' : 'text-[#b3b3b3]'
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex-1 flex flex-col min-h-0 border border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider">Koleksi Anda</span>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1 musicfy-scrollbar">
          {LIBRARY_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => {
                  try {
                    router.prefetch(item.href);
                  } catch {}
                }}
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    try {
                      router.prefetch(item.href);
                    } catch {}
                  }
                }}
                className={cn(
                  'flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer select-none',
                  isActive
                    ? 'text-white bg-white/10 shadow-sm border border-white/10'
                    : 'text-[#b3b3b3] hover:text-white hover:bg-white/[0.06]'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <item.icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    isActive ? 'text-[#1DB954]' : 'text-[#b3b3b3]'
                  )}
                />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pt-3 border-t border-white/[0.06] px-2 text-[11px] text-[#b3b3b3]/60 flex items-center justify-between">
          <span>MusicFY Web Player</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#1DB954]">
            <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
            <span>Aktif</span>
          </span>
        </div>
      </div>
    </aside>
  );
});
