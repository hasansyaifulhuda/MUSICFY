import fs from 'fs';
import path from 'path';

export interface VisitorSession {
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
}

export interface VisitorAnalyticsSummary {
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
}

const STORAGE_FILE = path.join(process.cwd(), 'storage', 'admin', 'visitor_analytics.json');

// In-memory active visitor store
const visitorSessions = new Map<string, VisitorSession>();

// Daily / weekly / monthly unique visitor IDs
let allTimeUniqueVisitors = new Set<string>();
let todayDateStr = new Date().toISOString().slice(0, 10);
let todayVisitors = new Set<string>();
let weekVisitors = new Set<string>();
let monthVisitors = new Set<string>();

let totalPageViews = 0;
const pageViewsByRoute = new Map<string, number>();
const hourlyStats = new Map<string, { pageViews: number; visitors: Set<string> }>();

// Load from disk on initialization
let isInitialized = false;

function ensureStorageDir(): void {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFromDisk(): void {
  if (isInitialized) return;
  isInitialized = true;
  ensureStorageDir();

  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.allTimeVisitors)) {
        allTimeUniqueVisitors = new Set(data.allTimeVisitors);
      }
      if (typeof data.totalPageViews === 'number') {
        totalPageViews = data.totalPageViews;
      }
      if (data.pageViewsByRoute && typeof data.pageViewsByRoute === 'object') {
        for (const [k, v] of Object.entries(data.pageViewsByRoute)) {
          pageViewsByRoute.set(k, Number(v) || 0);
        }
      }
      if (Array.isArray(data.recentSessions)) {
        for (const s of data.recentSessions) {
          if (s && s.visitorId) {
            visitorSessions.set(s.visitorId, {
              ...s,
              isOnline: false, // marked offline until next heartbeat
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[VisitorTracker] Error loading analytics from disk:', err);
  }
}

let saveTimeout: NodeJS.Timeout | null = null;

function saveToDiskDebounced(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    ensureStorageDir();
    try {
      // Keep up to 200 recent sessions
      const sessionsArray = Array.from(visitorSessions.values())
        .sort((a, b) => b.lastActive - a.lastActive)
        .slice(0, 200);

      const routesObj: Record<string, number> = {};
      for (const [k, v] of pageViewsByRoute.entries()) {
        routesObj[k] = v;
      }

      const payload = {
        totalPageViews,
        allTimeVisitors: Array.from(allTimeUniqueVisitors).slice(-5000),
        pageViewsByRoute: routesObj,
        recentSessions: sessionsArray,
        lastSaved: Date.now(),
      };

      fs.writeFileSync(STORAGE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[VisitorTracker] Error saving analytics to disk:', err);
    }
  }, 2000);
}

/**
 * Parses user agent string accurately to classify device, OS, and browser.
 */
export function parseUserAgent(uaString: string): {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet';
  deviceLabel: string;
  os: string;
  browser: string;
  browserVersion: string;
} {
  const ua = uaString || '';

  // 1. Device Type
  let deviceType: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = 'Mobile';
  }

  // 2. OS
  let os = 'Unknown OS';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s+([0-9\.]+)/i);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    const match = ua.match(/OS\s+([0-9_]+)/i);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
  } else if (/Mac OS X/i.test(ua)) {
    const match = ua.match(/Mac OS X\s+([0-9_]+)/i);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Browser
  let browser = 'Browser';
  let browserVersion = '';

  if (/Brave/i.test(ua)) {
    browser = 'Brave';
  } else if (/Edg/i.test(ua)) {
    browser = 'Edge';
    const m = ua.match(/Edg\/([0-9]+)/i);
    if (m) browserVersion = m[1];
  } else if (/OPR|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
    const m = ua.match(/SamsungBrowser\/([0-9]+)/i);
    if (m) browserVersion = m[1];
  } else if (/Chrome/i.test(ua)) {
    browser = 'Chrome';
    const m = ua.match(/Chrome\/([0-9]+)/i);
    if (m) browserVersion = m[1];
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
    const m = ua.match(/Version\/([0-9]+)/i);
    if (m) browserVersion = m[1];
  } else if (/Firefox/i.test(ua)) {
    browser = 'Firefox';
    const m = ua.match(/Firefox\/([0-9]+)/i);
    if (m) browserVersion = m[1];
  }

  const deviceLabel = `${os} ${deviceType} (${browser})`;

  return {
    deviceType,
    deviceLabel,
    os,
    browser,
    browserVersion,
  };
}

/**
 * Records an active visitor heartbeat ping.
 */
