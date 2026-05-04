// DGML exporter — Visual Studio Directed Graph Markup Language.

import type { AnalysisResult } from './types.js';
import { xmlEscape, basename, colorForLayer } from './graph-export-shared.js';

export function exportDgml(result: AnalysisResult): string {
  const layersSeen = new Set<string>();
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<DirectedGraph xmlns="http://schemas.microsoft.com/vs/2009/dgml">');
  lines.push('  <Nodes>');
  for (const f of result.files) {
    const layer = f.layer || 'other';
    layersSeen.add(layer);
    const id = xmlEscape(f.path);
    const label = xmlEscape(basename(f.path));
    const cat = xmlEscape(layer);
    lines.push(`    <Node Id="${id}" Label="${label}" Category="${cat}" />`);
  }
  lines.push('  </Nodes>');
  lines.push('  <Links>');
  for (const c of result.connections) {
    const src = xmlEscape(c.source);
    const tgt = xmlEscape(c.target);
    lines.push(`    <Link Source="${src}" Target="${tgt}" Category="imports" />`);
  }
  lines.push('  </Links>');
  lines.push('  <Categories>');
  for (const layer of [...layersSeen].sort()) {
    lines.push(
      `    <Category Id="${xmlEscape(layer)}" Background="${colorForLayer(layer)}" />`,
    );
  }
  lines.push('    <Category Id="imports" Label="imports" />');
  lines.push('  </Categories>');
  lines.push('</DirectedGraph>');
  return lines.join('\n');
}
