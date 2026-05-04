// =====================================================================
// Shared helpers for graph exporters. Each export format lives in its
// own file (graph-export-*.ts) and pulls escaping, palette, and
// node-selection utilities from here so per-file complexity stays low.
// =====================================================================

import type { AnalysisResult } from './types.js';

// ── String escaping ───────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}

// Strip everything that isn't ASCII alphanumeric — produces XML-name-safe
// and PlantUML-class-safe identifiers from arbitrary file paths.
export function sanitizeId(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '_');
}

export function basename(p: string): string {
  const ix = p.lastIndexOf('/');
  return ix < 0 ? p : p.slice(ix + 1);
}

// ── Layer palette ─────────────────────────────────────────────────────
// Same palette the browser theme uses: ui=cyan, services=blue, data=green,
// utils=yellow, config=purple, other=gray. Hex values match Nord-ish tones.
// Reused by DOT, DGML, draw.io, and D2 exporters.

export const LAYER_COLORS: Record<string, string> = {
  ui: '#88c0d0',
  services: '#5e81ac',
  data: '#a3be8c',
  utils: '#ebcb8b',
  config: '#b48ead',
  other: '#d8dee9',
};

export function colorForLayer(layer: string | undefined | null): string {
  const key = (layer ?? 'other').toLowerCase();
  return LAYER_COLORS[key] ?? LAYER_COLORS.other;
}

// ── Node selection / grouping / edge aggregation ──────────────────────

// Compute fan-in + fan-out for each file to support most-connected-first capping.
function nodeDegrees(result: AnalysisResult): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of result.files) m.set(f.path, 0);
  for (const c of result.connections) {
    m.set(c.source, (m.get(c.source) ?? 0) + 1);
    m.set(c.target, (m.get(c.target) ?? 0) + 1);
  }
  return m;
}

// Pick the top-N most-connected files; preserves insertion order for ties.
export function topNFiles(result: AnalysisResult, maxNodes: number): {
  files: AnalysisResult['files'];
  included: Set<string>;
} {
  const deg = nodeDegrees(result);
  const sorted = [...result.files].sort(
    (a, b) => (deg.get(b.path) ?? 0) - (deg.get(a.path) ?? 0),
  );
  const slice = sorted.slice(0, maxNodes);
  return { files: slice, included: new Set(slice.map(f => f.path)) };
}

// Group files by layer and return [layer, files[]] in deterministic order.
export function groupByLayer(files: AnalysisResult['files']): Array<[string, AnalysisResult['files']]> {
  const map = new Map<string, AnalysisResult['files']>();
  for (const f of files) {
    const k = f.layer || 'other';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(f);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Aggregate edges between (source,target) pairs into a count.
// Uses \x01 as a key separator so paths containing any printable char
// can never collide (paths in code never contain SOH).
export function aggregateEdges(
  result: AnalysisResult,
  included: Set<string>,
): Array<{ source: string; target: string; count: number }> {
  const counts = new Map<string, { source: string; target: string; count: number }>();
  for (const c of result.connections) {
    if (!included.has(c.source) || !included.has(c.target)) continue;
    const key = c.source + '\x01' + c.target;
    const cur = counts.get(key);
    if (cur) cur.count += c.count ?? 1;
    else counts.set(key, { source: c.source, target: c.target, count: c.count ?? 1 });
  }
  return [...counts.values()];
}

// Compute fan-in / fan-out from raw connections (no degree cap).
export function buildFanMaps(
  result: AnalysisResult,
): { fanIn: Map<string, number>; fanOut: Map<string, number> } {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const c of result.connections) {
    fanOut.set(c.source, (fanOut.get(c.source) ?? 0) + 1);
    fanIn.set(c.target, (fanIn.get(c.target) ?? 0) + 1);
  }
  return { fanIn, fanOut };
}
