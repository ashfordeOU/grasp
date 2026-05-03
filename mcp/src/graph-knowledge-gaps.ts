// Knowledge gaps — isolated files, untested hotspots, weak communities.

import type { AnalysisResult } from './types.js';
import { fileStem, isTestFile } from './graph-analytics-shared.js';
import { renderKnowledgeGapsMarkdown } from './graph-knowledge-gaps-render.js';

export interface KnowledgeGapsReport {
  markdown: string;
  isolated_files: string[];
  untested_hotspots: Array<{ file: string; fan_in: number }>;
  weak_communities: Array<{ layer: string; file_count: number; outgoing_edges: number }>;
}

interface FanCounts {
  fanIn: Map<string, number>;
  fanOut: Map<string, number>;
}

function computeFanCounts(result: AnalysisResult): FanCounts {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const c of result.connections ?? []) {
    if (!c.source || !c.target) continue;
    fanOut.set(c.source, (fanOut.get(c.source) ?? 0) + 1);
    fanIn.set(c.target, (fanIn.get(c.target) ?? 0) + 1);
  }
  return { fanIn, fanOut };
}

function computeIsolated(result: AnalysisResult, fan: FanCounts): string[] {
  const isolated: string[] = [];
  for (const f of result.files) {
    if (!f.isCode) continue;
    if (isTestFile(f.path)) continue;
    if ((fan.fanIn.get(f.path) ?? 0) === 0 && (fan.fanOut.get(f.path) ?? 0) === 0) {
      isolated.push(f.path);
    }
  }
  return isolated;
}

function computeUntested(result: AnalysisResult, fan: FanCounts): Array<{ file: string; fan_in: number }> {
  const testFiles = result.files.filter(f => isTestFile(f.path));
  const testPathsLower = testFiles.map(t => t.path.toLowerCase());
  const untested: Array<{ file: string; fan_in: number }> = [];
  for (const f of result.files) {
    if (!f.isCode) continue;
    if (isTestFile(f.path)) continue;
    const fi = fan.fanIn.get(f.path) ?? 0;
    if (fi <= 5) continue;
    const stem = fileStem(f.path).toLowerCase();
    if (!stem || stem.length < 2) continue;
    const isTested = testPathsLower.some(tp => tp.includes(stem));
    if (!isTested) untested.push({ file: f.path, fan_in: fi });
  }
  untested.sort((a, b) => b.fan_in - a.fan_in);
  return untested;
}

function computeWeakCommunities(result: AnalysisResult): Array<{ layer: string; file_count: number; outgoing_edges: number }> {
  const layerFiles = new Map<string, Set<string>>();
  for (const f of result.files) {
    const l = f.layer ?? 'unknown';
    if (!layerFiles.has(l)) layerFiles.set(l, new Set());
    layerFiles.get(l)!.add(f.path);
  }
  const layerByPath = new Map<string, string>();
  for (const f of result.files) layerByPath.set(f.path, f.layer ?? 'unknown');
  const layerOut = new Map<string, number>();
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
  return weak;
}

export function knowledgeGaps(result: AnalysisResult): KnowledgeGapsReport {
  const fan = computeFanCounts(result);
  const isolated = computeIsolated(result, fan);
  const untested = computeUntested(result, fan);
  const weak = computeWeakCommunities(result);
  return {
    markdown: renderKnowledgeGapsMarkdown(isolated, untested, weak),
    isolated_files: isolated,
    untested_hotspots: untested,
    weak_communities: weak,
  };
}
