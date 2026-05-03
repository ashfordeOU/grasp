// =====================================================================
// graph-analytics.ts — pure analytics over AnalysisResult
//
// Five graph-analytics primitives that compute over `result.files` and
// `result.connections` without touching Kuzu. Each returns a markdown
// report + structured payload, ready to be wrapped by an MCP tool.
// =====================================================================

import type { AnalysisResult } from './types.js';

// ── shared helpers ────────────────────────────────────────────────────

interface FilePathLayer {
  path: string;
  layer: string;
}

function fileLayer(result: AnalysisResult, filePath: string): string {
  const f = result.files.find(x => x.path === filePath);
  return f?.layer ?? 'unknown';
}

function buildAdjacency(result: AnalysisResult): Map<string, Set<string>> {
  // file → set of files it directly calls into (out-neighbours)
  const adj = new Map<string, Set<string>>();
  for (const c of result.connections ?? []) {
    if (!c.source || !c.target || c.source === c.target) continue;
    if (!adj.has(c.source)) adj.set(c.source, new Set());
    adj.get(c.source)!.add(c.target);
    // make sure the target is also a node, even if it has no outgoing edges
    if (!adj.has(c.target)) adj.set(c.target, new Set());
  }
  return adj;
}

// ── 1. hub nodes — degree centrality ──────────────────────────────────

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

// ── 2. bridge nodes — Brandes betweenness centrality ──────────────────

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

