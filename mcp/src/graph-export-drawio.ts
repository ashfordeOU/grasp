// draw.io / diagrams.net XML exporter — mxfile with mxCell vertices + edges.

import type { AnalysisResult } from './types.js';
import {
  xmlEscape,
  basename,
  sanitizeId,
  colorForLayer,
  topNFiles,
  groupByLayer,
} from './graph-export-shared.js';

export function exportDrawio(result: AnalysisResult, opts: { maxNodes?: number } = {}): string {
  const maxNodes = Math.max(1, opts.maxNodes ?? 200);
  const { files, included } = topNFiles(result, maxNodes);

  // Simple grid layout: columns by layer, rows within each layer column.
  const layers = groupByLayer(files);
  const COL_WIDTH = 200;
  const ROW_HEIGHT = 60;
  const NODE_W = 160;
  const NODE_H = 40;
  const PAD_X = 40;
  const PAD_Y = 40;

  const lines: string[] = [];
  lines.push('<mxfile host="grasp.local">');
  lines.push('  <diagram id="grasp" name="Architecture">');
  lines.push(
    '    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
  );
  lines.push('      <root>');
  lines.push('        <mxCell id="0"/>');
  lines.push('        <mxCell id="1" parent="0"/>');

  layers.forEach(([layer, layerFiles], colIdx) => {
    const fill = colorForLayer(layer);
    layerFiles.forEach((f, rowIdx) => {
      const id = sanitizeId(f.path);
      const value = xmlEscape(basename(f.path));
      const x = PAD_X + colIdx * COL_WIDTH;
      const y = PAD_Y + rowIdx * ROW_HEIGHT;
      const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=#555555;`;
      lines.push(
        `        <mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1">`,
      );
      lines.push(
        `          <mxGeometry x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/>`,
      );
      lines.push('        </mxCell>');
    });
  });

  let ei = 0;
  for (const c of result.connections) {
    if (!included.has(c.source) || !included.has(c.target)) continue;
    const src = sanitizeId(c.source);
    const tgt = sanitizeId(c.target);
    lines.push(
      `        <mxCell id="e_${ei++}" style="endArrow=classic;html=1;" edge="1" source="${src}" target="${tgt}" parent="1">`,
    );
    lines.push('          <mxGeometry relative="1" as="geometry"/>');
    lines.push('        </mxCell>');
  }

  lines.push('      </root>');
  lines.push('    </mxGraphModel>');
  lines.push('  </diagram>');
  lines.push('</mxfile>');
  return lines.join('\n');
}
