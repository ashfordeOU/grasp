import { askArchitecture } from '../src/ask-architecture.js';
import { SearchableBrainStore as BrainStore } from '../src/brain-search.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-ask-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

function makeResult(source: string) {
  return {
    sessionId: 'sess-ask',
    source,
    sourceType: 'local' as const,
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/auth.ts', name: 'auth.ts', folder: 'src', content: null, functions: [{ name: 'login', file: 'src/auth.ts', line: 5 }], lines: 200, layer: 'services', churn: 8, isCode: true, complexity: 25, nestingDepth: 5 },
      { path: 'src/utils.ts', name: 'utils.ts', folder: 'src', content: null, functions: [], lines: 40, layer: 'utils', churn: 1, isCode: true, complexity: 2, nestingDepth: 1 },
      { path: 'src/db.ts', name: 'db.ts', folder: 'src', content: null, functions: [], lines: 300, layer: 'data', churn: 2, isCode: true, complexity: 30, nestingDepth: 4 },
    ],
    connections: [
      { source: 'src/auth.ts', target: 'src/utils.ts', fn: 'formatDate', count: 2 },
      { source: 'src/auth.ts', target: 'src/db.ts', fn: 'query', count: 5 },
    ],
    issues: [], patterns: [], security: [
      { type: 'sqli', severity: 'critical', file: 'src/db.ts', line: 42, desc: 'SQL injection', match: 'query(' },
    ], duplicates: [], layerViolations: [], folders: ['src'], layers: ['services', 'utils', 'data'],
    summary: { fileCount: 3, codeFileCount: 3, functionCount: 1, connectionCount: 2, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 1, healthScore: 55, healthGrade: 'D', layers: ['services', 'utils', 'data'], topFolders: [], languages: [] },
  } as any;
}

test('askArchitecture returns no-data message when source not indexed', async () => {
  const answer = await askArchitecture(brain, '/tmp/notexist', 'what are the most complex files?');
  expect(answer).toContain('not indexed');
});

test('askArchitecture answers complexity question', async () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const answer = await askArchitecture(brain, '/tmp/repo', 'what are the most complex files?');
  expect(answer).toContain('src/db.ts');
  expect(answer).toContain('src/auth.ts');
});

test('askArchitecture answers security question', async () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const answer = await askArchitecture(brain, '/tmp/repo', 'show me security issues');
  expect(answer).toContain('src/db.ts');
  expect(answer).toContain('critical');
});

test('askArchitecture answers blast radius / coupling question', async () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const answer = await askArchitecture(brain, '/tmp/repo', 'which files have the highest blast radius?');
  expect(answer).toContain('src/auth.ts');  // auth.ts has highest couplingOut (2 deps)
});

test('askArchitecture answers health grade question', async () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const answer = await askArchitecture(brain, '/tmp/repo', 'show me files with grade F');
  // db.ts has complexity 30 → grade F
  expect(answer).toContain('src/db.ts');
});

test('askArchitecture answers churn question', async () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const answer = await askArchitecture(brain, '/tmp/repo', 'what are the most churned files?');
  expect(answer).toContain('src/auth.ts');  // churn=8, highest
});
