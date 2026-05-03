import {
  hubNodes,
  bridgeNodes,
  surprisingConnections,
  knowledgeGaps,
  suggestedQuestions,
} from '../src/graph-analytics';
import type { AnalysisResult, AnalyzedFile, Connection } from '../src/types';

// ── fixtures ──────────────────────────────────────────────────────────

function mkFile(path: string, layer = 'core', isCode = true): AnalyzedFile {
  return {
    path,
    name: path.split('/').pop() ?? path,
    folder: path.split('/').slice(0, -1).join('/') || '.',
    content: null,
    functions: [],
    lines: 100,
    layer,
    churn: 0,
    isCode,
  };
}

function mkConn(source: string, target: string, fn = 'call'): Connection {
  return { source, target, fn, count: 1 };
}

function mkResult(files: AnalyzedFile[], connections: Connection[], extra: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    sessionId: 'test',
    source: 'test/repo',
    sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files,
    connections,
    issues: [],
    patterns: [],
    security: [],
    duplicates: [],
    layerViolations: [],
    folders: [],
    layers: [],
    summary: {
      fileCount: files.length,
      codeFileCount: files.filter(f => f.isCode).length,
      functionCount: 0,
      connectionCount: connections.length,
      issueCount: 0,
      criticalIssueCount: 0,
      circularDepCount: 0,
      securityIssueCount: 0,
      healthScore: 80,
      healthGrade: 'B',
      layers: [],
      topFolders: [],
      languages: [],
    },
    ...extra,
  };
}

// ── 1. hubNodes ───────────────────────────────────────────────────────

describe('hubNodes', () => {
  test('ranks files by total connectivity (fan-in + fan-out)', () => {
    const files = [
      mkFile('a.ts', 'controller'),
      mkFile('b.ts', 'service'),
      mkFile('c.ts', 'util'),
      mkFile('d.ts', 'util'),
    ];
    // c is the hub: called by a, b, d AND calls a → fan-in 3, fan-out 1, total 4
    const conns = [
      mkConn('a.ts', 'c.ts'),
      mkConn('b.ts', 'c.ts'),
      mkConn('d.ts', 'c.ts'),
      mkConn('c.ts', 'a.ts'),
    ];
    const report = hubNodes(mkResult(files, conns), 5);
    expect(report.rows[0].file).toBe('c.ts');
    expect(report.rows[0].fan_in).toBe(3);
    expect(report.rows[0].fan_out).toBe(1);
    expect(report.rows[0].total).toBe(4);
    expect(report.rows[0].layer).toBe('util');
    expect(report.markdown).toContain('Hub nodes');
    expect(report.markdown).toContain('c.ts');
  });
});

// ── 2. bridgeNodes ────────────────────────────────────────────────────

describe('bridgeNodes', () => {
  test('identifies the chokepoint between two clusters', () => {
    // Topology:
    //   a → bridge → x
    //   b → bridge → y
    //   c → bridge → z
    // bridge is on every shortest path from {a,b,c} to {x,y,z}.
    const files = [
      mkFile('a.ts'), mkFile('b.ts'), mkFile('c.ts'),
      mkFile('bridge.ts'),
      mkFile('x.ts'), mkFile('y.ts'), mkFile('z.ts'),
    ];
    const conns = [
      mkConn('a.ts', 'bridge.ts'), mkConn('b.ts', 'bridge.ts'), mkConn('c.ts', 'bridge.ts'),
      mkConn('bridge.ts', 'x.ts'), mkConn('bridge.ts', 'y.ts'), mkConn('bridge.ts', 'z.ts'),
    ];
    const report = bridgeNodes(mkResult(files, conns), 5);
    expect(report.rows[0].file).toBe('bridge.ts');
    expect(report.rows[0].betweenness).toBeGreaterThan(0);
    expect(report.sampled).toBe(false);
    expect(report.node_count).toBe(7);
  });
});

// ── 3. surprisingConnections ─────────────────────────────────────────

