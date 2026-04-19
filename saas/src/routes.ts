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

export function buildBadgeSvg(score: number, grade: string): string {
  const colors: Record<string, string> = { A: '22c55e', B: '84cc16', C: 'f59e0b', D: 'f97316', F: 'ef4444' };
  const color = colors[grade] ?? '64748b';
  const label = 'grasp';
  const value = `${score} ${grade}`;
  const lw = 50, vw = 58, h = 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw+vw}" height="${h}">
    <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
    <rect rx="3" width="${lw+vw}" height="${h}" fill="#555"/>
    <rect rx="3" x="${lw}" width="${vw}" height="${h}" fill="#${color}"/>
    <rect width="${lw+vw}" height="${h}" rx="3" fill="url(#s)"/>
    <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
      <text x="${lw/2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
      <text x="${lw/2}" y="14">${label}</text>
      <text x="${lw+vw/2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
      <text x="${lw+vw/2}" y="14">${value}</text>
    </g>
  </svg>`;
}

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

  // ── GET /badge/:owner/:repo.svg ─────────────────────────────────────────

  router.get('/badge/:owner/:repo.svg', async (req: Request, res: Response) => {
    const { owner } = req.params;
    const repo = req.params.repo.replace(/\.svg$/, '');
    const cacheKey = buildCacheKey(`${owner}/${repo}`);
    const raw = await cache.get(cacheKey);
    res.setHeader('Content-Type', 'image/svg+xml');
    if (!raw) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buildBadgeSvg(0, '?'));
    }
    const cached = JSON.parse(raw) as { summary?: { score: number; grade: string } };
    if (!cached?.summary) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buildBadgeSvg(0, '?'));
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buildBadgeSvg(cached.summary.score, cached.summary.grade));
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
