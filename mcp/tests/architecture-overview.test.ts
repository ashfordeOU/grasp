import {
  hubNodes,
  surprisingConnections,
  knowledgeGaps,
  suggestedQuestions,
} from '../src/graph-analytics';
import type { AnalysisResult, AnalyzedFile, Connection } from '../src/types';

function mkFile(path: string, layer = 'core'): AnalyzedFile {
  return {
    path, name: path.split('/').pop() ?? path,
    folder: path.split('/').slice(0, -1).join('/') || '.',
    content: null, functions: [], lines: 100, layer, churn: 0, isCode: true,
  };
}

function mkConn(source: string, target: string): Connection {
  return { source, target, fn: 'call', count: 1 };
}

function mkResult(files: AnalyzedFile[], connections: Connection[]): AnalysisResult {
  return {
    sessionId: 'test', source: 'test/repo', sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files, connections,
    issues: [], patterns: [], security: [], duplicates: [],
    layerViolations: [], folders: [], layers: [],
    summary: {
      fileCount: files.length, codeFileCount: files.length,
      functionCount: 0, connectionCount: connections.length,
      issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0,
      healthScore: 80, healthGrade: 'B',
      layers: [], topFolders: [], languages: [],
    },
  };
}

// The grasp_architecture_overview tool composes the four primitives. We
// validate here that they all return the shape the tool relies on, so a
// regression in any primitive surfaces in this single test.
describe('architecture overview composition', () => {
  test('combines hubs, surprising, gaps, and questions on a layered fixture', () => {
    const files = [
      mkFile('api/server.ts', 'api'),
      mkFile('api/router.ts', 'api'),
      mkFile('core/db.ts', 'core'),
      mkFile('core/auth.ts', 'core'),
      mkFile('utils/logger.ts', 'utils'),
      mkFile('legacy/billing.ts', 'legacy'),
    ];
    const connections = [
      mkConn('api/server.ts', 'core/db.ts'),
      mkConn('api/server.ts', 'core/auth.ts'),
      mkConn('api/router.ts', 'core/db.ts'),
      mkConn('core/db.ts', 'utils/logger.ts'),
      mkConn('core/auth.ts', 'utils/logger.ts'),
      mkConn('api/server.ts', 'legacy/billing.ts'),
    ];
    const r = mkResult(files, connections);

    const hubs = hubNodes(r, 10);
    const surprising = surprisingConnections(r, 5);
    const gaps = knowledgeGaps(r);
    const questions = suggestedQuestions(r);

    // Hubs return file/fan_in/fan_out/total/layer
    expect(hubs.rows.length).toBeGreaterThan(0);
    expect(hubs.rows[0]).toHaveProperty('file');
    expect(hubs.rows[0]).toHaveProperty('fan_in');
    expect(hubs.rows[0]).toHaveProperty('fan_out');
    expect(hubs.rows[0]).toHaveProperty('total');
    expect(hubs.rows[0]).toHaveProperty('layer');

    // Surprising rows expose rarity_pct (not `rarity`)
    expect(surprising.rows.length).toBeGreaterThanOrEqual(0);
    if (surprising.rows.length > 0) {
      expect(surprising.rows[0]).toHaveProperty('rarity_pct');
      expect(typeof surprising.rows[0].rarity_pct).toBe('number');
    }

    // Knowledge gaps shape
    expect(gaps).toHaveProperty('isolated_files');
    expect(gaps).toHaveProperty('untested_hotspots');
    expect(gaps).toHaveProperty('weak_communities');

    // Suggested questions use `why` (not `why_it_matters`)
    expect(questions.questions.length).toBeGreaterThan(0);
    expect(questions.questions[0]).toHaveProperty('question');
    expect(questions.questions[0]).toHaveProperty('why');
  });
});
