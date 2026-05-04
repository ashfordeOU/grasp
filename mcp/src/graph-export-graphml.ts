// GraphML exporter — http://graphml.graphdrawing.org/

import type { AnalysisResult } from './types.js';
import { xmlEscape, basename } from './graph-export-shared.js';

export function exportGraphML(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<graphml xmlns="http://graphml.graphdrawing.org/xmlns">');
  lines.push('  <key id="d_label" for="node" attr.name="label" attr.type="string"/>');
  lines.push('  <key id="d_layer" for="node" attr.name="layer" attr.type="string"/>');
  lines.push('  <key id="d_lang" for="node" attr.name="language" attr.type="string"/>');
  lines.push('  <key id="d_lines" for="node" attr.name="lines" attr.type="int"/>');
  lines.push('  <key id="d_etype" for="edge" attr.name="edgeType" attr.type="string"/>');
  lines.push('  <graph id="G" edgedefault="directed">');

  for (const f of result.files) {
    const lang = f.path.includes('.') ? f.path.split('.').pop() ?? '' : '';
    lines.push(`    <node id="${xmlEscape(f.path)}">`);
    lines.push(`      <data key="d_label">${xmlEscape(basename(f.path))}</data>`);
    lines.push(`      <data key="d_layer">${xmlEscape(f.layer ?? '')}</data>`);
    lines.push(`      <data key="d_lang">${xmlEscape(lang)}</data>`);
    lines.push(`      <data key="d_lines">${f.lines ?? 0}</data>`);
    lines.push('    </node>');
  }

  let edgeCount = 0;
  for (const c of result.connections) {
    lines.push(
      `    <edge id="e${edgeCount++}" source="${xmlEscape(c.source)}" target="${xmlEscape(c.target)}">`,
    );
    lines.push('      <data key="d_etype">imports</data>');
    lines.push('    </edge>');
  }

  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n');
}