export function recordVisitorHeartbeat(params: {
  visitorId: string;
  path: string;
  userAgent: string;
  ip: string;
  country?: string;
  city?: string;
  accountName?: string;
  isNewPageView?: boolean;
}): VisitorSession {
  loadFromDisk();

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // Check day roll-over
  if (today !== todayDateStr) {
    todayDateStr = today;
    todayVisitors.clear();
  }

  const { visitorId, path, userAgent, ip, country = 'Local', city, accountName, isNewPageView = false } = params;

  allTimeUniqueVisitors.add(visitorId);
  todayVisitors.add(visitorId);
  weekVisitors.add(visitorId);
  monthVisitors.add(visitorId);

  if (isNewPageView) {
    totalPageViews += 1;
    const cleanRoute = path ? (path.startsWith('/') ? path : `/${path}`) : '/';
    pageViewsByRoute.set(cleanRoute, (pageViewsByRoute.get(cleanRoute) || 0) + 1);

    // Hourly trend
    const currentHourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-11-08T18"
    let hourEntry = hourlyStats.get(currentHourKey);
    if (!hourEntry) {
      hourEntry = { pageViews: 0, visitors: new Set<string>() };
      hourlyStats.set(currentHourKey, hourEntry);
    }
    hourEntry.pageViews += 1;
    hourEntry.visitors.add(visitorId);
  }

  let session = visitorSessions.get(visitorId);
  const parsedUa = parseUserAgent(userAgent);

  if (!session) {
    session = {
      visitorId,
      accountName,
      deviceLabel: parsedUa.deviceLabel,
      deviceType: parsedUa.deviceType,
      os: parsedUa.os,
      browser: parsedUa.browser,
      browserVersion: parsedUa.browserVersion,
      ip: ip || '127.0.0.1',
      country: country || 'Local',
      city,
      currentPage: path || '/',
      firstVisit: now,
      lastActive: now,
      sessionDurationSeconds: 0,
      isOnline: true,
    };
  } else {
    session.lastActive = now;
    session.currentPage = path || session.currentPage;
    session.sessionDurationSeconds = Math.max(0, Math.floor((now - session.firstVisit) / 1000));
    session.isOnline = true;
    if (accountName) session.accountName = accountName;
    if (country && country !== 'Local') session.country = country;
    if (city) session.city = city;
  }

  visitorSessions.set(visitorId, session);
  saveToDiskDebounced();

  return session;
}

/**
 * Returns current visitor analytics summary and list of live visitors.
 */
export function getVisitorAnalytics(): {
  summary: VisitorAnalyticsSummary;
  liveVisitors: VisitorSession[];
} {
  loadFromDisk();

  const now = Date.now();
  const OFFLINE_THRESHOLD_MS = 45 * 1000; // 45 seconds without heartbeat = offline

  const sessionsList: VisitorSession[] = [];
  let activeNow = 0;
  const deviceCounts = { Desktop: 0, Mobile: 0, Tablet: 0 };
  const browserCounts: Record<string, number> = {};

  for (const session of visitorSessions.values()) {
    const isOnline = now - session.lastActive <= OFFLINE_THRESHOLD_MS;
    session.isOnline = isOnline;
    if (isOnline) {
      activeNow += 1;
    }

    deviceCounts[session.deviceType] = (deviceCounts[session.deviceType] || 0) + 1;
    browserCounts[session.browser] = (browserCounts[session.browser] || 0) + 1;

    sessionsList.push(session);
  }

  // Sort by active status, then latest activity
  sessionsList.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return b.lastActive - a.lastActive;
  });

  // Popular routes
  const popularPages = Array.from(pageViewsByRoute.entries())
    .map(([page, views]) => ({ page, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Hourly trend for the last 12 hours
  const hourlyTrend: Array<{ hour: string; pageViews: number; visitors: number }> = [];
  const curDate = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(curDate.getTime() - i * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 13);
    const label = `${d.getHours().toString().padStart(2, '0')}:00`;
    const data = hourlyStats.get(key);
    hourlyTrend.push({
      hour: label,
      pageViews: data ? data.pageViews : (i === 0 ? Math.max(1, totalPageViews) : 0),
      visitors: data ? data.visitors.size : (i === 0 ? Math.max(1, activeNow) : 0),
    });
  }

  const summary: VisitorAnalyticsSummary = {
    totalVisitors: Math.max(allTimeUniqueVisitors.size, visitorSessions.size, 1),
    uniqueVisitors: Math.max(allTimeUniqueVisitors.size, 1),
    totalPageViews: Math.max(totalPageViews, 1),
    visitorsToday: Math.max(todayVisitors.size, activeNow, 1),
    visitorsThisWeek: Math.max(weekVisitors.size, todayVisitors.size, 1),
    visitorsThisMonth: Math.max(monthVisitors.size, todayVisitors.size, 1),
    activeVisitorsNow: Math.max(activeNow, 1),
    newVisitorsToday: Math.max(todayVisitors.size, 1),
    returningVisitorsToday: Math.max(0, allTimeUniqueVisitors.size - todayVisitors.size),
    popularPages: popularPages.length > 0 ? popularPages : [{ page: '/', views: Math.max(1, totalPageViews) }],
    trafficByDevice: deviceCounts,
    trafficByBrowser: browserCounts,
    hourlyTrend,
  };

  return {
    summary,
    liveVisitors: sessionsList.slice(0, 100),
  };
}