/**
 * Brandes algorithm for betweenness centrality on a directed graph.
 * Normalised by (n-1)*(n-2)/2 — same convention as networkx (undirected
 * normalisation; for directed we use (n-1)*(n-2)).
 *
 * For graphs with > 500 nodes we sample 100 random source nodes and scale
 * the result by node_count / sample_size.
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

  const SAMPLE_THRESHOLD = 500;
  const sampled = n > SAMPLE_THRESHOLD;
  const SAMPLE_SIZE = 100;

  let sources = nodes;
  if (sampled) {
    // Deterministic-ish: shuffle by seeded sort
    const shuffled = [...nodes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    sources = shuffled.slice(0, SAMPLE_SIZE);
  }

  const cb = new Map<string, number>(nodes.map(v => [v, 0]));

  for (const s of sources) {
    // Brandes single-source shortest paths (unweighted → BFS)
    const stack: string[] = [];
    const pred = new Map<string, string[]>(nodes.map(v => [v, []]));
    const sigma = new Map<string, number>(nodes.map(v => [v, 0]));
    sigma.set(s, 1);
    const dist = new Map<string, number>(nodes.map(v => [v, -1]));
    dist.set(s, 0);

    const queue: string[] = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const neighbours = adj.get(v);
      if (!neighbours) continue;
      for (const w of neighbours) {
        if (dist.get(w)! < 0) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    // Accumulation
    const delta = new Map<string, number>(nodes.map(v => [v, 0]));
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const ratio = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + ratio);
      }
      if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
    }
  }

  // Scale-up sampled estimate to full-graph approximation
  if (sampled && sources.length > 0) {
    const scale = n / sources.length;
    for (const [k, v] of cb) cb.set(k, v * scale);
  }

  // Normalise. For directed graph: divide by (n-1)*(n-2).
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

  return {
    markdown: lines.join('\n'),
    rows: trimmed,
    sampled,
    sample_size: sources.length,
    node_count: n,
  };
}

// ── 3. surprising connections — cross-cluster coupling ───────────────

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

  // Count cross-layer edge frequencies
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
      rarity_pct: Math.round(rarity * 1000) / 10, // one decimal
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

// ── 4. knowledge gaps ────────────────────────────────────────────────

export interface KnowledgeGapsReport {
  markdown: string;
  isolated_files: string[];
  untested_hotspots: Array<{ file: string; fan_in: number }>;
  weak_communities: Array<{ layer: string; file_count: number; outgoing_edges: number }>;
}

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|__mocks__|fixtures?|spec|specs|cypress|e2e)(\/|$)/i;
const TEST_FILE_RE = /\.(test|spec)\.[a-zA-Z0-9]+$/i;
const TEST_PREFIX_RE = /(^|\/)test_[^/]+$/i;
const TEST_SUFFIX_RE = /_test\.[a-zA-Z0-9]+$/i;

function isTestFile(p: string): boolean {
  return TEST_PATH_RE.test(p) || TEST_FILE_RE.test(p) || TEST_PREFIX_RE.test(p) || TEST_SUFFIX_RE.test(p);
}

function fileStem(p: string): string {
  const base = p.split('/').pop() ?? p;
  return base.replace(/\.[^.]+$/, '');
}

export function knowledgeGaps(result: AnalysisResult): KnowledgeGapsReport {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const c of result.connections ?? []) {
    if (!c.source || !c.target) continue;
    fanOut.set(c.source, (fanOut.get(c.source) ?? 0) + 1);
    fanIn.set(c.target, (fanIn.get(c.target) ?? 0) + 1);
  }

  // Isolated files: code, not test, no in or out
  const isolated: string[] = [];
  for (const f of result.files) {
    if (!f.isCode) continue;
    if (isTestFile(f.path)) continue;
    if ((fanIn.get(f.path) ?? 0) === 0 && (fanOut.get(f.path) ?? 0) === 0) {
      isolated.push(f.path);
    }
  }

  // Untested hotspots: high fan-in non-test files whose stem appears in no test path
  const testFiles = result.files.filter(f => isTestFile(f.path));
  const testPathsLower = testFiles.map(t => t.path.toLowerCase());
  const untested: Array<{ file: string; fan_in: number }> = [];
  for (const f of result.files) {
    if (!f.isCode) continue;
    if (isTestFile(f.path)) continue;
    const fi = fanIn.get(f.path) ?? 0;
    if (fi <= 5) continue;
    const stem = fileStem(f.path).toLowerCase();
    if (!stem || stem.length < 2) continue;
    const isTested = testPathsLower.some(tp => tp.includes(stem));
    if (!isTested) untested.push({ file: f.path, fan_in: fi });
  }
  untested.sort((a, b) => b.fan_in - a.fan_in);

  // Weak communities: layers with < 3 files but > 5 outgoing edges
  const layerFiles = new Map<string, Set<string>>();
  for (const f of result.files) {
    const l = f.layer ?? 'unknown';
    if (!layerFiles.has(l)) layerFiles.set(l, new Set());
    layerFiles.get(l)!.add(f.path);
  }
  const layerOut = new Map<string, number>();
  const layerByPath = new Map<string, string>();
  for (const f of result.files) layerByPath.set(f.path, f.layer ?? 'unknown');
  for (const c of result.connections ?? []) {
    const sl = layerByPath.get(c.source) ?? 'unknown';
    const tl = layerByPath.get(c.target) ?? 'unknown';
    if (sl !== tl) layerOut.set(sl, (layerOut.get(sl) ?? 0) + 1);
  }
  const weak: Array<{ layer: string; file_count: number; outgoing_edges: number }> = [];
  for (const [layer, files] of layerFiles) {
    const out = layerOut.get(layer) ?? 0;
    if (files.size < 3 && out > 5) {
      weak.push({ layer, file_count: files.size, outgoing_edges: out });
    }
  }
  weak.sort((a, b) => b.outgoing_edges - a.outgoing_edges);

  // Build markdown
  const lines: string[] = [];
  lines.push(`# Knowledge gaps\n`);

  lines.push(`## Isolated files (${isolated.length})\n`);
  lines.push(`Code files with no callers and no callees — likely dead code, demo scripts, or undocumented utilities.\n`);
  if (isolated.length === 0) {
    lines.push(`_None._\n`);
  } else {
    for (const p of isolated.slice(0, 20)) lines.push(`- \`${p}\``);
    if (isolated.length > 20) lines.push(`- _…and ${isolated.length - 20} more_`);
    lines.push('');
  }

  lines.push(`## Untested hotspots (${untested.length})\n`);
  lines.push(`Files with > 5 dependents but no matching test file. Each is a high-impact candidate for new tests.\n`);
  if (untested.length === 0) {
    lines.push(`_None._\n`);
  } else {
    lines.push(`| File | dependents |`);
    lines.push(`|------|-----------:|`);
    for (const u of untested.slice(0, 20)) lines.push(`| \`${u.file}\` | ${u.fan_in} |`);
    if (untested.length > 20) lines.push(`| _…and ${untested.length - 20} more_ | |`);
    lines.push('');
  }

  lines.push(`## Weak communities (${weak.length})\n`);
  lines.push(`Layers with fewer than 3 files but more than 5 outgoing cross-layer edges — small modules that are heavily depended on (or that reach across many other layers).\n`);
  if (weak.length === 0) {
    lines.push(`_None._\n`);
  } else {
    lines.push(`| Layer | files | outgoing edges |`);
    lines.push(`|-------|------:|---------------:|`);
    for (const w of weak) lines.push(`| ${w.layer} | ${w.file_count} | ${w.outgoing_edges} |`);
    lines.push('');
  }

  return {
    markdown: lines.join('\n'),
    isolated_files: isolated,
    untested_hotspots: untested,
    weak_communities: weak,
  };
}

// ── 5. suggested questions ───────────────────────────────────────────

export interface SuggestedQuestion {
  question: string;
  why: string;
  category: 'hub' | 'bridge' | 'surprising' | 'gap' | 'circular' | 'duplicate' | 'general';
}

export interface SuggestedQuestionsReport {
  markdown: string;
  questions: SuggestedQuestion[];
}

export function suggestedQuestions(result: AnalysisResult): SuggestedQuestionsReport {
  const questions: SuggestedQuestion[] = [];

  // Hub
  const hubs = hubNodes(result, 3).rows;
  if (hubs.length > 0) {
    const top = hubs[0];
    questions.push({
      question: `Why does \`${top.file}\` have ${top.total} total connections (fan-in ${top.fan_in}, fan-out ${top.fan_out})? Is it the right abstraction level, or has it become a god-object?`,
      why: `It is the most-connected node in the codebase; changes here ripple the widest.`,
      category: 'hub',
    });
  }

  // Bridge
  const bridges = bridgeNodes(result, 3).rows;
  if (bridges.length > 0) {
    const top = bridges[0];
    questions.push({
      question: `Why does \`${top.file}\` sit on the critical path between so many components (betweenness ${top.betweenness.toFixed(4)})?`,
      why: `Bridge nodes are chokepoints — outage or breaking change here splits the codebase in two.`,
      category: 'bridge',
    });
  }

  // Surprising connection
  const surp = surprisingConnections(result, 3).rows;
  if (surp.length > 0) {
    const top = surp[0];
    questions.push({
      question: `Why does the \`${top.source_layer}\` layer (\`${top.source}\`) call into the \`${top.target_layer}\` layer (\`${top.target}\`) directly? Is this an intentional shortcut?`,
      why: `This layer-pair appears in only ${(100 - top.rarity_pct).toFixed(1)}% of cross-layer edges, suggesting it might be an architectural anomaly.`,
      category: 'surprising',
    });
  }

  // Knowledge gap — untested hotspot
  const gaps = knowledgeGaps(result);
  if (gaps.untested_hotspots.length > 0) {
    const top = gaps.untested_hotspots[0];
    questions.push({
      question: `Why does \`${top.file}\` have no tests despite ${top.fan_in} files depending on it?`,
      why: `Untested hotspots carry the highest defect risk — a regression here breaks ${top.fan_in} other files.`,
      category: 'gap',
    });
  }
  if (gaps.isolated_files.length > 0) {
    questions.push({
      question: `Are the ${gaps.isolated_files.length} isolated file(s) (e.g. \`${gaps.isolated_files[0]}\`) dead code, demos, or hidden APIs? Can they be removed?`,
      why: `Isolated files have no callers and no callees — they are either dead, examples, or have undeclared usage (reflection, dynamic imports).`,
      category: 'gap',
    });
  }

  // Circular deps (from existing analysis)
  const circulars = (result.issues ?? []).filter(i =>
    i.title.toLowerCase().includes('circular') || i.type === 'critical' && /circ/i.test(i.title)
  );
  if (circulars.length > 0 && (circulars[0].items?.length ?? 0) > 0) {
    const item = circulars[0].items[0];
    questions.push({
      question: `Should the circular dependency in \`${item.file ?? item.name}\` be broken? What is the right way to invert it?`,
      why: `Circular deps prevent independent reasoning, testing, and packaging — they are the canonical refactor target.`,
      category: 'circular',
    });
  } else if ((result.summary?.circularDepCount ?? 0) > 0) {
    questions.push({
      question: `Why does the codebase have ${result.summary.circularDepCount} circular dependencies? Which is the easiest to break?`,
      why: `Each circular cluster is a refactor candidate; sorting by smallest cluster gives the cheapest win.`,
      category: 'circular',
    });
  }

  // Duplicates
  if ((result.duplicates?.length ?? 0) > 0) {
    const top = result.duplicates![0];
    const fileList = top.files.slice(0, 3).map(f => `\`${f.file}\``).join(', ');
    questions.push({
      question: `Are the ${top.count} copies of \`${top.name}\` (in ${fileList}) intentional, or should they be extracted into a shared module?`,
      why: `Duplicates increase change-amplification cost — fixing a bug means N edits instead of one.`,
      category: 'duplicate',
    });
  }

  // Surprising bonus + weak community
  if (gaps.weak_communities.length > 0) {
    const top = gaps.weak_communities[0];
    questions.push({
      question: `The \`${top.layer}\` layer has only ${top.file_count} file(s) but ${top.outgoing_edges} outgoing edges. Is it a thin wrapper that should be merged, or a real cross-cutting concern?`,
      why: `Tiny layers with high coupling are usually either over-engineered or under-developed; both deserve a second look.`,
      category: 'gap',
    });
  }

  // Layer violations
  if ((result.layerViolations?.length ?? 0) > 0) {
    const v = result.layerViolations![0];
    questions.push({
      question: `Why does \`${v.from}\` (${v.fromLayer}) violate the layering rule by calling \`${v.to}\` (${v.toLayer}) via \`${v.fn}\`?`,
      why: `Layer violations erode architecture intent over time; each one normalises the next.`,
      category: 'surprising',
    });
  }

  // Health-score nudge as fallback
  if (questions.length < 5 && result.summary) {
    questions.push({
      question: `The repo has a health score of ${result.summary.healthScore}/100 (grade ${result.summary.healthGrade}). What are the three highest-impact fixes the team could ship this sprint?`,
      why: `A concrete, time-boxed prioritisation forces the team to convert metrics into action.`,
      category: 'general',
    });
  }

  // Cap at 10
  const capped = questions.slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Suggested review questions\n`);
  lines.push(`Auto-generated from this session's hubs, bridges, layer crossings, gaps, circular deps, and duplicates. Use them as the opening agenda for the next architecture review.\n`);
  capped.forEach((q, i) => {
    lines.push(`${i + 1}. **${q.question}**`);
    lines.push(`   _${q.why}_\n`);
  });
  if (capped.length === 0) {
    lines.push(`_No notable findings — the codebase looks healthy from this analysis._`);
  }

  return { markdown: lines.join('\n'), questions: capped };
}
