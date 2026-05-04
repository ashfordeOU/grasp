// Obsidian Canvas (.canvas) exporter — JSON document with layered columns.

import type { AnalysisResult } from './types.js';

interface CanvasNode {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
}

interface CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function exportObsidianCanvas(result: AnalysisResult): string {
  // Group files by layer so each layer becomes a column.
  const layerGroups = new Map<string, typeof result.files>();
  for (const f of result.files) {
    const k = f.layer || 'unknown';
    if (!layerGroups.has(k)) layerGroups.set(k, []);
    layerGroups.get(k)!.push(f);
  }
  const layers = [...layerGroups.keys()].sort();

  const COL_WIDTH = 350;
  const ROW_HEIGHT = 80;
  const NODE_W = 250;
  const NODE_H = 60;

  // Stable per-file node id (use path as id is fine for Obsidian).
  const nodes: CanvasNode[] = [];
  const idByPath = new Map<string, string>();

  layers.forEach((layer, colIdx) => {
    const layerFiles = layerGroups.get(layer) ?? [];
    layerFiles.forEach((f, rowIdx) => {
      const id = `n_${nodes.length}`;
      idByPath.set(f.path, id);
      const colour = String(((colIdx % 6) + 1)); // 1..6
      nodes.push({
        id,
        type: 'text',
        text: `${f.path}\nlayer: ${layer}`,
        x: colIdx * COL_WIDTH,
        y: rowIdx * ROW_HEIGHT,
        width: NODE_W,
        height: NODE_H,
        color: colour,
      });
    });
  });

  const edges: CanvasEdge[] = [];
  let ei = 0;
  for (const c of result.connections) {
    const from = idByPath.get(c.source);
    const to = idByPath.get(c.target);
    if (!from || !to) continue;
    edges.push({ id: `e_${ei++}`, fromNode: from, toNode: to });
  }

  const doc: CanvasDoc = { nodes, edges };
  return JSON.stringify(doc, null, 2);
}
