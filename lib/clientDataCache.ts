/**
 * High-Performance Client Data Cache & Prefetching Engine for MusicFY
 * Provides instantaneous 0ms client-side navigation between Album, Artist, Playlist,
 * Search, and Home pages by caching responses and prefetching both routes and API data on hover/interaction.
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const SESSION_CACHE_PREFIX = 'mfy_dc_';

class ClientDataCache {
  private memoryCache = new Map<string, CacheItem<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private readonly maxEntries = 400;

  // TTL Defaults
  public readonly TTL_METADATA = 1000 * 60 * 60 * 2; // 2 hours for Albums, Artists, Playlists
  public readonly TTL_SEARCH = 1000 * 60 * 15;        // 15 minutes for Search results
  public readonly TTL_SUGGEST = 1000 * 60 * 30;       // 30 minutes for Suggestions
  public readonly TTL_HOME = 1000 * 60 * 30;          // 30 minutes for Home pools

  private getKey(prefix: string, id: string): string {
    return `${prefix}:${id.trim().toLowerCase()}`;
  }

  public get<T = any>(prefix: string, id: string): T | null {
    if (!id || typeof window === 'undefined') return null;
    const key = this.getKey(prefix, id);
    let item = this.memoryCache.get(key);

    // If not in memory, check persistent sessionStorage (Instant 0ms Refresh)
    if (!item) {
      try {
        const raw = window.sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheItem<T>;
          if (parsed && typeof parsed.timestamp === 'number') {
            if (Date.now() - parsed.timestamp <= parsed.ttlMs) {
              item = parsed;
              this.memoryCache.set(key, parsed);
            } else {
              window.sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
            }
          }
        }
      } catch {}
    }

    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttlMs) {
      this.memoryCache.delete(key);
      try {
        window.sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      } catch {}
      return null;
    }

    // Refresh LRU order
    this.memoryCache.delete(key);
    this.memoryCache.set(key, item);
    return item.data as T;
  }

  public set<T = any>(prefix: string, id: string, data: T, ttlMs = this.TTL_METADATA): void {
    if (!id || data === undefined || data === null || typeof window === 'undefined') return;
    const key = this.getKey(prefix, id);

    if (this.memoryCache.size >= this.maxEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    };

    this.memoryCache.set(key, item);

    // Persist to sessionStorage for instant refresh across reloads
    try {
      window.sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(item));
    } catch {
      // If quota exceeded, safely evict oldest cache entries
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
            keysToRemove.push(k);
            if (keysToRemove.length >= 5) break;
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
        window.sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(item));
      } catch {}
    }
  }

  public async fetchWithCache<T = any>(
    prefix: string,
    id: string,
    url: string,
    ttlMs = this.TTL_METADATA
  ): Promise<T | null> {
    const cached = this.get<T>(prefix, id);
    if (cached) return cached;

    const key = this.getKey(prefix, id);
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const requestPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const raw = await res.json();
        const data = raw?.result !== undefined ? raw.result : raw;
        if (data) {
          this.set(prefix, id, data, ttlMs);
        }
        return data as T;
      } catch (err) {
        return null;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, requestPromise);
    return requestPromise;
  }

  public clear(): void {
    this.memoryCache.clear();
    this.inFlightRequests.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {}
    }
  }
}

export const clientCache = new ClientDataCache();

// -------------------------------------------------------------
// Home Cache (Raw Pools & Categories)
// -------------------------------------------------------------
export function getHomeCache() {
  return clientCache.get('home', 'pools');
}

export function setHomeCache(data: any) {
  clientCache.set('home', 'pools', data, clientCache.TTL_HOME);
}

// -------------------------------------------------------------
// Albums Cache & Prefetch
// -------------------------------------------------------------
export function getCachedAlbum(id: string) {
  return clientCache.get('album', id);
}

export function setCachedAlbum(id: string, data: any) {
  clientCache.set('album', id, data);
}

export async function prefetchAlbum(id: string): Promise<any> {
  if (!id) return null;
  return clientCache.fetchWithCache('album', id, `/api/album?id=${encodeURIComponent(id)}`);
}

// -------------------------------------------------------------
// Artists Cache & Prefetch
// -------------------------------------------------------------
export function getCachedArtist(id: string) {
  return clientCache.get('artist', id);
}

export function setCachedArtist(id: string, data: any) {
  clientCache.set('artist', id, data);
}

export async function prefetchArtist(id: string): Promise<any> {
  if (!id) return null;
  return clientCache.fetchWithCache('artist', id, `/api/artist?id=${encodeURIComponent(id)}`);
}

// -------------------------------------------------------------
// Playlists Cache & Prefetch
// -------------------------------------------------------------
export function getCachedPlaylist(id: string) {
  return clientCache.get('playlist', id);
}

export function setCachedPlaylist(id: string, data: any) {
  clientCache.set('playlist', id, data);
}

export async function prefetchPlaylist(id: string): Promise<any> {
  if (!id) return null;
  return clientCache.fetchWithCache('playlist', id, `/api/ytplaylist?id=${encodeURIComponent(id)}`);
}

// -------------------------------------------------------------
// Search Results & Autocomplete Suggestions Cache
// -------------------------------------------------------------
export function getCachedSearch(query: string, type = 'all') {
  return clientCache.get('search', `${type}:${query}`);
}

export function setCachedSearch(query: string, type: string, data: any) {
  clientCache.set('search', `${type}:${query}`, data, clientCache.TTL_SEARCH);
}

export async function prefetchSearch(query: string, type?: string): Promise<any> {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();
  const url = type && type !== 'all'
    ? `/api/search?q=${encodeURIComponent(cleanQ)}&type=${type}`
    : `/api/search?q=${encodeURIComponent(cleanQ)}`;
  return clientCache.fetchWithCache('search', `${type || 'all'}:${cleanQ}`, url, clientCache.TTL_SEARCH);
}

export function getCachedSuggestions(query: string): string[] | null {
  return clientCache.get<string[]>('suggest', query);
}

export function setCachedSuggestions(query: string, suggestions: string[]) {
  clientCache.set('suggest', query, suggestions, clientCache.TTL_SUGGEST);
}

export async function prefetchSuggestions(query: string): Promise<string[]> {
  if (!query || !query.trim()) return [];
  const cleanQ = query.trim();
  const res = await clientCache.fetchWithCache<string[]>(
    'suggest',
    cleanQ,
    `/api/suggest?q=${encodeURIComponent(cleanQ)}`,
    clientCache.TTL_SUGGEST
  );
  return res || [];
}

// -------------------------------------------------------------
// Universal Instant Navigation Prefetcher (Route + Data)
// -------------------------------------------------------------
export function prefetchNavigation(
  router: { prefetch?: (url: string) => void },
  href: string,
  type?: 'album' | 'artist' | 'playlist',
  id?: string
) {
  try {
    if (router && typeof router.prefetch === 'function') {
      router.prefetch(href);
    }
    if (type === 'album' && id) {
      prefetchAlbum(id);
    } else if (type === 'artist' && id) {
      prefetchArtist(id);
    } else if (type === 'playlist' && id) {
      prefetchPlaylist(id);
    }
  } catch {}
}
