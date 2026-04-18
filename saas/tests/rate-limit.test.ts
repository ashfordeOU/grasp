import { RateLimiter } from '../src/rate-limit.js';

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const rl = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(rl.check('ip1').allowed).toBe(true);
    }
  });

  it('blocks requests that exceed the limit', () => {
    const rl = new RateLimiter(3, 60_000);
    rl.check('ip1');
    rl.check('ip1');
    rl.check('ip1');
    expect(rl.check('ip1').allowed).toBe(false);
  });

  it('decrements remaining on each call', () => {
    const rl = new RateLimiter(10, 60_000);
    const r1 = rl.check('ip1');
    const r2 = rl.check('ip1');
    expect(r2.remaining).toBe(r1.remaining - 1);
  });

  it('remaining is 0 when limit exceeded', () => {
    const rl = new RateLimiter(2, 60_000);
    rl.check('x'); rl.check('x'); rl.check('x');
    expect(rl.check('x').remaining).toBe(0);
  });

  it('resets after window expires', async () => {
    const rl = new RateLimiter(2, 50); // 50ms window
    rl.check('ip2');
    rl.check('ip2');
    expect(rl.check('ip2').allowed).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(rl.check('ip2').allowed).toBe(true);
  });

  it('tracks separate windows per key', () => {
    const rl = new RateLimiter(2, 60_000);
    rl.check('ip1'); rl.check('ip1');
    expect(rl.check('ip1').allowed).toBe(false);
    expect(rl.check('ip2').allowed).toBe(true);
  });

  it('provides resetAt timestamp', () => {
    const rl = new RateLimiter(5, 60_000);
    const before = Date.now();
    const result = rl.check('ip1');
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000 + 50);
  });
});
