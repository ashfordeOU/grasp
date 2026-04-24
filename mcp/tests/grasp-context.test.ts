import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-context-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

function fakeResult(source: string) {
  return {
    sessionId: 'sess-ctx-test',
    source,
    sourceType: 'local' as const,
    analyzedAt: new Date().toISOString(),
    files: [
      {
        path: 'src/index.ts',
        name: 'index.ts',
        folder: 'src',
        content: null,
        functions: [{ name: 'main', line: 10, type: 'function' }],
        lines: 120,
        layer: 'services',
        churn: 3,
        isCode: true,
        complexity: 8,
        nestingDepth: 3,
      },
    ],
    connections: [
      { source: 'src/utils.ts', target: 'src/index.ts', fn: 'helper' },
      { source: 'src/index.ts', target: 'src/db.ts', fn: 'query' },
    ],
    issues: [],
    patterns: [],
    security: [{ file: 'src/index.ts', severity: 'HIGH', desc: 'eval usage detected' }],
    duplicates: [],
    layerViolations: [],
    folders: ['src'],
    layers: ['services'],
    summary: {
      fileCount: 3,
      codeFileCount: 3,
      functionCount: 1,
      connectionCount: 2,
      issueCount: 0,
      criticalIssueCount: 0,
      circularDepCount: 0,
      securityIssueCount: 1,
      healthScore: 80,
      healthGrade: 'B',
      layers: ['services'],
      topFolders: [],
      languages: [],
    },
  } as any;
}

// grasp_context — no brain data returns fallback message
test('grasp_context returns no-data message when file not indexed', () => {
  const ctx = brain.getFileContext('someSource', 'src/index.ts');
  const text = ctx
    ? 'found'
    : `No brain data for src/index.ts in someSource. Run grasp_brain_index first.`;
  expect(text).toBe('No brain data for src/index.ts in someSource. Run grasp_brain_index first.');
});

// grasp_context — returns correct JSON structure
test('grasp_context returns correct output shape when file is indexed', () => {
  const source = '/tmp/ctx-repo';
  brain.indexResult(fakeResult(source));
  const ctx = brain.getFileContext(source, 'src/index.ts');
  expect(ctx).not.toBeNull();

  const output = {
    file: ctx!.path,
    layer: ctx!.layer,
    health_grade: ctx!.healthGrade,
    complexity: ctx!.complexity,
    coupling_in: ctx!.couplingIn,
    coupling_out: ctx!.couplingOut,
    churn: ctx!.churn,
    dependents: ctx!.dependents,
    dependencies: ctx!.dependencies,
    security_issues: ctx!.security,
  };

  expect(output.file).toBe('src/index.ts');
  expect(output.layer).toBe('services');
  expect(output.health_grade).toBe('B');
  expect(output.complexity).toBe(8);
  expect(typeof output.coupling_in).toBe('number');
  expect(typeof output.coupling_out).toBe('number');
  expect(typeof output.churn).toBe('number');
});

// grasp_context — security_issues array is present in output
test('grasp_context output contains security_issues array', () => {
  const source = '/tmp/ctx-repo-sec';
  brain.indexResult(fakeResult(source));
  const ctx = brain.getFileContext(source, 'src/index.ts');
  expect(ctx).not.toBeNull();
  expect(Array.isArray(ctx!.security)).toBe(true);
  expect(ctx!.security).toHaveLength(1);
  expect(ctx!.security[0].severity).toBe('HIGH');
  expect(ctx!.security[0].desc).toBe('eval usage detected');
});

// grasp_context — dependents and dependencies arrays are present
test('grasp_context output contains dependents and dependencies arrays', () => {
  const source = '/tmp/ctx-repo-deps';
  brain.indexResult(fakeResult(source));
  const ctx = brain.getFileContext(source, 'src/index.ts');
  expect(ctx).not.toBeNull();
  expect(Array.isArray(ctx!.dependents)).toBe(true);
  expect(Array.isArray(ctx!.dependencies)).toBe(true);
  // src/utils.ts → src/index.ts, so src/index.ts has 1 dependent
  expect(ctx!.dependents).toContain('src/utils.ts');
  // src/index.ts → src/db.ts, so src/index.ts has 1 dependency
  expect(ctx!.dependencies).toContain('src/db.ts');
});
