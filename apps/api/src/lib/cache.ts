/**
 * Small in-process LRU with TTL for third-party API responses. Swap for Redis
 * when running multiple API instances.
 */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();

  constructor(private maxEntries = 1000) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    if (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  /** Caches the resolved value and de-duplicates concurrent requests for the same key. */
  private inflight = new Map<string, Promise<V>>();
  async wrap(key: string, ttlMs: number, load: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = load()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
