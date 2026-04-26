import request from 'supertest';
import app, { isValidRepo, analyzeRepo } from '../server';

const MOCK_RESULT = JSON.stringify({
  summary: { healthGrade: 'A', healthScore: 95, fileCount: 42, issueCount: 1, securityIssueCount: 0 },
  security: [],
  issues: [{ description: 'High complexity file: src/index.ts' }],
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) => cb(null, { stdout: MOCK_RESULT, stderr: '' })),
}));

test('isValidRepo accepts valid format', () => {
  expect(isValidRepo('owner/repo')).toBe(true);
  expect(isValidRepo('ashfordeOU/grasp')).toBe(true);
});

test('isValidRepo rejects invalid format', () => {
  expect(isValidRepo('notarepo')).toBe(false);
  expect(isValidRepo('a/b/c')).toBe(false);
  expect(isValidRepo('')).toBe(false);
});

test('analyzeRepo returns real grade and score', async () => {
  const result = await analyzeRepo('owner/repo');
  expect(result.grade).toBe('A');
  expect(result.score).toBe(95);
  expect(result.repo).toBe('owner/repo');
  expect(result.fileCount).toBe(42);
});

test('GET /analyze returns 200 with valid repo', async () => {
  const res = await request(app).get('/analyze?repo=owner/repo');
  expect(res.status).toBe(200);
  expect(res.body.grade).toBeDefined();
  expect(res.body.score).toBeDefined();
  expect(res.body.repo).toBe('owner/repo');
});

test('GET /analyze returns 400 without repo', async () => {
  const res = await request(app).get('/analyze');
  expect(res.status).toBe(400);
});

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
