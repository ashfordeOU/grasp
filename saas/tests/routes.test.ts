import express, { Router } from 'express';
import { buildRouter } from '../src/routes.js';
import { MemoryCache } from '../src/cache.js';
import { RateLimiter } from '../src/rate-limit.js';

function buildTestApp(analyzeHandler = jest.fn().mockResolvedValue({ healthScore: 80 })) {
  const app = express();
  app.use(express.json());
  const cache = new MemoryCache();
  const rateLimiter = new RateLimiter(100);
  const router = buildRouter(Router(), cache, rateLimiter, analyzeHandler);
  app.use(router);
  return { app, cache, analyzeHandler };
}

async function doRequest(
  app: express.Application,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
) {
  const { default: request } = await import('supertest');
  const req = request(app);
  if (method === 'POST') return req.post(path).send(body).set('Content-Type', 'application/json');
  return req.get(path);
}

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ts).toBeTruthy();
  });
});

describe('GET /api/stats', () => {
  it('returns job and rate window counts', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'GET', '/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(res.body.jobs.total).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /api/analyze', () => {
  it('returns 400 for missing repo field', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'POST', '/api/analyze', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('repo');
  });

  it('returns 400 for invalid repo format', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'POST', '/api/analyze', { repo: 'not-a-valid-repo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid repo');
  });

  it('accepts owner/repo format', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'POST', '/api/analyze', { repo: 'facebook/react' });
    expect([200, 202]).toContain(res.status);
    expect(res.body.repo).toBe('facebook/react');
  });

  it('accepts full GitHub URL', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'POST', '/api/analyze', {
      repo: 'https://github.com/facebook/react',
    });
    expect([200, 202]).toContain(res.status);
    expect(res.body.repo).toBe('facebook/react');
  });

  it('returns 202 (queued) for fresh analysis', async () => {
    const { app } = buildTestApp(jest.fn().mockResolvedValue({ healthScore: 90 }));
    const res = await doRequest(app, 'POST', '/api/analyze', { repo: 'owner/fresh-repo' });
    expect(res.status).toBe(202);
    expect(res.body.state).toBe('queued');
    expect(res.body.id).toBeTruthy();
  });

  it('returns 200 (cached) when result already in cache', async () => {
    const { app, cache } = buildTestApp();
    const cacheKey = 'grasp:analysis:owner/cached-repo?branch=HEAD';
    await cache.set(cacheKey, JSON.stringify({ healthScore: 75, cached: true }));
    const res = await doRequest(app, 'POST', '/api/analyze', { repo: 'owner/cached-repo' });
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.state).toBe('done');
  });

  it('sets rate limit headers', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'POST', '/api/analyze', { repo: 'owner/repo' });
    expect(res.headers['x-ratelimit-limit']).toBeTruthy();
    expect(res.headers['x-ratelimit-remaining']).toBeTruthy();
  });

  it('returns 429 when rate limit exceeded', async () => {
    const app = express();
    app.use(express.json());
    const cache = new MemoryCache();
    const tightLimiter = new RateLimiter(2, 60_000);
    const handler = jest.fn().mockResolvedValue({});
    app.use(buildRouter(Router(), cache, tightLimiter, handler));

    // Exhaust the rate limit
    const { default: request } = await import('supertest');
    await request(app).post('/api/analyze').send({ repo: 'a/b' }).set('X-Forwarded-For', '1.2.3.4');
    await request(app).post('/api/analyze').send({ repo: 'a/b' }).set('X-Forwarded-For', '1.2.3.4');

    const res = await request(app).post('/api/analyze').send({ repo: 'a/b' }).set('X-Forwarded-For', '1.2.3.4');
    expect(res.status).toBe(429);
  });
});

describe('GET /api/result/:id', () => {
  it('returns 404 for unknown job id', async () => {
    const { app } = buildTestApp();
    const res = await doRequest(app, 'GET', '/api/result/no-such-id');
    expect(res.status).toBe(404);
  });

  it('returns the job for a known id', async () => {
    const { app } = buildTestApp();
    // Submit first
    const post = await doRequest(app, 'POST', '/api/analyze', { repo: 'owner/check-repo' });
    const jobId = post.body.id;
    const res = await doRequest(app, 'GET', `/api/result/${jobId}`);
    expect([200, 202]).toContain(res.status);
    expect(res.body.id).toBe(jobId);
    expect(res.body.repo).toBe('owner/check-repo');
  });
});
