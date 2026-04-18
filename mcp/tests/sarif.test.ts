import { toSarif } from '../src/sarif';
import type { AnalysisResult } from '../src/types';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    sessionId: 'sarif-test',
    source: '/tmp/proj',
    sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/index.ts', layer: 'ui', lines: 50, functions: [], fanIn: 0, fanOut: 1, complexity: 3, nestingDepth: 2, churn: 1, contributors: [] },
      { path: 'src/auth.ts', layer: 'services', lines: 120, functions: [], fanIn: 2, fanOut: 0, complexity: 12, nestingDepth: 4, churn: 8, contributors: [] },
    ],
    connections: [
      { source: 'src/auth.ts', target: 'src/index.ts', fn: 'login', count: 1 },
    ],
    issues: [
      {
        type: 'warning',
        title: 'Dead code',
        desc: 'Unused function',
        items: [{ name: 'oldHelper', file: 'src/auth.ts', line: 42 }],
      },
      {
        type: 'critical',
        title: 'Circular dependency',
        desc: 'Circular import chain',
        items: [{ files: ['src/index.ts', 'src/auth.ts'] }],
      },
    ],
    security: [
      {
        file: 'src/auth.ts',
        line: 10,
        type: 'Hardcoded secret',
        desc: 'API key in source',
        severity: 'critical',
        match: 'SECRET_KEY',
      },
    ],
    patterns: [],
    duplicates: [],
    layerViolations: [
      { from: 'src/auth.ts', fromLayer: 'services', to: 'src/index.ts', toLayer: 'ui', fn: 'renderPage' },
    ],
    folders: ['src'],
    layers: ['ui', 'services'],
    summary: {
      fileCount: 2, codeFileCount: 2, functionCount: 0, connectionCount: 1,
      issueCount: 2, criticalIssueCount: 1, circularDepCount: 1, securityIssueCount: 1,
      healthScore: 40, healthGrade: 'D', layers: ['ui', 'services'],
      topFolders: [], languages: [],
    },
    ...overrides,
  } as AnalysisResult;
}

describe('toSarif', () => {
  test('returns a valid SARIF 2.1.0 document', () => {
    const sarif = toSarif(makeResult());
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toMatch(/sarif-schema-2\.1\.0/);
    expect(sarif.runs).toHaveLength(1);
  });

  test('tool driver has correct metadata', () => {
    const sarif = toSarif(makeResult());
    const driver = sarif.runs[0].tool.driver;
    expect(driver.name).toBe('Grasp');
    expect(driver.version).toBeTruthy();
    expect(driver.informationUri).toMatch(/github\.com/);
  });

  test('security issues produce error-level results', () => {
    const sarif = toSarif(makeResult());
    const secResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/security');
    expect(secResults).toHaveLength(1);
    expect(secResults[0].level).toBe('error');
    expect(secResults[0].message.text).toContain('Hardcoded secret');
    expect(secResults[0].message.text).toContain('SECRET_KEY');
  });

  test('security issue location has file and line', () => {
    const sarif = toSarif(makeResult());
    const sec = sarif.runs[0].results.find(r => r.ruleId === 'grasp/security')!;
    expect(sec.locations[0].physicalLocation.artifactLocation.uri).toBe('src/auth.ts');
    expect(sec.locations[0].physicalLocation.region?.startLine).toBe(10);
  });

  test('layer violations produce warning-level arch-violation results', () => {
    const sarif = toSarif(makeResult());
    const archResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/arch-violation');
    expect(archResults).toHaveLength(1);
    expect(archResults[0].level).toBe('warning');
    expect(archResults[0].message.text).toContain('services');
    expect(archResults[0].message.text).toContain('ui');
  });

  test('dead code issues map to grasp/dead-code rule', () => {
    const sarif = toSarif(makeResult());
    const deadResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/dead-code');
    expect(deadResults.length).toBeGreaterThan(0);
    expect(deadResults[0].message.text).toContain('Dead code');
    expect(deadResults[0].message.text).toContain('oldHelper');
  });

  test('circular dependency issues map to grasp/circular-dep rule', () => {
    const sarif = toSarif(makeResult());
    const circResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/circular-dep');
    expect(circResults.length).toBeGreaterThan(0);
    // level reflects the issue severity (critical → error)
    expect(['warning', 'error']).toContain(circResults[0].level);
  });

  test('only rules that appear in results are included in driver.rules', () => {
    const sarif = toSarif(makeResult());
    const ruleIds = sarif.runs[0].tool.driver.rules.map(r => r.id);
    const resultRuleIds = new Set(sarif.runs[0].results.map(r => r.ruleId));
    for (const id of ruleIds) {
      expect(resultRuleIds.has(id)).toBe(true);
    }
  });

  test('artifacts list contains analyzed files', () => {
    const sarif = toSarif(makeResult());
    const artifacts = sarif.runs[0].artifacts ?? [];
    const uris = artifacts.map(a => a.location.uri);
    expect(uris).toContain('src/index.ts');
    expect(uris).toContain('src/auth.ts');
  });

  test('empty result produces valid SARIF with no results', () => {
    const sarif = toSarif(makeResult({
      security: [],
      layerViolations: [],
      issues: [],
      files: [],
    }));
    expect(sarif.runs[0].results).toHaveLength(0);
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(0);
  });

  test('high severity security issue maps to error level', () => {
    const sarif = toSarif(makeResult({
      security: [{ file: 'src/db.ts', line: 5, type: 'SQL injection', desc: 'Unsafe query', severity: 'high', match: undefined }],
      layerViolations: [],
      issues: [],
    }));
    const sec = sarif.runs[0].results.find(r => r.ruleId === 'grasp/security')!;
    expect(sec.level).toBe('error');
  });

  test('medium severity security issue maps to warning level', () => {
    const sarif = toSarif(makeResult({
      security: [{ file: 'src/log.ts', line: 3, type: 'PII logging', desc: 'Logs sensitive data', severity: 'medium', match: undefined }],
      layerViolations: [],
      issues: [],
    }));
    const sec = sarif.runs[0].results.find(r => r.ruleId === 'grasp/security')!;
    expect(sec.level).toBe('warning');
  });

  test('issue items without a file are skipped', () => {
    const sarif = toSarif(makeResult({
      issues: [
        { type: 'warning', title: 'Dead code', desc: 'no file', items: [{ name: 'orphan' }] },
      ],
      security: [],
      layerViolations: [],
    }));
    // Items with no file should not produce SARIF results
    const deadResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/dead-code');
    expect(deadResults).toHaveLength(0);
  });

  test('high-complexity title maps to grasp/high-complexity rule', () => {
    const sarif = toSarif(makeResult({
      issues: [
        { type: 'warning', title: 'High complexity', desc: 'Too complex', items: [{ name: 'bigFn', file: 'src/monster.ts', line: 1 }] },
      ],
      security: [],
      layerViolations: [],
    }));
    const complexResults = sarif.runs[0].results.filter(r => r.ruleId === 'grasp/high-complexity');
    expect(complexResults).toHaveLength(1);
  });
});
