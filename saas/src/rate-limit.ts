/**
 * Simple sliding-window rate limiter.
 * Uses an in-memory store keyed by IP (suitable for single-process).
 * For multi-process production, back with Redis using INCR + EXPIRE.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number = 30,
    private readonly windowMs: number = 60_000,
  ) {
    // Prune expired windows every 5 minutes
    setInterval(() => this.prune(), 5 * 60_000).unref();
  }

  check(key: string, limitOverride?: number): RateLimitResult {
    const limit = limitOverride ?? this.limit;
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || now > existing.resetAt) {
      const resetAt = now + this.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt, limit };
    }

    existing.count++;
    const allowed = existing.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - existing.count),
      resetAt: existing.resetAt,
      limit,
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, win] of this.windows.entries()) {
      if (now > win.resetAt) this.windows.delete(key);
    }
  }

  windowCount(): number {
    return this.windows.size;
  }
}
