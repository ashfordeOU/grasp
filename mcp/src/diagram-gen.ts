import type { AnalysisResult } from './types.js';

function sanitizeId(p: string): string { return p.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '') || 'node'; }
function sanitizeLabel(p: string): string { return p.split('/').pop() ?? p; }

export function generateMermaid(data: AnalysisResult, maxNodes: number): string {
  const conns = data.connections as any[];
  const fanInMap = new Map<string, number>();
  for (const conn of conns) { const to = conn.to ?? conn.target; fanInMap.set(to, (fanInMap.get(to) ?? 0) + 1); }
  const sorted = [...data.files].sort((a, b) => (fanInMap.get(b.path) ?? 0) - (fanInMap.get(a.path) ?? 0));
  const included = new Set(sorted.slice(0, maxNodes).map(f => f.path));
  const layerMap = new Map<string, typeof data.files>();
  for (const f of data.files) { if (!included.has(f.path)) continue; const l = (f as any).layer ?? 'other'; if (!layerMap.has(l)) layerMap.set(l, []); layerMap.get(l)!.push(f); }
  const secFiles = new Set((data.security ?? []).map((s: any) => s.file).filter(Boolean));
  const circFiles = new Set((data.patterns ?? []).filter((p: any) => p.type === 'circular').flatMap((p: any) => p.files ?? []));
  const lines = ['graph LR'];
  for (const [layer, files] of layerMap) {
    lines.push(`  subgraph ${layer}`);
    for (const f of files) { const id = sanitizeId(f.path); const lbl = sanitizeLabel(f.path); lines.push(secFiles.has(f.path) ? `    ${id}["🔴 ${lbl}"]` : circFiles.has(f.path) ? `    ${id}["🟡 ${lbl}"]` : `    ${id}["${lbl}"]`); }
    lines.push('  end');
  }
  lines.push('');
  for (const c of conns) { const from = c.from ?? c.source; const to = c.to ?? c.target; if (included.has(from) && included.has(to)) lines.push(`  ${sanitizeId(from)} --> ${sanitizeId(to)}`); }
  return lines.join('\n');
}

export function generateC4Context(data: AnalysisResult): string {
  const sysName = (data.source.split('/').pop() ?? 'System').replace(/[^a-zA-Z0-9 ]/g, ' ');
  const layers = [...new Set(data.files.map((f: any) => f.layer ?? 'core').filter(Boolean))];
  const known = new Set(data.files.map(f => f.path));
  const ext = new Set<string>();
  for (const c of data.connections as any[]) { const to = c.to ?? c.target; if (to && !known.has(to) && to.includes('/')) { const p = to.split('/')[0]; if (p && !p.startsWith('src') && !p.startsWith('.')) ext.add(p); } }
  const lines = ['C4Context', `  title System Context — ${sysName}`, '', `  System(${sanitizeId(sysName)}, "${sysName}", "Codebase with ${data.files.length} files, ${layers.length} layers")`];
  for (const d of [...ext].slice(0, 8)) lines.push(`  System_Ext(${sanitizeId(d)}, "${d}", "External dependency")`);
  lines.push('');
  for (const d of [...ext].slice(0, 8)) lines.push(`  Rel(${sanitizeId(sysName)}, ${sanitizeId(d)}, "Uses")`);
  return lines.join('\n');
}

export function generateC4Container(data: AnalysisResult): string {
  const sysName = (data.source.split('/').pop() ?? 'System').replace(/[^a-zA-Z0-9 ]/g, ' ');
  const layers = [...new Set(data.files.map((f: any) => f.layer ?? 'core').filter(Boolean))];
  const tech: Record<string, string> = { ui: 'TypeScript, React', services: 'TypeScript, Node.js', db: 'Database Layer', api: 'REST API', config: 'Configuration', utils: 'Utilities', models: 'Data Models' };
  const lines = ['C4Container', `  title Container Diagram — ${sysName}`, '', `  System_Boundary(sys, "${sysName}") {`];
  for (const l of layers) { const cnt = data.files.filter((f: any) => (f.layer ?? 'core') === l).length; lines.push(`    Container(${sanitizeId(l)}, "${l}", "${tech[l] ?? 'TypeScript'}", "${cnt} files")`); }
  lines.push('  }', '');
  const lm = new Map<string, Set<string>>();
  for (const c of data.connections as any[]) { const from = c.from ?? c.source; const to = c.to ?? c.target; const ff = data.files.find(f => f.path === from); const tf = data.files.find(f => f.path === to); if (!ff || !tf) continue; const fl = (ff as any).layer ?? 'core'; const tl = (tf as any).layer ?? 'core'; if (fl === tl) continue; if (!lm.has(fl)) lm.set(fl, new Set()); lm.get(fl)!.add(tl); }
  for (const [f, ts] of lm) for (const t of ts) lines.push(`  Rel(${sanitizeId(f)}, ${sanitizeId(t)}, "imports")`);
  return lines.join('\n');
}

export function generateC4Component(data: AnalysisResult, targetLayer: string, maxNodes: number): string {
  const files = data.files.filter((f: any) => (f.layer ?? 'core') === targetLayer).slice(0, maxNodes);
  const sysName = data.source.split('/').pop() ?? 'System';
  const lines = ['C4Component', `  title Component Diagram — ${targetLayer} layer of ${sysName}`, '', `  Container_Boundary(layer, "${targetLayer}") {`];
  for (const f of files) lines.push(`    Component(${sanitizeId(f.path)}, "${sanitizeLabel(f.path)}", "TypeScript", "${(f as any).functions?.length ?? 0} functions")`);
  lines.push('  }', '');
  const fp = new Set(files.map(f => f.path));
  for (const c of data.connections as any[]) { const from = c.from ?? c.source; const to = c.to ?? c.target; if (fp.has(from) && fp.has(to)) lines.push(`  Rel(${sanitizeId(from)}, ${sanitizeId(to)}, "imports")`); }
  return lines.join('\n');
}
