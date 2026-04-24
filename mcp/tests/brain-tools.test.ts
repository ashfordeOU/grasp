import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-brain-tools-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

function fakeResult(source: string) {
  return {
    sessionId: 'sess-tool-test',
    source,
    sourceType: 'local' as const,
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/index.ts', name: 'index.ts', folder: 'src', content: null, functions: [], lines: 80, layer: 'services', churn: 0, isCode: true, complexity: 5, nestingDepth: 2 },
    ],
    connections: [],
    issues: [], patterns: [], security: [], duplicates: [], layerViolations: [],
    folders: ['src'], layers: ['services'],
    summary: { fileCount: 1, codeFileCount: 1, functionCount: 0, connectionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, healthScore: 90, healthGrade: 'A', layers: ['services'], topFolders: [], languages: [] },
  } as any;
}

// grasp_brain_index response format
test('brain index response formats correctly', () => {
  const result = fakeResult('/tmp/test-repo');
  brain.indexResult(result);
  const repo = brain.getRepo('/tmp/test-repo');
  expect(repo).not.toBeNull();
  const text = `Indexed ${result.source}: ${result.summary.fileCount} files, health ${result.summary.healthGrade} (${result.summary.healthScore})`;
  expect(text).toBe('Indexed /tmp/test-repo: 1 files, health A (90)');
});

// grasp_brain_status — empty
test('brain status returns empty message when no repos', () => {
  const repos = brain.listRepos();
  const text = repos.length === 0 ? 'No repos indexed yet.' : JSON.stringify(repos, null, 2);
  expect(text).toBe('No repos indexed yet.');
});

// grasp_brain_status — populated
test('brain status returns JSON for indexed repos', () => {
  brain.indexResult(fakeResult('/tmp/test-repo'));
  const repos = brain.listRepos();
  expect(repos).toHaveLength(1);
  const text = JSON.stringify(repos, null, 2);
  const parsed = JSON.parse(text);
  expect(parsed[0].source).toBe('/tmp/test-repo');
  expect(parsed[0].healthGrade).toBe('A');
});

// grasp_brain_index is idempotent (re-indexing same source updates, not duplicates)
test('brain index is idempotent — re-indexing same source updates the record', () => {
  brain.indexResult(fakeResult('/tmp/test-repo'));
  const r2 = fakeResult('/tmp/test-repo');
  r2.summary.healthScore = 75;
  r2.summary.healthGrade = 'B';
  brain.indexResult(r2);
  expect(brain.listRepos()).toHaveLength(1);
  expect(brain.getRepo('/tmp/test-repo')!.healthScore).toBe(75);
});
