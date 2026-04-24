import { BrainStore } from '../src/brain.js';
import { formatIndexResult, formatContextOutput } from '../src/cli.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-cli-brain-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

function makeResult(source: string) {
  return {
    sessionId: 'sess-cli',
    source,
    sourceType: 'local' as const,
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/main.ts', name: 'main.ts', folder: 'src', content: null, functions: [], lines: 60, layer: 'services', churn: 2, isCode: true, complexity: 8, nestingDepth: 2 },
    ],
    connections: [],
    issues: [], patterns: [], security: [], duplicates: [], layerViolations: [],
    folders: ['src'], layers: ['services'],
    summary: { fileCount: 1, codeFileCount: 1, functionCount: 0, connectionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, healthScore: 82, healthGrade: 'B', layers: ['services'], topFolders: [], languages: [] },
  } as any;
}

test('formatIndexResult produces expected string', () => {
  const result = makeResult('/tmp/repo');
  const text = formatIndexResult('/tmp/repo', result);
  expect(text).toBe('Indexed /tmp/repo: 1 files, health B (82)');
});

test('formatContextOutput returns null for missing file', () => {
  const ctx = brain.getFileContext('/tmp/repo', 'src/missing.ts');
  expect(ctx).toBeNull();
});

test('formatContextOutput returns structured object for indexed file', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const ctx = brain.getFileContext('/tmp/repo', 'src/main.ts');
  const out = formatContextOutput(ctx!);
  expect(out.file).toBe('src/main.ts');
  expect(out.layer).toBe('services');
  expect(out.health_grade).toBe('B');
  expect(Array.isArray(out.dependents)).toBe(true);
  expect(Array.isArray(out.dependencies)).toBe(true);
  expect(Array.isArray(out.security_issues)).toBe(true);
});
