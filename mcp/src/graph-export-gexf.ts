// GEXF (Gephi native) exporter — gexf 1.3 with weighted edges.

import type { AnalysisResult } from './types.js';
import { xmlEscape, basename } from './graph-export-shared.js';

export function exportGexf(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gexf xmlns="http://www.gexf.net/1.3" version="1.3">');
  lines.push('  <graph mode="static" defaultedgetype="directed">');
  lines.push('    <attributes class="node">');
  lines.push('      <attribute id="0" title="layer" type="string"/>');
  lines.push('      <attribute id="1" title="lines" type="integer"/>');
  lines.push('      <attribute id="2" title="complexity" type="integer"/>');
  lines.push('      <attribute id="3" title="churn" type="integer"/>');
  lines.push('    </attributes>');

  lines.push('    <nodes>');
  for (const f of result.files) {
    const id = xmlEscape(f.path);
    const label = xmlEscape(basename(f.path));
    lines.push(`      <node id="${id}" label="${label}">`);
    lines.push('        <attvalues>');
    lines.push(`          <attvalue for="0" value="${xmlEscape(f.layer ?? 'other')}"/>`);
    lines.push(`          <attvalue for="1" value="${f.lines ?? 0}"/>`);
    lines.push(`          <attvalue for="2" value="${f.complexity ?? 0}"/>`);
    lines.push(`          <attvalue for="3" value="${f.churn ?? 0}"/>`);
    lines.push('        </attvalues>');
    lines.push('      </node>');
  }
  lines.push('    </nodes>');

  // Aggregate parallel edges by (source,target) and emit a weight.
  // \x01 separator avoids collisions between paths that share a prefix/suffix.
  const agg = new Map<string, { source: string; target: string; weight: number }>();
  for (const c of result.connections) {
    const k = c.source + '\x01' + c.target;
    const cur = agg.get(k);
    if (cur) cur.weight += c.count ?? 1;
    else agg.set(k, { source: c.source, target: c.target, weight: c.count ?? 1 });
  }

  lines.push('    <edges>');
  let ei = 0;
  for (const e of agg.values()) {
    lines.push(
      `      <edge id="${ei++}" source="${xmlEscape(e.source)}" target="${xmlEscape(e.target)}" weight="${e.weight}"/>`,
    );
  }
  lines.push('    </edges>');

  lines.push('  </graph>');
  lines.push('</gexf>');
  return lines.join('\n');
}
