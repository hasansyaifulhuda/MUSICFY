import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';
import { ClientPlayer } from '@/components/ClientPlayer';
import { BackgroundProvider } from '@/components/BackgroundProvider';
import { MusicProvider } from '@/context/MusicContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteContainer } from '@/components/RouteContainer';
import { ClientModals } from '@/components/ClientModals';
import { PlatformBootstrapper } from '@/components/PlatformBootstrapper';
import { UmamiAnalytics } from '@/components/UmamiAnalytics';
import { VisitorHeartbeat } from '@/components/VisitorHeartbeat';
import { getAppUrl } from '@/lib/config';

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'MusicFY - Pemutar Musik',
  description: 'MusicFY - Pemutar Musik: dengarkan jutaan lagu dan podcast gratis di platform streaming musik modern.',
  manifest: '/manifest.json',
  referrer: 'no-referrer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MusicFY',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        {/* Resource Hints & DNS Prefetching to eliminate DNS lookup latency */}
        <link rel="preconnect" href="https://shanz.my.id" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://shanz.my.id" />
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <meta name="referrer" content="no-referrer" />
        {/* Immediate Cross-Platform DPI & Viewport Normalization (Zero FOUC on Windows) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var ua = navigator.userAgent || '';
                  var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
                  var isWin = /windows|win32|win64/i.test(ua) || /win/i.test(p);
                  var isMob = /android|iphone|ipad|ipod|mobile/i.test(ua);
                  var root = document.documentElement;
                  if (isWin && !isMob) {
                    root.setAttribute('data-platform', 'windows');
                    root.setAttribute('data-is-windows-desktop', 'true');
                    var dpr = window.devicePixelRatio || 1;
                    var scale = dpr >= 1.5 ? 0.82 : (dpr >= 1.2 ? 0.875 : 0.91);
                    root.style.setProperty('--platform-scale', String(scale));
                    var targetPx = Math.round(16 * scale * 10) / 10;
                    root.style.fontSize = targetPx + 'px';
                  } else {
                    root.style.fontSize = '16px';
                  }
                  root.style.setProperty('-webkit-text-size-adjust', '100%');
                  root.style.setProperty('text-size-adjust', '100%');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="bg-black text-white antialiased min-h-screen selection:bg-[#1DB954] selection:text-black font-sans overflow-x-hidden"
        suppressHydrationWarning
      >
        <UmamiAnalytics />
        <VisitorHeartbeat />
        <MusicProvider>
          <PlatformBootstrapper />
          <BackgroundProvider />
          
          {/* Desktop Fixed Left Navigation */}
          <ErrorBoundary name="Sidebar" fallback={null}>
            <Sidebar />
          </ErrorBoundary>

          {/* Main Content Viewport */}
          <div className="md:pl-64 lg:pl-72 md:p-2 min-h-screen">
            <div className="min-h-[calc(100vh-16px)] bg-[#121212]/80 backdrop-blur-md md:rounded-2xl overflow-hidden pb-28 md:pb-32 border border-transparent md:border-white/[0.06] shadow-2xl relative gpu-accelerated contain-paint">
              <RouteContainer>
                {children}
              </RouteContainer>
            </div>
          </div>

          {/* Audio Engine & Interactive Player */}
          <ErrorBoundary name="PlayerView">
            <ClientPlayer />
          </ErrorBoundary>

          {/* Mobile Bottom Navigation Bar */}
          <ErrorBoundary name="BottomNav" fallback={null}>
            <BottomNav />
          </ErrorBoundary>

          {/* Lazily Loaded Client Modals, PWA & Toasts */}
          <ErrorBoundary name="ClientModals" fallback={null}>
            <ClientModals />
          </ErrorBoundary>
        </MusicProvider>
      </body>
    </html>
  );
}
