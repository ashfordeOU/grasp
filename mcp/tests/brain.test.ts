import { BrainStore } from '../src/brain.js';
import type { AnalysisResult } from '../src/types.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-brain-test-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('creates brain.db in the given directory', () => {
  expect(fs.existsSync(path.join(tmpDir, 'brain.db'))).toBe(true);
});

test('upsertRepo stores a repo and getRepo retrieves it', () => {
  brain.upsertRepo({
    source: 'owner/repo',
    sourceType: 'github',
    healthScore: 72,
    healthGrade: 'C',
    fileCount: 50,
    functionCount: 300,
    issueCount: 5,
    securityIssueCount: 1,
    circularDepCount: 2,
    sessionId: 'abc123',
  });
  const r = brain.getRepo('owner/repo');
  expect(r).not.toBeNull();
  expect(r!.healthScore).toBe(72);
  expect(r!.healthGrade).toBe('C');
});

test('listRepos returns all upserted repos', () => {
  brain.upsertRepo({ source: 'a/b', sourceType: 'github', healthScore: 80, healthGrade: 'B', fileCount: 10, functionCount: 50, issueCount: 0, securityIssueCount: 0, circularDepCount: 0, sessionId: 's1' });
  brain.upsertRepo({ source: 'c/d', sourceType: 'github', healthScore: 60, healthGrade: 'D', fileCount: 20, functionCount: 100, issueCount: 3, securityIssueCount: 0, circularDepCount: 1, sessionId: 's2' });
  expect(brain.listRepos()).toHaveLength(2);
});

test('deleteRepo removes the repo', () => {
  brain.upsertRepo({ source: 'del/me', sourceType: 'local', healthScore: 50, healthGrade: 'D', fileCount: 5, functionCount: 20, issueCount: 1, securityIssueCount: 0, circularDepCount: 0, sessionId: 's3' });
  brain.deleteRepo('del/me');
  expect(brain.getRepo('del/me')).toBeNull();
});

test('upsertRepo is idempotent — second call updates, does not duplicate', () => {
  brain.upsertRepo({ source: 'dup/repo', sourceType: 'github', healthScore: 70, healthGrade: 'C', fileCount: 10, functionCount: 50, issueCount: 1, securityIssueCount: 0, circularDepCount: 0, sessionId: 's1' });
  brain.upsertRepo({ source: 'dup/repo', sourceType: 'github', healthScore: 85, healthGrade: 'B', fileCount: 12, functionCount: 60, issueCount: 0, securityIssueCount: 0, circularDepCount: 0, sessionId: 's2' });
  const all = brain.listRepos();
  expect(all.filter(r => r.source === 'dup/repo')).toHaveLength(1);
  expect(brain.getRepo('dup/repo')!.healthScore).toBe(85);
});

test('deleteRepo removes repo row only (no child rows to check at this stage)', () => {
  brain.upsertRepo({ source: 'clean/me', sourceType: 'local', healthScore: 50, healthGrade: 'D', fileCount: 5, functionCount: 20, issueCount: 1, securityIssueCount: 0, circularDepCount: 0, sessionId: 's4' });
  brain.deleteRepo('clean/me');
  expect(brain.getRepo('clean/me')).toBeNull();
  // child tables verified in Task 2 tests when indexResult populates them
});

function makeResult(source: string): AnalysisResult {
  return {
    sessionId: 'sess1',
    source,
    sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/auth.ts', name: 'auth.ts', folder: 'src', content: null, functions: [{ name: 'login', file: 'src/auth.ts', line: 5 }], lines: 100, layer: 'services', churn: 3, isCode: true, complexity: 15, nestingDepth: 3 },
      { path: 'src/utils.ts', name: 'utils.ts', folder: 'src', content: null, functions: [], lines: 50, layer: 'utils', churn: 1, isCode: true, complexity: 4, nestingDepth: 1 },
    ],
    connections: [
      { source: 'src/auth.ts', target: 'src/utils.ts', fn: 'formatDate', count: 2 },
    ],
    issues: [], patterns: [], security: [
      { type: 'hardcoded-secret', severity: 'high', file: 'src/auth.ts', line: 10, desc: 'Hardcoded token', match: 'secret=' },
    ], duplicates: [], layerViolations: [], folders: ['src'], layers: ['services', 'utils'],
    summary: { fileCount: 2, codeFileCount: 2, functionCount: 1, connectionCount: 1, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 1, healthScore: 68, healthGrade: 'C', layers: ['services', 'utils'], topFolders: [], languages: [] },
  };
}

