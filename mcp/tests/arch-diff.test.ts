import { computeArchDiff, type ArchDiff } from '../src/arch-diff.js';
import { formatDiffReport } from '../src/cli.js';

const base = {
  files: [
    { path: 'src/auth.ts', healthGrade: 'B', complexity: 8 },
    { path: 'src/utils.ts', healthGrade: 'A', complexity: 3 },
  ],
  healthScore: 80,
  security: [],
};

const current = {
  files: [
    { path: 'src/auth.ts', healthGrade: 'D', complexity: 22 },  // degraded
    { path: 'src/utils.ts', healthGrade: 'A', complexity: 3 },  // unchanged
    { path: 'src/new.ts', healthGrade: 'B', complexity: 5 },    // new file
  ],
  healthScore: 65,
  security: [{ severity: 'high', file: 'src/auth.ts', desc: 'SQL injection' }],
};

test('computeArchDiff detects grade-worsened files', () => {
  const diff = computeArchDiff(base, current);
  expect(diff.gradeDegradations).toHaveLength(1);
  expect(diff.gradeDegradations[0].file).toBe('src/auth.ts');
  expect(diff.gradeDegradations[0].before).toBe('B');
  expect(diff.gradeDegradations[0].after).toBe('D');
});

test('computeArchDiff computes health delta', () => {
  const diff = computeArchDiff(base, current);
  expect(diff.healthDelta).toBe(-15);  // 65 - 80
});

test('computeArchDiff lists new security issues', () => {
  const diff = computeArchDiff(base, current);
  expect(diff.newSecurityIssues).toHaveLength(1);
  expect(diff.newSecurityIssues[0].desc).toBe('SQL injection');
});

test('computeArchDiff returns empty degradations when grades improve or stay same', () => {
  const diff = computeArchDiff(base, { ...current, files: [{ path: 'src/auth.ts', healthGrade: 'A', complexity: 5 }], healthScore: 90, security: [] });
  expect(diff.gradeDegradations).toHaveLength(0);
  expect(diff.healthDelta).toBe(10);
});

test('formatDiffReport shows health delta', () => {
  const diff: ArchDiff = { gradeDegradations: [], healthDelta: -10, newSecurityIssues: [] };
  expect(formatDiffReport(diff)).toContain('-10');
});

test('formatDiffReport shows degradation details', () => {
  const diff: ArchDiff = { gradeDegradations: [{ file: 'src/a.ts', before: 'A', after: 'D', complexityDelta: 15 }], healthDelta: -5, newSecurityIssues: [] };
  expect(formatDiffReport(diff)).toContain('src/a.ts');
  expect(formatDiffReport(diff)).toContain('A → D');
});
