// D2 (Terrastruct) exporter — direction:right, layer containers + file leaves.

import type { AnalysisResult } from './types.js';
import {
  basename,
  colorForLayer,
  topNFiles,
  groupByLayer,
  aggregateEdges,
} from './graph-export-shared.js';

function d2QuoteIfNeeded(s: string): string {
  // D2 IDs can contain almost anything as long as they're quoted with double
  // quotes when they include slashes, dots, or whitespace.
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function exportD2(result: AnalysisResult, opts: { maxNodes?: number } = {}): string {
  const maxNodes = Math.max(1, opts.maxNodes ?? 200);
  const { files, included } = topNFiles(result, maxNodes);
  const layers = groupByLayer(files);
  const edges = aggregateEdges(result, included);

  const lines: string[] = [];
  lines.push('direction: right');
  lines.push('');

  // Each layer becomes a container; each file is a child shape inside.
  // We use the file's full path as the leaf id so cross-references work.
  const idForPath = new Map<string, string>();

  for (const [layer, layerFiles] of layers) {
    const layerId = d2QuoteIfNeeded(layer);
    lines.push(`${layerId}: {`);
    lines.push(`  shape: rectangle`);
    lines.push(`  style: { fill: "${colorForLayer(layer)}" }`);
    for (const f of layerFiles) {
      const leaf = d2QuoteIfNeeded(basename(f.path));
      lines.push(`  ${leaf}`);
      idForPath.set(f.path, `${layerId}.${leaf}`);
    }
    lines.push('}');
  }

  // Edges may collide on duplicate (layer.basename) leaf ids in different layers
  // — that's fine because the layer prefix disambiguates. If two files share
  // the same basename within a single layer, the second one overwrites the
  // first and we silently drop the duplicate edge — acceptable for export.
  for (const e of edges) {
    const src = idForPath.get(e.source);
    const tgt = idForPath.get(e.target);
    if (!src || !tgt) continue;
    const lbl = e.count > 1 ? `: imports (${e.count})` : `: imports`;
    lines.push(`${src} -> ${tgt}${lbl}`);
  }

  return lines.join('\n');
}
