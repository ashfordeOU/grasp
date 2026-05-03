import type { AnalysisResult } from './types.js';
import { sanitizeId, sanitizeLabel } from './diagram-shared.js';

function buildFanInMap(conns: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of conns) {
    const to = c.to ?? c.target;
    map.set(to, (map.get(to) ?? 0) + 1);
  }
  return map;
}

function groupByLayer(files: AnalysisResult['files'], included: Set<string>): Map<string, AnalysisResult['files']> {
  const layerMap = new Map<string, AnalysisResult['files']>();
  for (const f of files) {
    if (!included.has(f.path)) continue;
    const l = (f as any).layer ?? 'other';
    if (!layerMap.has(l)) layerMap.set(l, []);
    layerMap.get(l)!.push(f);
  }
  return layerMap;
}

function fileNodeLine(filePath: string, secFiles: Set<string>, circFiles: Set<string>): string {
  const id = sanitizeId(filePath);
  const lbl = sanitizeLabel(filePath);
  if (secFiles.has(filePath)) return `    ${id}["🔴 ${lbl}"]`;
  if (circFiles.has(filePath)) return `    ${id}["🟡 ${lbl}"]`;
  return `    ${id}["${lbl}"]`;
}

export function generateMermaid(data: AnalysisResult, maxNodes: number): string {
  const conns = data.connections as any[];
  const fanInMap = buildFanInMap(conns);
  const sorted = [...data.files].sort((a, b) => (fanInMap.get(b.path) ?? 0) - (fanInMap.get(a.path) ?? 0));
  const included = new Set(sorted.slice(0, maxNodes).map(f => f.path));
  const layerMap = groupByLayer(data.files, included);
  const secFiles = new Set((data.security ?? []).map((s: any) => s.file).filter(Boolean));
  const circFiles = new Set((data.patterns ?? []).filter((p: any) => p.type === 'circular').flatMap((p: any) => p.files ?? []));

  const lines = ['graph LR'];
  for (const [layer, files] of layerMap) {
    lines.push(`  subgraph ${layer}`);
    for (const f of files) lines.push(fileNodeLine(f.path, secFiles, circFiles));
    lines.push('  end');
  }
  lines.push('');
  for (const c of conns) {
    const from = c.from ?? c.source;
    const to = c.to ?? c.target;
    if (included.has(from) && included.has(to)) lines.push(`  ${sanitizeId(from)} --> ${sanitizeId(to)}`);
  }
  return lines.join('\n');
}