describe('surprisingConnections', () => {
  test('flags rare layer-pairs as the most surprising', () => {
    const files = [
      mkFile('ctrl1.ts', 'controller'),
      mkFile('ctrl2.ts', 'controller'),
      mkFile('svc1.ts', 'service'),
      mkFile('svc2.ts', 'service'),
      mkFile('db.ts', 'database'),
      mkFile('audit.ts', 'audit'),
    ];
    // 4 common controller→service edges, 2 service→database edges, 1 RARE controller→audit
    const conns = [
      mkConn('ctrl1.ts', 'svc1.ts'),
      mkConn('ctrl1.ts', 'svc2.ts'),
      mkConn('ctrl2.ts', 'svc1.ts'),
      mkConn('ctrl2.ts', 'svc2.ts'),
      mkConn('svc1.ts', 'db.ts'),
      mkConn('svc2.ts', 'db.ts'),
      mkConn('ctrl1.ts', 'audit.ts'), // the unique surprising one
    ];
    const report = surprisingConnections(mkResult(files, conns), 5);
    expect(report.total_cross_layer_edges).toBe(7);
    // The rarest pair (controller→audit, count=1) should be ranked first
    expect(report.rows[0].source_layer).toBe('controller');
    expect(report.rows[0].target_layer).toBe('audit');
    expect(report.rows[0].pair_count).toBe(1);
    expect(report.rows[0].rarity_pct).toBeGreaterThan(80);
  });
});

// ── 4. knowledgeGaps ─────────────────────────────────────────────────

describe('knowledgeGaps', () => {
  test('reports isolated files, untested hotspots, and weak communities', () => {
    const files = [
      mkFile('hub.ts', 'core'),                          // untested hotspot (fan-in 6)
      mkFile('a.ts'), mkFile('b.ts'), mkFile('c.ts'),
      mkFile('d.ts'), mkFile('e.ts'), mkFile('f.ts'),
      mkFile('orphan.ts', 'core'),                       // isolated
      mkFile('thin.ts', 'thinlayer'),                    // single-file layer
      mkFile('tests/some.test.ts'),                      // test file (excluded)
    ];
    // 6 callers of hub.ts, none of them tests for it
    const conns = [
      mkConn('a.ts', 'hub.ts'), mkConn('b.ts', 'hub.ts'), mkConn('c.ts', 'hub.ts'),
      mkConn('d.ts', 'hub.ts'), mkConn('e.ts', 'hub.ts'), mkConn('f.ts', 'hub.ts'),
      // thin.ts has 6 outgoing cross-layer edges
      mkConn('thin.ts', 'a.ts'), mkConn('thin.ts', 'b.ts'), mkConn('thin.ts', 'c.ts'),
      mkConn('thin.ts', 'd.ts'), mkConn('thin.ts', 'e.ts'), mkConn('thin.ts', 'f.ts'),
    ];
    const report = knowledgeGaps(mkResult(files, conns));
    expect(report.isolated_files).toContain('orphan.ts');
    expect(report.untested_hotspots.some(u => u.file === 'hub.ts')).toBe(true);
    expect(report.weak_communities.some(w => w.layer === 'thinlayer')).toBe(true);
    expect(report.markdown).toContain('Knowledge gaps');
  });
});

// ── 5. suggestedQuestions ────────────────────────────────────────────

describe('suggestedQuestions', () => {
  test('generates at least one question covering hubs/gaps/surprising connections', () => {
    const files = [
      mkFile('hub.ts', 'core'),
      mkFile('a.ts', 'controller'),
      mkFile('b.ts', 'controller'),
      mkFile('c.ts', 'controller'),
      mkFile('audit.ts', 'audit'),
    ];
    const conns = [
      mkConn('a.ts', 'hub.ts'),
      mkConn('b.ts', 'hub.ts'),
      mkConn('c.ts', 'hub.ts'),
      mkConn('hub.ts', 'audit.ts'),
    ];
    const result = mkResult(files, conns, {
      duplicates: [{
        type: 'name', name: 'helper', count: 3, similarity: 90,
        suggestion: 'extract',
        files: [{ file: 'a.ts' }, { file: 'b.ts' }, { file: 'c.ts' }],
      }],
    });
    const report = suggestedQuestions(result);
    expect(report.questions.length).toBeGreaterThan(0);
    expect(report.questions.length).toBeLessThanOrEqual(10);
    expect(report.markdown).toContain('Suggested review questions');
    // at least one question should reference hub.ts (the top hub)
    expect(report.questions.some(q => q.question.includes('hub.ts'))).toBe(true);
  });
});
