/**
 * Grasp SaaS API routes.
 *
 * POST /api/analyze   — submit a GitHub or GitLab repo for analysis
 * GET  /api/result/:id — poll for a queued/completed analysis
 * GET  /api/health    — health check
 * GET  /api/stats     — cache/queue stats (internal)
 */

import type { Request, Response, Router as ExpressRouter } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Cache } from './cache.js';
import { buildCacheKey } from './cache.js';
import type { RateLimiter } from './rate-limit.js';
import { HistoryStore } from './history.js';
import { AuditLogger } from './audit.js';
import { SearchIndex } from './search.js';

const searchIndex = new SearchIndex();

export const historyStore = new HistoryStore();
export const auditLogger = new AuditLogger();

export interface AnalyzeRequest {
  repo: string;           // "owner/repo", full GitHub URL, or GitLab URL
  token?: string;         // optional PAT for private repos
  branch?: string;
  gitlab_host?: string;   // optional explicit GitLab host for self-hosted instances
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

/** Source descriptor passed to the analyze handler. */
export type AnalyzeSource =
  | { type: 'github'; identifier: string }
  | { type: 'gitlab'; identifier: string; host: string };

export type AnalyzeHandler = (source: AnalyzeSource, token?: string, branch?: string) => Promise<unknown>;

/**
 * Parse a repo string (and optional gitlab_host) into a typed source descriptor.
 *
 * Accepts:
 *   - GitHub shorthand: "owner/repo"
 *   - GitHub URL: "https://github.com/owner/repo"
 *   - GitLab URL (cloud or self-hosted): "https://gitlab.com/group/sub/repo"
 *   - GitLab path + explicit host: ("group/sub/repo", "gitlab.internal.company.com")
 *
 * Returns null if the input cannot be recognised as either platform.
 */
export function normalizeRepo(
  input: string,
  gitlabHost?: string,
): { type: 'github' | 'gitlab'; identifier: string; host?: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '');

  // Explicit gitlab_host always wins — treat input as a project path
  if (gitlabHost) {
    return { type: 'gitlab', identifier: trimmed, host: gitlabHost };
  }

  // GitHub patterns (only when no explicit GitLab host)
  const ghPatterns = [
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/,
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
  ];
  for (const p of ghPatterns) {
    const m = trimmed.match(p);
    if (m) return { type: 'github', identifier: `${m[1]}/${m[2]}` };
  }

  // GitLab — cloud or self-hosted URL
  const glPattern = /(?:https?:\/\/)?([^/]*gitlab[^/?#]*)\/([\w./-]+)/i;
  const glm = trimmed.match(glPattern);
  if (glm) return { type: 'gitlab', identifier: glm[2], host: glm[1] };

  return null;
}

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
    const rateResult = rateLimiter.check(clientKey, req.rateLimit);

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

    const gitlabHost = typeof body.gitlab_host === 'string' ? body.gitlab_host : undefined;
    const parsed = normalizeRepo(body.repo.trim(), gitlabHost);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid repo format. Use "owner/repo", a GitHub URL, or a GitLab URL.' });
      return;
    }

    // Build a stable cache key from the resolved identifier
    const repoLabel = parsed.type === 'gitlab'
      ? `${parsed.host}/${parsed.identifier}`
      : parsed.identifier;

    const branch = typeof body.branch === 'string' ? body.branch : 'HEAD';
    const cacheKey = buildCacheKey(repoLabel, { branch });

    // Return cached result immediately
    const cached = await cache.get(cacheKey);
    if (cached) {
      const jobId = uuidv4();
      const job: JobStatus = {
        id: jobId,
        repo: repoLabel,
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

    // Build the typed source descriptor for the handler
    const analyzeSource: AnalyzeSource = parsed.type === 'gitlab'
      ? { type: 'gitlab', identifier: parsed.identifier, host: parsed.host! }
      : { type: 'github', identifier: parsed.identifier };

    // Queue new job
    const jobId = uuidv4();
    const job: JobStatus = {
      id: jobId,
      repo: repoLabel,
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
        const result = await analyzeHandler(analyzeSource, body.token, branch);
        job.state = 'done';
        job.completedAt = new Date().toISOString();
        job.result = result;
        await cache.set(cacheKey, JSON.stringify(result));
        const summary = (result as any)?.summary;
        if (summary) {
          await historyStore.record(repoLabel, {
            score: summary.healthScore ?? 0,
            grade: summary.healthGrade ?? '?',
            fileCount: summary.fileCount ?? 0,
            analyzedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        job.state = 'error';
        job.completedAt = new Date().toISOString();
        job.error = (err as Error).message ?? 'Analysis failed';
      }
    })();

    res.status(202).json({ id: jobId, state: 'queued', repo: repoLabel });
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
    const cached = JSON.parse(raw) as { summary?: { healthScore: number; healthGrade: string } };
    if (!cached?.summary) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buildBadgeSvg(0, '?'));
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buildBadgeSvg(cached.summary.healthScore, cached.summary.healthGrade));
  });

  // ── GET /api/history/:owner/:repo ────────────────────────────────────────

  router.get('/api/history/:owner/:repo', async (req: Request, res: Response) => {
    const repo = `${req.params.owner}/${req.params.repo}`;
    const daysRaw = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days as string;
    const rawDays = parseInt((daysRaw as string) ?? '30', 10);
    const days = Math.min(isNaN(rawDays) ? 30 : rawDays, 90);
    const history = await historyStore.get(repo, days);
    res.json({ repo, history });
  });

  // ── GET /api/search ──────────────────────────────────────────────────────

  router.get('/api/search', (req: Request, res: Response) => {
    const q = (req.query.q as string ?? '').trim();
    if (!q) return res.json({ results: [] });
    res.json({ results: searchIndex.search(q) });
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

  // ── GET /api/audit?repo=&since=&limit= (enterprise-only) ─────────────────

  router.get('/api/audit', async (req: Request, res: Response) => {
    const { repo, since, limit } = req.query as Record<string, string>;
    const entries = await auditLogger.query({ repo, since, limit: Math.min(parseInt(limit ?? '50', 10), 500) });
    res.json({ entries });
  });

  return router;
}
