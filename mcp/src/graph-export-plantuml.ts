// PlantUML exporter — class diagram with packages by layer.

import type { AnalysisResult } from './types.js';
import {
  basename,
  sanitizeId,
  topNFiles,
  groupByLayer,
  aggregateEdges,
} from './graph-export-shared.js';

export function exportPlantUml(result: AnalysisResult, opts: { maxNodes?: number } = {}): string {
  const maxNodes = Math.max(1, opts.maxNodes ?? 200);
  const { files, included } = topNFiles(result, maxNodes);
  const layers = groupByLayer(files);
  const edges = aggregateEdges(result, included);

  const lines: string[] = [];
  lines.push('@startuml');
  lines.push('!theme cerulean');
  lines.push('skinparam linetype ortho');
  lines.push('');

  for (const [layer, layerFiles] of layers) {
    lines.push(`package "${layer.replace(/"/g, '\\"')}" {`);
    for (const f of layerFiles) {
      const id = sanitizeId(f.path);
      const lbl = basename(f.path).replace(/"/g, '\\"');
      lines.push(`  class "${lbl}" as ${id}`);
    }
    lines.push('}');
  }
  lines.push('');

  for (const e of edges) {
    const src = sanitizeId(e.source);
    const tgt = sanitizeId(e.target);
    const lbl = e.count > 1 ? ` : imports (${e.count})` : ' : imports';
    lines.push(`${src} --> ${tgt}${lbl}`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}
