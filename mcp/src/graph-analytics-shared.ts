// Shared helpers for the graph-analytics primitives. Extracted out of
// graph-analytics.ts so each individual analytic lives in its own focused
// file (the original 562-line graph-analytics.ts had cyclomatic 98, which
// Grasp itself flagged as "1 High Complexity File").

import type { AnalysisResult } from './types.js';

export function fileLayer(result: AnalysisResult, filePath: string): string {
  const f = result.files.find(x => x.path === filePath);
  return f?.layer ?? 'unknown';
}

export function buildAdjacency(result: AnalysisResult): Map<string, Set<string>> {
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

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|__mocks__|fixtures?|spec|specs|cypress|e2e)(\/|$)/i;
const TEST_FILE_RE = /\.(test|spec)\.[a-zA-Z0-9]+$/i;
const TEST_PREFIX_RE = /(^|\/)test_[^/]+$/i;
const TEST_SUFFIX_RE = /_test\.[a-zA-Z0-9]+$/i;

export function isTestFile(p: string): boolean {
  return TEST_PATH_RE.test(p) || TEST_FILE_RE.test(p) || TEST_PREFIX_RE.test(p) || TEST_SUFFIX_RE.test(p);
}

export function fileStem(p: string): string {
  const base = p.split('/').pop() ?? p;
  return base.replace(/\.[^.]+$/, '');
}
