// Surprising connections — rare cross-layer edges flagged by frequency-
// weighted rarity. Likely architecture violations.

import type { AnalysisResult } from './types.js';

export interface SurprisingRow {
  source: string;
  source_layer: string;
  target: string;
  target_layer: string;
  rarity_pct: number;
  pair_count: number;
}

export interface SurprisingConnectionsReport {
  markdown: string;
  rows: SurprisingRow[];
  total_cross_layer_edges: number;
}

export function surprisingConnections(result: AnalysisResult, max = 20): SurprisingConnectionsReport {
  const layerByPath = new Map<string, string>();
  for (const f of result.files) layerByPath.set(f.path, f.layer ?? 'unknown');

  const pairCount = new Map<string, number>();
  const crossEdges: Array<{ src: string; tgt: string; sl: string; tl: string }> = [];
  for (const c of result.connections ?? []) {
    if (!c.source || !c.target || c.source === c.target) continue;
    const sl = layerByPath.get(c.source) ?? 'unknown';
    const tl = layerByPath.get(c.target) ?? 'unknown';
    if (sl === tl) continue;
    const key = `${sl}→${tl}`;
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    crossEdges.push({ src: c.source, tgt: c.target, sl, tl });
  }
  const total = crossEdges.length;

  // Compute rarity per edge (deduped by source|target so we don't list the
  // same file pair more than once even if multiple functions cross between).
  const seen = new Set<string>();
  const rows: SurprisingRow[] = [];
  for (const e of crossEdges) {
    const dedupKey = `${e.src}|${e.tgt}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const key = `${e.sl}→${e.tl}`;
    const cnt = pairCount.get(key) ?? 0;
    const rarity = total > 0 ? 1 - cnt / total : 0;
    rows.push({
      source: e.src,
      source_layer: e.sl,
      target: e.tgt,
      target_layer: e.tl,
      rarity_pct: Math.round(rarity * 1000) / 10,
      pair_count: cnt,
    });
  }
  rows.sort((a, b) => b.rarity_pct - a.rarity_pct || a.pair_count - b.pair_count);
  const trimmed = rows.slice(0, Math.max(1, max));

  const lines: string[] = [];
  lines.push(`# Surprising connections — rare cross-layer edges (top ${trimmed.length})\n`);
  lines.push(`Cross-layer dependencies whose layer-pair is uncommon overall. These are the edges most likely to violate intended architecture.\n`);
  lines.push(`| Source | Source layer | Target | Target layer | rarity % |`);
  lines.push(`|--------|--------------|--------|--------------|---------:|`);
  for (const r of trimmed) {
    lines.push(`| \`${r.source}\` | ${r.source_layer} | \`${r.target}\` | ${r.target_layer} | ${r.rarity_pct.toFixed(1)} |`);
  }
  if (trimmed.length === 0) lines.push(`\n_No cross-layer edges in this session._`);

  return { markdown: lines.join('\n'), rows: trimmed, total_cross_layer_edges: total };
}
