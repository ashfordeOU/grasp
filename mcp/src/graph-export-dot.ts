// DOT / Graphviz exporter — clusters by layer, labels by file basename + LOC.

import type { AnalysisResult } from './types.js';
import {
  basename,
  colorForLayer,
  topNFiles,
  groupByLayer,
  aggregateEdges,
} from './graph-export-shared.js';

function dotQuote(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function safeDotId(s: string): string {
  // Graphviz allows quoted strings as IDs, so we just quote-escape.
  return dotQuote(s);
}

export function exportDot(result: AnalysisResult, opts: { maxNodes?: number } = {}): string {
  const maxNodes = Math.max(1, opts.maxNodes ?? 200);
  const { files, included } = topNFiles(result, maxNodes);
  const layers = groupByLayer(files);
  const edges = aggregateEdges(result, included);

  const lines: string[] = [];
  lines.push('digraph G {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style="rounded,filled", fontname="Helvetica"];');
  lines.push('  edge [fontname="Helvetica", fontsize=9];');

  let clusterIdx = 0;
  for (const [layer, layerFiles] of layers) {
    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label=${dotQuote(layer)};`);
    lines.push(`    style="rounded,dashed";`);
    lines.push(`    color="#999999";`);
    const fill = colorForLayer(layer);
    for (const f of layerFiles) {
      const lbl = `${basename(f.path)}\\n(${f.lines ?? 0} LOC)`;
      lines.push(`    ${safeDotId(f.path)} [label=${dotQuote(lbl)}, fillcolor=${dotQuote(fill)}];`);
    }
    lines.push('  }');
  }

  for (const e of edges) {
    const lbl = e.count > 1 ? ` [label=${dotQuote(String(e.count))}]` : '';
    lines.push(`  ${safeDotId(e.source)} -> ${safeDotId(e.target)}${lbl};`);
  }

  lines.push('}');
  return lines.join('\n');
}
