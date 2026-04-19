/**
 * Grasp SaaS Express server.
 *
 * Environment variables:
 *   PORT          — HTTP port (default: 3001)
 *   REDIS_URL     — Redis connection URL (optional; falls back to in-memory cache)
 *   RATE_LIMIT    — Requests per minute per IP (default: 30)
 *   GITHUB_TOKEN  — Default GitHub PAT for analysis (optional)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Router } from 'express';
import { MemoryCache, RedisCache } from './cache.js';
import { RateLimiter } from './rate-limit.js';
import { buildRouter } from './routes.js';
import { validateApiKey, getRateLimit, type ApiKeyRecord } from './auth.js';
import type { Cache } from './cache.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const REDIS_URL = process.env.REDIS_URL;
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT ?? '30', 10);

// In-memory API key store (production: replace with DB-backed store)
export const apiKeys = new Map<string, ApiKeyRecord>();

async function buildCache(): Promise<Cache> {
  if (REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
      // Quick connectivity check
      await redis.ping();
      console.log('[grasp-saas] Redis connected:', REDIS_URL.replace(/:\/\/.*@/, '://***@'));
      return new RedisCache(redis);
    } catch (err) {
      console.warn('[grasp-saas] Redis unavailable, falling back to in-memory cache:', (err as Error).message);
    }
  }
  console.log('[grasp-saas] Using in-memory cache');
  return new MemoryCache();
}

/**
 * Lightweight analysis handler that calls the grasp-mcp-server analyzer.
 * In production this would queue work to a separate worker process.
 */
async function analyzeRepo(repo: string, token?: string): Promise<unknown> {
  // Dynamically import the analyzer to avoid loading it at startup
  // (allows the server to start quickly even if the MCP package is not installed)
  try {
    const { analyzeSource } = await import('../../mcp/src/analyzer.js');
    const [owner, repoName] = repo.split('/');
    return await analyzeSource(
      {
        type: 'github',
        owner,
        repo: repoName,
        token: token ?? process.env.GITHUB_TOKEN,
      },
      {
        maxFiles: 500,
        includeFunctions: true,
        includeContent: false,
      }
    );
  } catch {
    // If analyzer isn't importable (standalone deploy), return a stub
    return {
      sessionId: `stub-${Date.now()}`,
      source: repo,
      analyzedAt: new Date().toISOString(),
      note: 'Analysis engine not available in this deployment',
    };
  }
}

export async function createApp(): Promise<express.Application> {
  const app = express();
  const cache = await buildCache();
  const rateLimiter = new RateLimiter(RATE_LIMIT);

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // API key middleware — reads Authorization: Bearer gsp_... header,
  // validates the key and attaches the resolved tier to req for downstream use.
  app.use((req, _res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const key = authHeader.slice(7).trim();
      const record = validateApiKey(key, apiKeys);
      if (record) {
        req.apiTier = record.tier;
        // Override per-request rate limit based on tier
        req.rateLimit = getRateLimit(record.tier);
      }
    }
    next();
  });

  const router = buildRouter(Router(), cache, rateLimiter, analyzeRepo);
  app.use(router);

  return app;
}

// Run if this is the entry point
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  createApp().then(app => {
    app.listen(PORT, () => {
      console.log(`[grasp-saas] Listening on port ${PORT}`);
    });
  }).catch(err => {
    console.error('[grasp-saas] Fatal:', err);
    process.exit(1);
  });
}
