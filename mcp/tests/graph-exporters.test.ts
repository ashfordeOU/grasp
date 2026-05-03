import { exportGraphML, exportCypher, exportObsidianCanvas } from '../src/graph-exporters';
import type { AnalysisResult } from '../src/types';

function mkResult(): AnalysisResult {
  return {
    sessionId: 's1',
    source: '/tmp/repo',
    sourceType: 'local',
    analyzedAt: '2026-04-30T00:00:00Z',
    files: [
      {
        path: 'src/foo.ts',
        name: 'foo.ts',
        folder: 'src',
        content: null,
        functions: [{ name: 'foo', file: 'src/foo.ts', line: 1 }],
        lines: 10,
        layer: 'core',
        churn: 0,
        isCode: true,
      },
      {
        path: 'src/bar.ts',
        name: 'bar.ts',
        folder: 'src',
        content: null,
        functions: [{ name: 'bar', file: 'src/bar.ts', line: 2 }],
        lines: 20,
        layer: 'app',
        churn: 0,
        isCode: true,
      },
    ],
    connections: [{ source: 'src/foo.ts', target: 'src/bar.ts', fn: 'foo', count: 1 }],
    issues: [],
    patterns: [],
    security: [],
    duplicates: [],
    layerViolations: [],
    folders: ['src'],
    layers: ['core', 'app'],
    summary: {
      fileCount: 2,
      codeFileCount: 2,
      functionCount: 2,
      connectionCount: 1,
      issueCount: 0,
      criticalIssueCount: 0,
      circularDepCount: 0,
      securityIssueCount: 0,
      healthScore: 100,
      healthGrade: 'A',
      layers: ['core', 'app'],
      topFolders: [{ name: 'src', count: 2 }],
      languages: [{ ext: 'ts', count: 2 }],
    },
  };
}

describe('graph exporters', () => {
  it('exportGraphML produces valid GraphML XML with node + edge tags', () => {
    const xml = exportGraphML(mkResult());
    expect(xml).toContain('<graphml');
    expect(xml).toContain('<node id=');
    expect(xml).toContain('<edge ');
    expect(xml).toContain('source=');
    expect(xml).toContain('target=');
    expect(xml).toContain('src/foo.ts');
    expect(xml).toContain('src/bar.ts');
  });

  it('exportCypher produces CREATE statements with IMPORTS edge', () => {
    const cypher = exportCypher(mkResult());
    expect(cypher).toContain('CREATE (');
    expect(cypher).toContain('IMPORTS');
    expect(cypher).toContain(':File');
    expect(cypher).toContain(':Function');
    expect(cypher).toContain('DEFINES');
    expect(cypher).toContain('src/foo.ts');
  });

  it('exportObsidianCanvas produces valid JSON with nodes/edges arrays', () => {
    const json = exportObsidianCanvas(mkResult());
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
    // Each node has required Obsidian Canvas fields
    for (const n of parsed.nodes) {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('type', 'text');
      expect(n).toHaveProperty('x');
      expect(n).toHaveProperty('y');
      expect(n).toHaveProperty('color');
    }
    // Files in different layers should sit in different columns
    const xs = new Set(parsed.nodes.map((n: any) => n.x));
    expect(xs.size).toBe(2);
  });

  it('exportCypher escapes single quotes in paths', () => {
    const r = mkResult();
    r.files[0].path = "src/it's.ts";
    r.connections = [];
    const cypher = exportCypher(r);
    expect(cypher).toContain("it\\'s");
  });
});
