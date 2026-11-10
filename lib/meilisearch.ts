import { Meilisearch, Index } from 'meilisearch';

export const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700';
export const MEILISEARCH_API_KEY =
  process.env.MEILISEARCH_API_KEY || process.env.MEILISEARCH_MASTER_KEY || '';
export const TRACKS_INDEX_NAME = process.env.MEILISEARCH_INDEX_NAME || 'musicfy_tracks';

export interface MeiliTrackDocument {
  videoId: string;
  youtubeId?: string;
  title: string;
  name?: string;
  artist: {
    name: string;
    artistId?: string;
  };
  album?: {
    name: string;
    albumId?: string;
  };
  duration?: number;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  type: string;
  isExplicit?: boolean;
  indexedAt: number;
}

class MeilisearchService {
  private client: Meilisearch | null = null;
  private indexPromise: Promise<Index<MeiliTrackDocument> | null> | null = null;
  private isConfigured = false;
  private isConnected = false;
  private lastHealthCheck = 0;
  private readonly healthCheckTtlMs = 15000;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    try {
      this.client = new Meilisearch({
        host: MEILISEARCH_HOST,
        apiKey: MEILISEARCH_API_KEY,
        timeout: 3000,
      });
    } catch (err) {
      console.warn('[Meilisearch] Failed to instantiate Meilisearch client:', err);
      this.client = null;
    }
  }

  /**
   * Fast, non-blocking health check.
   */
  public async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.isConnected && now - this.lastHealthCheck < this.healthCheckTtlMs) {
      return true;
    }

    if (!this.client) return false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`${MEILISEARCH_HOST}/health`, {
        signal: controller.signal,
        headers: MEILISEARCH_API_KEY ? { Authorization: `Bearer ${MEILISEARCH_API_KEY}` } : {},
      });
      clearTimeout(timer);

      this.isConnected = res.ok;
      this.lastHealthCheck = now;
      return this.isConnected;
    } catch {
      this.isConnected = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * Gets or initializes the tracks search index with optimal typography and typo tolerance.
   */
  public async getTracksIndex(): Promise<Index<MeiliTrackDocument> | null> {
    if (this.indexPromise) return this.indexPromise;

    this.indexPromise = (async () => {
      const healthy = await this.isHealthy();
      if (!healthy || !this.client) return null;

      try {
        const index = this.client.index<MeiliTrackDocument>(TRACKS_INDEX_NAME);

        // Configure index settings if not yet initialized
        if (!this.isConfigured) {
          try {
            await this.client.createIndex(TRACKS_INDEX_NAME, { primaryKey: 'videoId' });
          } catch (createErr: any) {
            // Index already exists, ignore
          }

          await index.updateSettings({
            searchableAttributes: [
              'title',
              'name',
              'artist.name',
              'album.name',
            ],
            filterableAttributes: [
              'type',
              'videoId',
              'artist.artistId',
              'isExplicit',
            ],
            sortableAttributes: [
              'duration',
              'indexedAt',
            ],
            rankingRules: [
              'words',
              'typo',
              'proximity',
              'attribute',
              'sort',
              'exactness',
            ],
            typoTolerance: {
              enabled: true,
              minWordSizeForTypos: {
                oneTypo: 3,
                twoTypos: 7,
              },
              disableOnAttributes: [],
            },
            pagination: {
              maxTotalHits: 2000,
            },
          });

          this.isConfigured = true;
          console.info(`[Meilisearch] 🚀 Successfully configured "${TRACKS_INDEX_NAME}" with typo tolerance (<50ms fast lookup).`);
        }

        return index;
      } catch (err) {
        console.warn('[Meilisearch] Warning configuring index:', err);
        return null;
      }
    })();

    return this.indexPromise;
  }

  /**
   * Ultra-fast search query with typo tolerance (<50ms).
   */
  public async searchTracks(
    query: string,
    options?: {
      limit?: number;
      type?: string;
    }
  ): Promise<any[] | null> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) return [];

    try {
      const index = await this.getTracksIndex();
      if (!index) return null;

      const limit = options?.limit || 30;
      let filter: string | undefined;

      if (options?.type && options.type !== 'combined' && options.type !== 'all') {
        filter = `type = "${options.type.toUpperCase()}"`;
      }

      const searchRes = await index.search(cleanQuery, {
        limit,
        filter,
        showMatchesPosition: false,
      });

      if (searchRes.hits && searchRes.hits.length > 0) {
        return searchRes.hits.map((hit) => ({
          videoId: hit.videoId,
          youtubeId: hit.youtubeId || hit.videoId,
          name: hit.name || hit.title,
          title: hit.title || hit.name,
          artist: hit.artist,
          album: hit.album,
          duration: hit.duration,
          thumbnails: hit.thumbnails,
          type: hit.type || 'SONG',
          isExplicit: hit.isExplicit,
          source: 'meilisearch',
        }));
      }

      return [];
    } catch (err) {
      console.warn('[Meilisearch] Search error:', err);
      return null;
    }
  }

  /**
   * Asynchronously indexes an array of tracks in the background.
   */
  public async indexTracks(tracks: any[]): Promise<void> {
    if (!Array.isArray(tracks) || tracks.length === 0) return;

    try {
      const index = await this.getTracksIndex();
      if (!index) return;

      const documents: MeiliTrackDocument[] = [];
      const now = Date.now();

      for (const t of tracks) {
        const videoId = t.videoId || t.youtubeId || (t.id && String(t.id));
        const title = t.title || t.name;

        if (!videoId || !title) continue;

        let artistObj: { name: string; artistId?: string } = { name: 'Artis Tidak Diketahui' };
        if (typeof t.artist === 'string') {
          artistObj = { name: t.artist };
        } else if (t.artist && typeof t.artist === 'object') {
          artistObj = {
            name: t.artist.name || 'Artis Tidak Diketahui',
            artistId: t.artist.artistId,
          };
        }

        documents.push({
          videoId,
          youtubeId: videoId,
          title,
          name: title,
          artist: artistObj,
          album: t.album ? { name: t.album.name || String(t.album), albumId: t.album.albumId } : undefined,
          duration: typeof t.duration === 'number' ? t.duration : undefined,
          thumbnails: Array.isArray(t.thumbnails) ? t.thumbnails : undefined,
          type: t.type ? String(t.type).toUpperCase() : 'SONG',
          isExplicit: Boolean(t.isExplicit),
          indexedAt: now,
        });
      }

      if (documents.length > 0) {
        // Enqueue batch addition
        await index.addDocuments(documents, { primaryKey: 'videoId' });
      }
    } catch (err) {
      console.warn('[Meilisearch] Error indexing tracks:', err);
    }
  }

  /**
   * Inspects Meilisearch statistics for system diagnostics.
   */
  public async getStats(): Promise<{
    healthy: boolean;
    host: string;
    indexName: string;
    numberOfDocuments: number;
    isIndexing: boolean;
  }> {
    const healthy = await this.isHealthy();
    let numberOfDocuments = 0;
    let isIndexing = false;

    if (healthy && this.client) {
      try {
        const index = this.client.index(TRACKS_INDEX_NAME);
        const stats = await index.getStats();
        numberOfDocuments = stats.numberOfDocuments;
        isIndexing = stats.isIndexing;
      } catch {}
    }

    return {
      healthy,
      host: MEILISEARCH_HOST,
      indexName: TRACKS_INDEX_NAME,
      numberOfDocuments,
      isIndexing,
    };
  }
}

export const meilisearch = new MeilisearchService();
