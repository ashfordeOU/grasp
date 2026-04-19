import request from 'supertest';
import app, { isValidRepo } from '../server';

test('isValidRepo accepts valid format', () => {
  expect(isValidRepo('owner/repo')).toBe(true);
  expect(isValidRepo('ashfordeOU/grasp')).toBe(true);
});

test('isValidRepo rejects invalid format', () => {
  expect(isValidRepo('notarepo')).toBe(false);
  expect(isValidRepo('a/b/c')).toBe(false);
  expect(isValidRepo('')).toBe(false);
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
