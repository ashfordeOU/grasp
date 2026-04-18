import { MemoryCache, buildCacheKey, DEFAULT_TTL_SECONDS } from '../src/cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(5);
  });

  it('stores and retrieves a value', async () => {
    await cache.set('key1', 'value1');
    expect(await cache.get('key1')).toBe('value1');
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('returns null for expired key', async () => {
    await cache.set('key1', 'v1', 0); // 0 second TTL — expires immediately
    // need to wait slightly for expiry
    await new Promise(r => setTimeout(r, 10));
    expect(await cache.get('key1')).toBeNull();
  });

  it('has() returns true for existing non-expired key', async () => {
    await cache.set('k', 'v');
    expect(await cache.has('k')).toBe(true);
  });

  it('has() returns false for missing key', async () => {
    expect(await cache.has('nope')).toBe(false);
  });

  it('del() removes a key', async () => {
    await cache.set('k', 'v');
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('evicts oldest entry when maxSize exceeded', async () => {
    // maxSize=5, fill to capacity
    for (let i = 0; i < 5; i++) {
      await cache.set(`key${i}`, `val${i}`);
    }
    expect(cache.size()).toBe(5);
    // Adding one more should evict oldest
    await cache.set('key5', 'val5');
    expect(cache.size()).toBe(5);
    // key0 should be evicted
    expect(await cache.get('key0')).toBeNull();
    expect(await cache.get('key5')).toBe('val5');
  });

  it('LRU: recently accessed entry survives eviction', async () => {
    for (let i = 0; i < 5; i++) {
      await cache.set(`key${i}`, `val${i}`);
    }
    // Access key0 to make it recently used
    await cache.get('key0');
    // Now evict by adding a new entry
    await cache.set('key5', 'val5');
    // key0 should survive (was recently accessed), key1 should be evicted
    expect(await cache.get('key0')).toBe('val0');
    expect(await cache.get('key1')).toBeNull();
  });
});

describe('buildCacheKey', () => {
  it('returns base key without params', () => {
    const key = buildCacheKey('owner/repo');
    expect(key).toBe('grasp:analysis:owner/repo');
  });

  it('appends sorted params', () => {
    const key = buildCacheKey('owner/repo', { branch: 'main', token: 'abc' });
    expect(key).toContain('branch=main');
    expect(key).toContain('token=abc');
    // Params must be sorted
    expect(key.indexOf('branch')).toBeLessThan(key.indexOf('token'));
  });

  it('sanitizes special characters in source', () => {
    const key = buildCacheKey('owner/repo?foo=bar!');
    expect(key).not.toContain('?');
    expect(key).not.toContain('!');
  });
});
