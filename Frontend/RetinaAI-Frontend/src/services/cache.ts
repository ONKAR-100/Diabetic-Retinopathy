/**
 * Tiny in-memory stale-while-revalidate cache for API responses.
 *
 * Usage:
 *   const data = await cache.get('analytics', () => apiClient.get('/analytics/summary'));
 *
 * If a cached value exists and is not expired, it is returned instantly.
 * A background refresh is then triggered so the next call gets fresher data.
 */

type CacheEntry<T> = {
  data: T;
  ts: number;       // time.now() when cached
  ttl: number;      // milliseconds
};

const _store = new Map<string, CacheEntry<any>>();

export const cache = {
  /**
   * Return cached value immediately if available (even if stale).
   * Always triggers a background refresh when data is older than ttl.
   * If no cache exists at all, awaits the fetcher and stores the result.
   */
  async get<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    const entry = _store.get(key);
    const now = Date.now();

    if (entry) {
      if (now - entry.ts < entry.ttl) {
        // Fresh — return immediately, no background fetch needed
        return entry.data as T;
      }
      // Stale — return old data instantly, refresh in background
      this._refresh(key, fetcher, ttl);
      return entry.data as T;
    }

    // No cache at all — must await
    const data = await fetcher();
    _store.set(key, { data, ts: now, ttl });
    return data;
  },

  /** Fire-and-forget background refresh. */
  _refresh<T>(key: string, fetcher: () => Promise<T>, ttl: number): void {
    fetcher()
      .then(data => _store.set(key, { data, ts: Date.now(), ttl }))
      .catch(() => { /* silent — stale data is fine */ });
  },

  /** Manually invalidate a cached key (e.g. after a write operation). */
  invalidate(key: string): void {
    _store.delete(key);
  },

  /** Invalidate all keys with a given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const k of _store.keys()) {
      if (k.startsWith(prefix)) _store.delete(k);
    }
  },

  /** Clear everything. */
  clear(): void {
    _store.clear();
  },
};

export const TTL = {
  ANALYTICS:  30_000,   // 30 seconds — summary stats
  SCREENINGS: 10_000,   // 10 seconds — list view
  PATIENTS:   10_000,   // 10 seconds — patient list
  REVIEW_QUEUE: 5_000,  // 5 seconds  — review queue
  SCREENING_DETAIL: 30_000, // 30 seconds — individual screening detail
} as const;

