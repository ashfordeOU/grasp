import { buildDigest, formatScoreDelta } from '../index';

test('digest includes all repos', () => {
  const digest = buildDigest([
    { repo: 'org/frontend', grade: 'B', score: 78, delta: +2 },
    { repo: 'org/backend', grade: 'D', score: 45, delta: -8 },
  ]);
  expect(digest.repos).toHaveLength(2);
  expect(digest.summary).toContain('2 repos');
});

test('digest flags repos with grade D or F', () => {
  const digest = buildDigest([{ repo: 'org/app', grade: 'D', score: 45, delta: 0 }]);
  expect(digest.alerts).toHaveLength(1);
  expect(digest.alerts[0].repo).toBe('org/app');
});

test('digest does not flag grades A-C', () => {
  const digest = buildDigest([
    { repo: 'org/a', grade: 'A', score: 95, delta: 0 },
    { repo: 'org/b', grade: 'B', score: 80, delta: 0 },
    { repo: 'org/c', grade: 'C', score: 65, delta: 0 },
  ]);
  expect(digest.alerts).toHaveLength(0);
});

test('digest includes timestamp', () => {
  const digest = buildDigest([]);
  expect(digest.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('formatScoreDelta formats positive delta', () => expect(formatScoreDelta(5)).toBe('+5'));
test('formatScoreDelta formats negative delta', () => expect(formatScoreDelta(-3)).toBe('-3'));
test('formatScoreDelta formats zero', () => expect(formatScoreDelta(0)).toBe('±0'));