test('indexResult populates files table', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const files = brain.queryFiles('/tmp/repo', {});
  expect(files).toHaveLength(2);
});

test('indexResult populates functions table', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const fns = brain.queryFunctions('/tmp/repo', 'login');
  expect(fns).toHaveLength(1);
  expect(fns[0].name).toBe('login');
});

test('getFileContext returns health data + dependents + security', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const ctx = brain.getFileContext('/tmp/repo', 'src/auth.ts');
  expect(ctx).not.toBeNull();
  expect(ctx!.layer).toBe('services');
  expect(ctx!.couplingOut).toBe(1);
  expect(ctx!.security).toHaveLength(1);
  expect(ctx!.dependencies).toContain('src/utils.ts');
});

test('queryFiles filters by layer', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const services = brain.queryFiles('/tmp/repo', { layer: 'services' });
  expect(services).toHaveLength(1);
  expect(services[0].path).toBe('src/auth.ts');
});

test('getFileContext dependents returns files that depend on this file', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const ctx = brain.getFileContext('/tmp/repo', 'src/utils.ts');
  expect(ctx!.dependents).toContain('src/auth.ts');
});

test('deleteRepo cascades to child tables', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const repoRecord = brain.getRepo('/tmp/repo');
  brain.saveSnapshot(repoRecord!.id, 'before-delete', {
    healthScore: 68, healthGrade: 'C', circularDepCount: 0,
    avgCouplingIn: 1, fileCoupling: {}, untestedFilePaths: [], topCoupledFiles: [],
  });
  brain.deleteRepo('/tmp/repo');
  expect(brain.queryFiles('/tmp/repo', {})).toHaveLength(0);
  expect(brain.queryFunctions('/tmp/repo', 'login')).toHaveLength(0);
  expect(brain.listSnapshots(repoRecord!.id)).toHaveLength(0);
});

describe('snapshots', () => {
  let snapTmpDir: string;
  let store: BrainStore;
  beforeEach(() => { snapTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-snap-')); });
  afterEach(() => {
    try { store?.close(); } catch {}
    fs.rmSync(snapTmpDir, { recursive: true, force: true });
  });

  it('saves and retrieves the last snapshot', () => {
    store = new BrainStore(snapTmpDir);
    store.saveSnapshot('repo123', 'baseline', {
      healthScore: 80, healthGrade: 'B', circularDepCount: 2,
      avgCouplingIn: 1.5, fileCoupling: { 'src/a.ts': { in: 2, out: 1 } },
      untestedFilePaths: [], topCoupledFiles: [],
    });
    const snap = store.getLastSnapshot('repo123');
    expect(snap).not.toBeNull();
    expect(snap!.name).toBe('baseline');
    expect(JSON.parse(snap!.data).healthScore).toBe(80);
  });

  it('returns null when no snapshots exist for repo', () => {
    store = new BrainStore(snapTmpDir);
    expect(store.getLastSnapshot('nonexistent')).toBeNull();
  });

  it('listSnapshots returns all in descending order', () => {
    store = new BrainStore(snapTmpDir);
    const base = { healthScore: 70, healthGrade: 'C', circularDepCount: 0, avgCouplingIn: 1, fileCoupling: {}, untestedFilePaths: [], topCoupledFiles: [] };
    store.saveSnapshot('r1', 'v1', base);
    store.saveSnapshot('r1', 'v2', { ...base, healthScore: 75 });
    const snaps = store.listSnapshots('r1');
    expect(snaps).toHaveLength(2);
    expect(snaps[0].name).toBe('v2');
  });

  it('getSnapshot returns by id', () => {
    store = new BrainStore(snapTmpDir);
    const base = { healthScore: 80, healthGrade: 'B', circularDepCount: 0, avgCouplingIn: 1, fileCoupling: {}, untestedFilePaths: [], topCoupledFiles: [] };
    store.saveSnapshot('r1', 'snap1', base);
    const list = store.listSnapshots('r1');
    const byId = store.getSnapshot(list[0].id);
    expect(byId).not.toBeNull();
    expect(byId!.name).toBe('snap1');
  });
});
