/**
 * Grasp SaaS API routes.
 *
 * POST /api/analyze   — submit a GitHub repo for analysis
 * GET  /api/result/:id — poll for a queued/completed analysis
 * GET  /api/health    — health check
 * GET  /api/stats     — cache/queue stats (internal)
 */

import type { Request, Response, Router as ExpressRouter } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Cache } from './cache.js';
import { buildCacheKey } from './cache.js';
import type { RateLimiter } from './rate-limit.js';

export interface AnalyzeRequest {
  repo: string;           // "owner/repo" or full GitHub URL
  token?: string;         // optional GitHub PAT for private repos
  branch?: string;
}

export interface JobStatus {
  id: string;
  repo: string;
  state: 'queued' | 'running' | 'done' | 'error';
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;       // AnalysisResult on success
  cached: boolean;
}

export type AnalyzeHandler = (repo: string, token?: string, branch?: string) => Promise<unknown>;

const REPO_RE = /^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;

function normalizeRepo(input: string): string | null {
  // Accept "owner/repo" or "https://github.com/owner/repo"
  const ghUrl = input.match(/github\.com\/([a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+)/);
  if (ghUrl) return ghUrl[1];
  if (REPO_RE.test(input)) return input;
  return null;
}

export function buildRouter(
  router: ExpressRouter,
  cache: Cache,
  rateLimiter: RateLimiter,
  analyzeHandler: AnalyzeHandler,
): ExpressRouter {
  // In-memory job queue (production: replace with Redis or BullMQ)
  const jobs = new Map<string, JobStatus>();

  function getClientKey(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
      req.socket.remoteAddress ??
      'unknown'
    );
  }

  // ── POST /api/analyze ────────────────────────────────────────────────────

  router.post('/api/analyze', async (req: Request, res: Response) => {
    const clientKey = getClientKey(req);
    const rateResult = rateLimiter.check(clientKey);

    res.setHeader('X-RateLimit-Limit', rateResult.limit);
    res.setHeader('X-RateLimit-Remaining', rateResult.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(rateResult.resetAt / 1000));

    if (!rateResult.allowed) {
      res.status(429).json({ error: 'Rate limit exceeded', resetAt: rateResult.resetAt });
      return;
    }

    const body = req.body as Partial<AnalyzeRequest>;
    if (!body.repo || typeof body.repo !== 'string') {
      res.status(400).json({ error: 'Missing required field: repo' });
      return;
    }

    const repo = normalizeRepo(body.repo.trim());
    if (!repo) {
      res.status(400).json({ error: 'Invalid repo format. Use "owner/repo" or a GitHub URL.' });
      return;
    }

    const branch = typeof body.branch === 'string' ? body.branch : 'HEAD';
    const cacheKey = buildCacheKey(repo, { branch });

    // Return cached result immediately
    const cached = await cache.get(cacheKey);
    if (cached) {
      const jobId = uuidv4();
      const job: JobStatus = {
        id: jobId,
        repo,
        state: 'done',
        queuedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: JSON.parse(cached),
        cached: true,
      };
      jobs.set(jobId, job);
      res.status(200).json(job);
      return;
    }

    // Queue new job
    const jobId = uuidv4();
    const job: JobStatus = {
      id: jobId,
      repo,
      state: 'queued',
      queuedAt: new Date().toISOString(),
      cached: false,
    };
    jobs.set(jobId, job);

    // Run analysis asynchronously
    (async () => {
      job.state = 'running';
      job.startedAt = new Date().toISOString();
      try {
        const result = await analyzeHandler(repo, body.token, branch);
        job.state = 'done';
        job.completedAt = new Date().toISOString();
        job.result = result;
        await cache.set(cacheKey, JSON.stringify(result));
      } catch (err) {
        job.state = 'error';
        job.completedAt = new Date().toISOString();
        job.error = (err as Error).message ?? 'Analysis failed';
      }
    })();

    res.status(202).json({ id: jobId, state: 'queued', repo });
  });

  // ── GET /api/result/:id ──────────────────────────────────────────────────

  router.get('/api/result/:id', (req: Request, res: Response) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.status(job.state === 'done' ? 200 : 202).json(job);
  });

  // ── GET /api/health ──────────────────────────────────────────────────────

  router.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // ── GET /api/stats ───────────────────────────────────────────────────────

  router.get('/api/stats', (_req: Request, res: Response) => {
    const counts = { queued: 0, running: 0, done: 0, error: 0 };
    for (const job of jobs.values()) counts[job.state]++;
    res.json({
      jobs: { total: jobs.size, ...counts },
      rateWindows: rateLimiter.windowCount(),
    });
  });

  return router;
}
