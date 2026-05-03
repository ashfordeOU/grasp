// Bridge nodes — Brandes betweenness centrality over the file call graph.

import type { AnalysisResult } from './types.js';
import { buildAdjacency, fileLayer } from './graph-analytics-shared.js';

export interface BridgeRow {
  file: string;
  betweenness: number;
  layer: string;
}

export interface BridgeNodesReport {
  markdown: string;
  rows: BridgeRow[];
  sampled: boolean;
  sample_size: number;
  node_count: number;
}

const SAMPLE_THRESHOLD = 500;
const SAMPLE_SIZE = 100;

function pickSources(nodes: string[], sampled: boolean): string[] {
  if (!sampled) return nodes;
  const shuffled = [...nodes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, SAMPLE_SIZE);
}

interface BrandesState {
  stack: string[];
  pred: Map<string, string[]>;
  sigma: Map<string, number>;
  dist: Map<string, number>;
}

function bfsFromSource(adj: Map<string, Set<string>>, nodes: string[], s: string): BrandesState {
  const state: BrandesState = {
    stack: [],
    pred: new Map<string, string[]>(nodes.map(v => [v, []])),
    sigma: new Map<string, number>(nodes.map(v => [v, 0])),
    dist: new Map<string, number>(nodes.map(v => [v, -1])),
  };
  state.sigma.set(s, 1);
  state.dist.set(s, 0);
  const queue: string[] = [s];
  while (queue.length > 0) {
    const v = queue.shift()!;
    state.stack.push(v);
    const neighbours = adj.get(v);
    if (!neighbours) continue;
    for (const w of neighbours) {
      if (state.dist.get(w)! < 0) {
        queue.push(w);
        state.dist.set(w, state.dist.get(v)! + 1);
      }
      if (state.dist.get(w) === state.dist.get(v)! + 1) {
        state.sigma.set(w, state.sigma.get(w)! + state.sigma.get(v)!);
        state.pred.get(w)!.push(v);
      }
    }
  }
  return state;
}

function accumulateDelta(state: BrandesState, nodes: string[], s: string, cb: Map<string, number>): void {
  const delta = new Map<string, number>(nodes.map(v => [v, 0]));
  while (state.stack.length > 0) {
    const w = state.stack.pop()!;
    for (const v of state.pred.get(w)!) {
      const ratio = (state.sigma.get(v)! / state.sigma.get(w)!) * (1 + delta.get(w)!);
      delta.set(v, delta.get(v)! + ratio);
    }
    if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
  }
}

/**
 * Brandes algorithm for betweenness centrality on a directed graph.
 * Normalised by (n-1)*(n-2). For graphs with > 500 nodes we sample 100
 * random source nodes and rescale the result by node_count / sample_size.
 */
export function bridgeNodes(result: AnalysisResult, top = 10): BridgeNodesReport {
  const adj = buildAdjacency(result);
  const nodes = Array.from(adj.keys());
  const n = nodes.length;
  if (n < 3) {
    return {
      markdown: `# Bridge nodes — betweenness centrality\n\n_Graph has only ${n} node(s); betweenness is undefined._`,
      rows: [],
      sampled: false,
      sample_size: 0,
      node_count: n,
    };
  }

  const sampled = n > SAMPLE_THRESHOLD;
  const sources = pickSources(nodes, sampled);
  const cb = new Map<string, number>(nodes.map(v => [v, 0]));

  for (const s of sources) {
    const state = bfsFromSource(adj, nodes, s);
    accumulateDelta(state, nodes, s, cb);
  }

  if (sampled && sources.length > 0) {
    const scale = n / sources.length;
    for (const [k, v] of cb) cb.set(k, v * scale);
  }

  const normFactor = (n - 1) * (n - 2);
  const rowsAll: BridgeRow[] = [];
  for (const [file, raw] of cb) {
    const score = normFactor > 0 ? raw / normFactor : 0;
    if (score === 0) continue;
    rowsAll.push({ file, betweenness: score, layer: fileLayer(result, file) });
  }
  rowsAll.sort((a, b) => b.betweenness - a.betweenness);
  const trimmed = rowsAll.slice(0, Math.max(1, top));

  const lines: string[] = [];
  lines.push(`# Bridge nodes — Brandes betweenness centrality (top ${trimmed.length})\n`);
  if (sampled) {
    lines.push(`> Note: graph has ${n} nodes (> ${SAMPLE_THRESHOLD}); sampled ${sources.length} sources and rescaled. Scores are approximate.\n`);
  }
  lines.push(`Files ranked by their position on the critical paths between other files. A high-betweenness node is a chokepoint — changing it ripples across the codebase.\n`);
  lines.push(`| File | betweenness | layer |`);
  lines.push(`|------|------------:|-------|`);
  for (const r of trimmed) {
    lines.push(`| \`${r.file}\` | ${r.betweenness.toFixed(4)} | ${r.layer} |`);
  }
  if (trimmed.length === 0) lines.push(`\n_No bridge structure found — graph is fully connected or trivial._`);

  return { markdown: lines.join('\n'), rows: trimmed, sampled, sample_size: sources.length, node_count: n };
}
