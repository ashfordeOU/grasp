import {
  exportGraphML,
  exportCypher,
  exportObsidianCanvas,
  exportDot,
  exportMermaid,
  exportD2,
  exportPlantUml,
  exportDgml,
  exportGexf,
  exportDrawio,
  exportCsv,
  exportCsvBundle,
} from '../src/graph-exporters';
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

  it('exportDot produces a digraph with subgraph clusters and an edge', () => {
    const dot = exportDot(mkResult());
    expect(dot).toContain('digraph G {');
    expect(dot).toContain('rankdir=LR');
    expect(dot).toContain('subgraph cluster_');
    expect(dot).toContain('"src/foo.ts"');
    expect(dot).toContain('"src/bar.ts"');
    expect(dot).toContain('->');
    expect(dot.trim().endsWith('}')).toBe(true);
  });

  it('exportMermaid produces a graph LR with subgraphs and an arrow', () => {
    const md = exportMermaid(mkResult());
    expect(md.startsWith('graph LR')).toBe(true);
    expect(md).toContain('subgraph');
    expect(md).toContain('-->');
  });

  it('exportD2 produces direction:right with layer containers and an edge', () => {
    const d2 = exportD2(mkResult());
    expect(d2).toContain('direction: right');
    // Layer containers nest the file basenames
    expect(d2).toContain('foo.ts');
    expect(d2).toContain('bar.ts');
    expect(d2).toContain('->');
  });

  it('exportPlantUml wraps with @startuml/@enduml and packages by layer', () => {
    const puml = exportPlantUml(mkResult());
    expect(puml).toContain('@startuml');
    expect(puml).toContain('@enduml');
    expect(puml).toContain('!theme');
    expect(puml).toContain('package "core"');
    expect(puml).toContain('package "app"');
    expect(puml).toContain('-->');
  });

  it('exportDgml produces a DirectedGraph with Nodes / Links / Categories', () => {
    const dgml = exportDgml(mkResult());
    expect(dgml).toContain('<DirectedGraph');
    expect(dgml).toContain('<Nodes>');
    expect(dgml).toContain('<Node Id="src/foo.ts"');
    expect(dgml).toContain('<Link Source="src/foo.ts" Target="src/bar.ts"');
    expect(dgml).toContain('<Categories>');
    expect(dgml).toContain('Category="core"');
  });

  it('exportGexf produces gexf 1.3 with attributes and weighted edges', () => {
    const gexf = exportGexf(mkResult());
    expect(gexf).toContain('<gexf');
    expect(gexf).toContain('version="1.3"');
    expect(gexf).toContain('<attribute id="0" title="layer"');
    expect(gexf).toContain('<node id="src/foo.ts"');
    expect(gexf).toContain('<edge id="0" source="src/foo.ts" target="src/bar.ts" weight="1"');
  });

  it('exportDrawio produces an mxfile with mxCells for nodes + edges', () => {
    const xml = exportDrawio(mkResult());
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<diagram');
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('value="foo.ts"');
    expect(xml).toContain('value="bar.ts"');
  });

  it('exportCsv returns three sheets and exportCsvBundle concatenates them', () => {
    const sheets = exportCsv(mkResult());
    expect(sheets.files.split('\n')[0]).toContain('path,layer,language,lines');
    expect(sheets.files).toContain('src/foo.ts,core,ts,10');
    expect(sheets.connections.split('\n')[0]).toBe('source,target,count');
    expect(sheets.connections).toContain('src/foo.ts,src/bar.ts,1');
    expect(sheets.issues.split('\n')[0]).toBe('type,severity,file,description');

    const bundle = exportCsvBundle(mkResult());
    expect(bundle).toContain('--- files.csv ---');
    expect(bundle).toContain('--- connections.csv ---');
    expect(bundle).toContain('--- issues.csv ---');
  });

  it('exportCsv quotes values containing commas, quotes, and newlines', () => {
    const r = mkResult();
    r.files[0].path = 'src/has,comma.ts';
    r.files[0].layer = 'a"b';
    r.connections = [];
    const sheets = exportCsv(r);
    expect(sheets.files).toContain('"src/has,comma.ts"');
    expect(sheets.files).toContain('"a""b"');
  });

  it('exportDot caps at maxNodes', () => {
    const r = mkResult();
    const dot = exportDot(r, { maxNodes: 1 });
    // Only the most-connected file should make it in. Both files have degree 1
    // but the first-sorted file wins; the other should not appear.
    const occurrences = (dot.match(/"src\/foo\.ts"|"src\/bar\.ts"/g) ?? []).length;
    expect(occurrences).toBeGreaterThan(0);
    // At most one of the two paths appears in node definitions.
    const fooMatches = (dot.match(/"src\/foo\.ts"/g) ?? []).length;
    const barMatches = (dot.match(/"src\/bar\.ts"/g) ?? []).length;
    // Only one node should be present in node definitions; edge skipped because target absent.
    expect(fooMatches === 0 || barMatches === 0).toBe(true);
  });
});
