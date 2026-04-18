/**
 * Redis-backed cache for Grasp SaaS.
 * Falls back to an in-memory LRU when Redis is unavailable.
 */

import type Redis from 'ioredis';

export const DEFAULT_TTL_SECONDS = 60 * 60 * 4; // 4 hours

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * Simple in-memory LRU for fallback (no Redis).
 * Not suitable for multi-process deployments.
 */
export class MemoryCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    // Evict oldest when full
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Redis-backed cache.
 */
export class RedisCache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }
}

export type Cache = MemoryCache | RedisCache;

/**
 * Build a cache key from a source identifier and optional params.
 */
export function buildCacheKey(source: string, params?: Record<string, string>): string {
  const base = `grasp:analysis:${source.replace(/[^a-zA-Z0-9_\-./]/g, '_')}`;
  if (!params || Object.keys(params).length === 0) return base;
  const suffix = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${base}?${suffix}`;
}
