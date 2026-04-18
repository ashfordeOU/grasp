import { FileChangeTracker } from '../src/sources/local';
import type { AnalysisResult } from '../src/types';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    sessionId: 'test-session',
    source: '/tmp/test',
    sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/index.ts', layer: 'ui', lines: 10, functions: [], fanIn: 0, fanOut: 2, complexity: 1, nestingDepth: 1, churn: 0, contributors: [] },
      { path: 'src/utils.ts', layer: 'utils', lines: 20, functions: [], fanIn: 2, fanOut: 0, complexity: 2, nestingDepth: 1, churn: 0, contributors: [] },
      { path: 'src/services/auth.ts', layer: 'services', lines: 50, functions: [], fanIn: 1, fanOut: 1, complexity: 5, nestingDepth: 2, churn: 3, contributors: [] },
    ],
    connections: [
      { source: 'src/utils.ts', target: 'src/index.ts', fn: 'greet', count: 1 },
      { source: 'src/utils.ts', target: 'src/services/auth.ts', fn: 'hash', count: 1 },
    ],
    issues: [
      { type: 'warning', title: 'Dead code', desc: 'unused function', items: [{ name: 'fn', file: 'src/utils.ts' }] },
    ],
    security: [],
    patterns: [],
    duplicates: [],
    layerViolations: [],
    folders: ['src', 'src/services'],
    layers: ['ui', 'utils', 'services'],
    summary: {
      fileCount: 3, codeFileCount: 3, functionCount: 0, connectionCount: 2,
      issueCount: 1, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0,
      healthScore: 80, healthGrade: 'B', layers: ['ui','utils','services'],
      topFolders: [], languages: [],
    },
    ...overrides,
  } as AnalysisResult;
}

describe('FileChangeTracker', () => {
  let tracker: FileChangeTracker;
  let initial: AnalysisResult;

  beforeEach(() => {
    initial = makeResult();
    tracker = new FileChangeTracker(initial);
  });

  describe('affectedFiles', () => {
    test('always includes the changed file itself', () => {
      const affected = tracker.affectedFiles('src/index.ts');
      expect(affected.has('src/index.ts')).toBe(true);
    });

    test('includes direct importers of the changed file', () => {
      // utils.ts is imported by both index.ts and auth.ts
      const affected = tracker.affectedFiles('src/utils.ts');
      expect(affected.has('src/utils.ts')).toBe(true);
      expect(affected.has('src/index.ts')).toBe(true);
      expect(affected.has('src/services/auth.ts')).toBe(true);
    });

    test('only includes self when file has no importers', () => {
      // index.ts is not imported by anything
      const affected = tracker.affectedFiles('src/index.ts');
      expect(affected.size).toBe(1);
      expect(affected.has('src/index.ts')).toBe(true);
    });

    test('handles unknown (new) files gracefully', () => {
      const affected = tracker.affectedFiles('src/new-file.ts');
      expect(affected.has('src/new-file.ts')).toBe(true);
      expect(affected.size).toBe(1);
    });
  });

  describe('merge', () => {
    test('replaces files in the affected set', () => {
      const updatedUtils = { ...initial.files[1], lines: 999 };
      const freshResult = makeResult({
        files: [updatedUtils],
        connections: [],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      const merged = tracker.merge(freshResult, affected);

      const utils = merged.files.find(f => f.path === 'src/utils.ts');
      expect(utils?.lines).toBe(999);
    });

    test('keeps unchanged files untouched', () => {
      const freshResult = makeResult({
        files: [{ ...initial.files[1], lines: 999 }],
        connections: [],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      const merged = tracker.merge(freshResult, affected);

      // index.ts and auth.ts should be unchanged
      const idx = merged.files.find(f => f.path === 'src/index.ts');
      const auth = merged.files.find(f => f.path === 'src/services/auth.ts');
      expect(idx).toBeDefined();
      expect(auth).toBeDefined();
      expect(idx?.lines).toBe(10);
      expect(auth?.lines).toBe(50);
    });

    test('updates fileCount in summary', () => {
      const freshResult = makeResult({
        files: [{ ...initial.files[1], lines: 999 }],
        connections: [],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      const merged = tracker.merge(freshResult, affected);
      expect(merged.summary.fileCount).toBe(3);
    });

    test('removes connections for affected files and adds fresh ones', () => {
      const freshConn = { source: 'src/utils.ts', target: 'src/index.ts', fn: 'greet', count: 5 };
      const freshResult = makeResult({
        files: [{ ...initial.files[1] }],
        connections: [freshConn],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      const merged = tracker.merge(freshResult, affected);

      const conn = merged.connections.find(
        c => c.source === 'src/utils.ts' && c.target === 'src/index.ts'
      );
      // Should have the fresh count (5), not the old (1)
      expect(conn?.count).toBe(5);
    });

    test('uses fresh issues after merge', () => {
      const freshResult = makeResult({
        files: [{ ...initial.files[1] }],
        connections: [],
        issues: [{ type: 'critical', title: 'Cycle', desc: 'circular dep', items: [] }],
      });
      const affected = new Set(['src/utils.ts']);
      const merged = tracker.merge(freshResult, affected);

      // Fresh issues replace old ones
      expect(merged.issues.length).toBe(1);
      expect(merged.issues[0].title).toBe('Cycle');
    });

    test('updates the internal index after merge', () => {
      // After merging, the dependents index should reflect new connections
      const freshResult = makeResult({
        files: [{ ...initial.files[1] }],
        connections: [{ source: 'src/utils.ts', target: 'src/index.ts', fn: 'greet', count: 1 }],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      tracker.merge(freshResult, affected);

      // Now utils.ts no longer imports auth.ts, so auth should not be affected
      const newAffected = tracker.affectedFiles('src/utils.ts');
      expect(newAffected.has('src/services/auth.ts')).toBe(false);
    });

    test('getCached returns the latest merged result', () => {
      const freshResult = makeResult({
        files: [{ ...initial.files[1], lines: 42 }],
        connections: [],
        issues: [],
      });
      const affected = new Set(['src/utils.ts']);
      tracker.merge(freshResult, affected);

      const cached = tracker.getCached();
      const utils = cached.files.find(f => f.path === 'src/utils.ts');
      expect(utils?.lines).toBe(42);
    });
  });
});
