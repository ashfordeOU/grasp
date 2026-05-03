// Hub nodes — degree centrality (fan-in + fan-out) over the file graph.

import type { AnalysisResult } from './types.js';
import { fileLayer } from './graph-analytics-shared.js';

export interface HubRow {
  file: string;
  fan_in: number;
  fan_out: number;
  total: number;
  layer: string;
}

export interface HubNodesReport {
  markdown: string;
  rows: HubRow[];
  total_files: number;
}

export function hubNodes(result: AnalysisResult, top = 10): HubNodesReport {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const c of result.connections ?? []) {
    if (!c.source || !c.target) continue;
    fanOut.set(c.source, (fanOut.get(c.source) ?? 0) + 1);
    fanIn.set(c.target, (fanIn.get(c.target) ?? 0) + 1);
  }
  const allPaths = new Set<string>([
    ...result.files.map(f => f.path),
    ...fanIn.keys(),
    ...fanOut.keys(),
  ]);
  const rows: HubRow[] = [];
  for (const p of allPaths) {
    const fi = fanIn.get(p) ?? 0;
    const fo = fanOut.get(p) ?? 0;
    const total = fi + fo;
    if (total === 0) continue;
    rows.push({ file: p, fan_in: fi, fan_out: fo, total, layer: fileLayer(result, p) });
  }
  rows.sort((a, b) => b.total - a.total || b.fan_in - a.fan_in);
  const trimmed = rows.slice(0, Math.max(1, top));

  const lines: string[] = [];
  lines.push(`# Hub nodes — degree centrality (top ${trimmed.length})\n`);
  lines.push(`Files ranked by total connectivity (fan-in + fan-out). High-rank hubs are tightly coupled to the rest of the codebase — review whether they are the right abstraction layer.\n`);
  lines.push(`| File | fan-in | fan-out | total | layer |`);
  lines.push(`|------|-------:|--------:|------:|-------|`);
  for (const r of trimmed) {
    lines.push(`| \`${r.file}\` | ${r.fan_in} | ${r.fan_out} | ${r.total} | ${r.layer} |`);
  }
  if (rows.length === 0) lines.push(`\n_No connections in this session — graph is empty._`);

  return { markdown: lines.join('\n'), rows: trimmed, total_files: rows.length };
}
