// Deliberately in-process: correct for one API instance and isolated behind
// this interface so a shared Redis implementation can replace it when scaled.

export interface CacheResult<T> {
  value: T;
  stale: boolean;
  asOf: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  inFlight: number;
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export interface CacheStore {
  getOrFetch<T>(key: string, fetchValue: () => Promise<T>, ttlMs: number): Promise<CacheResult<T>>;
  stats(): CacheStats;
}

export class InMemoryCache implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<CacheResult<unknown>>>();
  private hitCount = 0;
  private missCount = 0;

  public constructor(private readonly capacity = 500) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError("Cache capacity must be a positive integer");
    }
  }

  public async getOrFetch<T>(
    key: string,
    fetchValue: () => Promise<T>,
    ttlMs: number,
  ): Promise<CacheResult<T>> {
    if (!key) throw new TypeError("Cache key is required");
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new TypeError("Cache TTL must be a non-negative number");
    }

    const now = Date.now();
    const existing = this.entries.get(key) as CacheEntry<T> | undefined;
    if (existing && now - existing.storedAt < ttlMs) {
      this.hitCount += 1;
      return this.toResult(existing, false);
    }

    const inFlight = this.pending.get(key) as Promise<CacheResult<T>> | undefined;
    if (inFlight) return inFlight;

    this.missCount += 1;
    const operation = (async (): Promise<CacheResult<T>> => {
      try {
        const value = await fetchValue();
        const entry: CacheEntry<T> = { value, storedAt: Date.now() };
        this.entries.set(key, entry);
        this.evictOldestIfNeeded();
        return this.toResult(entry, false);
      } catch (error) {
        if (existing) return this.toResult(existing, true);
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, operation as Promise<CacheResult<unknown>>);
    return operation;
  }

  public stats(): CacheStats {
    const requests = this.hitCount + this.missCount;
    return {
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: requests === 0 ? 0 : this.hitCount / requests,
      size: this.entries.size,
      inFlight: this.pending.size,
    };
  }

  private toResult<T>(entry: CacheEntry<T>, stale: boolean): CacheResult<T> {
    return {
      value: entry.value,
      stale,
      asOf: new Date(entry.storedAt).toISOString(),
    };
  }

  private evictOldestIfNeeded(): void {
    if (this.entries.size <= this.capacity) return;

    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.storedAt < oldestTimestamp) {
        oldestTimestamp = entry.storedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.entries.delete(oldestKey);
  }
}
