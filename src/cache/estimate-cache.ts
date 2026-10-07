import fs from 'fs';
import path from 'path';

/**
 * Remember a search so we do not buy it twice.
 *
 * Every estimate costs real money: a search is several Otomoto pages at ~209 KB each,
 * pulled through a metered residential proxy. Twenty Golfs of the same year and mileage
 * band ask the same question twenty times, and valuing the bid history asked it hundreds of
 * times in an afternoon — which is how a plan with gigabytes on it ran dry.
 *
 * A median of the Polish market does not move in a day, so the answer keeps for a day. It
 * is written to disk because a bulk run is several processes over several hours, and an
 * in-memory cache forgets everything the moment one of them ends.
 */

export interface CacheEntry<T> {
  data: T;
  storedAt: number;
}

const DAY = 24 * 60 * 60 * 1000;

export class EstimateCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private dirty = false;

  constructor(
    private readonly file: string,
    private readonly ttlMs: number = DAY,
    /** Bounded so a long-running service cannot grow without limit. */
    private readonly maxEntries: number = 5000,
    private readonly now: () => number = Date.now
  ) {
    this.load();
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() - entry.storedAt > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.entries.set(key, { data, storedAt: this.now() });
    this.dirty = true;
    if (this.entries.size > this.maxEntries) {
      // Oldest first: Map keeps insertion order, and a re-set moves a key to the end.
      const excess = this.entries.size - this.maxEntries;
      for (const key of Array.from(this.entries.keys()).slice(0, excess)) {
        this.entries.delete(key);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Written on a timer rather than on every set: a bulk run would otherwise rewrite the
   *  whole file hundreds of times. */
  save(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fresh = Array.from(this.entries.entries()).filter(
        ([, e]) => this.now() - e.storedAt <= this.ttlMs
      );
      fs.writeFileSync(this.file, JSON.stringify(fresh));
      this.dirty = false;
    } catch {
      // A cache that cannot be written is still a working cache in memory.
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as [string, CacheEntry<T>][];
      for (const [key, entry] of raw) {
        if (this.now() - entry.storedAt <= this.ttlMs) this.entries.set(key, entry);
      }
    } catch {
      // A corrupt file is not worth a crash; start empty and overwrite it on the next save.
    }
  }
}
