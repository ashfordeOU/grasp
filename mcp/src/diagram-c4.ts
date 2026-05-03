import type { AnalysisResult } from './types.js';
import { sanitizeId, sanitizeLabel } from './diagram-shared.js';

const LAYER_TECH: Record<string, string> = {
  ui: 'TypeScript, React',
  services: 'TypeScript, Node.js',
  db: 'Database Layer',
  api: 'REST API',
  config: 'Configuration',
  utils: 'Utilities',
  models: 'Data Models',
};

function deriveSysName(source: string): string {
  return (source.split('/').pop() ?? 'System').replace(/[^a-zA-Z0-9 ]/g, ' ');
}

function collectExternalDeps(data: AnalysisResult): Set<string> {
  const known = new Set(data.files.map(f => f.path));
  const ext = new Set<string>();
  for (const c of data.connections as any[]) {
    const to = c.to ?? c.target;
    if (!to || known.has(to) || !to.includes('/')) continue;
    const prefix = to.split('/')[0];
    if (prefix && !prefix.startsWith('src') && !prefix.startsWith('.')) ext.add(prefix);
  }
  return ext;
}

export function generateC4Context(data: AnalysisResult): string {
  const sysName = deriveSysName(data.source);
  const layers = [...new Set(data.files.map((f: any) => f.layer ?? 'core').filter(Boolean))];
  const ext = collectExternalDeps(data);
  const lines = [
    'C4Context',
    `  title System Context — ${sysName}`,
    '',
    `  System(${sanitizeId(sysName)}, "${sysName}", "Codebase with ${data.files.length} files, ${layers.length} layers")`,
  ];
  for (const d of [...ext].slice(0, 8)) lines.push(`  System_Ext(${sanitizeId(d)}, "${d}", "External dependency")`);
  lines.push('');
  for (const d of [...ext].slice(0, 8)) lines.push(`  Rel(${sanitizeId(sysName)}, ${sanitizeId(d)}, "Uses")`);
  return lines.join('\n');
}

function buildLayerEdges(data: AnalysisResult): Map<string, Set<string>> {
  const lm = new Map<string, Set<string>>();
  for (const c of data.connections as any[]) {
    const from = c.from ?? c.source;
    const to = c.to ?? c.target;
    const ff = data.files.find(f => f.path === from);
    const tf = data.files.find(f => f.path === to);
    if (!ff || !tf) continue;
    const fl = (ff as any).layer ?? 'core';
    const tl = (tf as any).layer ?? 'core';
    if (fl === tl) continue;
    if (!lm.has(fl)) lm.set(fl, new Set());
    lm.get(fl)!.add(tl);
  }
  return lm;
}

export function generateC4Container(data: AnalysisResult): string {
  const sysName = deriveSysName(data.source);
  const layers = [...new Set(data.files.map((f: any) => f.layer ?? 'core').filter(Boolean))];
  const lines = [
    'C4Container',
    `  title Container Diagram — ${sysName}`,
    '',
    `  System_Boundary(sys, "${sysName}") {`,
  ];
  for (const l of layers) {
    const cnt = data.files.filter((f: any) => (f.layer ?? 'core') === l).length;
    lines.push(`    Container(${sanitizeId(l)}, "${l}", "${LAYER_TECH[l] ?? 'TypeScript'}", "${cnt} files")`);
  }
  lines.push('  }', '');
  const lm = buildLayerEdges(data);
  for (const [f, ts] of lm) for (const t of ts) lines.push(`  Rel(${sanitizeId(f)}, ${sanitizeId(t)}, "imports")`);
  return lines.join('\n');
}

export function generateC4Component(data: AnalysisResult, targetLayer: string, maxNodes: number): string {
  const files = data.files.filter((f: any) => (f.layer ?? 'core') === targetLayer).slice(0, maxNodes);
  const sysName = data.source.split('/').pop() ?? 'System';
  const lines = [
    'C4Component',
    `  title Component Diagram — ${targetLayer} layer of ${sysName}`,
    '',
    `  Container_Boundary(layer, "${targetLayer}") {`,
  ];
  for (const f of files) {
    lines.push(`    Component(${sanitizeId(f.path)}, "${sanitizeLabel(f.path)}", "TypeScript", "${(f as any).functions?.length ?? 0} functions")`);
  }
  lines.push('  }', '');
  const fp = new Set(files.map(f => f.path));
  for (const c of data.connections as any[]) {
    const from = c.from ?? c.source;
    const to = c.to ?? c.target;
    if (fp.has(from) && fp.has(to)) lines.push(`  Rel(${sanitizeId(from)}, ${sanitizeId(to)}, "imports")`);
  }
  return lines.join('\n');
}
