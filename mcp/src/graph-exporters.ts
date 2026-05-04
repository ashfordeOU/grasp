// =====================================================================
// Public barrel for graph exporters. Each format lives in its own file
// (graph-export-*.ts) so per-file complexity stays below the critical
// threshold; shared helpers live in graph-export-shared.ts.
// Used by the grasp_export_* MCP tools and the browser Export menu.
// Supported: GraphML, Cypher, Obsidian Canvas, DOT/Graphviz, Mermaid,
// D2, PlantUML, DGML (Visual Studio), GEXF (Gephi), draw.io, CSV.
// =====================================================================

import type { AnalysisResult } from './types.js';
import { generateMermaid } from './diagram-mermaid.js';

// Re-export Mermaid as a graph exporter so the browser Export menu can call it
// alongside the other graph formats with a uniform signature.
export function exportMermaid(result: AnalysisResult, opts: { maxNodes?: number } = {}): string {
  return generateMermaid(result, opts.maxNodes ?? 200);
}

export { exportGraphML } from './graph-export-graphml.js';
export { exportCypher } from './graph-export-cypher.js';
export { exportObsidianCanvas } from './graph-export-obsidian.js';
export { exportDot } from './graph-export-dot.js';
export { exportD2 } from './graph-export-d2.js';
export { exportPlantUml } from './graph-export-plantuml.js';
export { exportDgml } from './graph-export-dgml.js';
export { exportGexf } from './graph-export-gexf.js';
export { exportDrawio } from './graph-export-drawio.js';
export { exportCsv, exportCsvBundle } from './graph-export-csv.js';
