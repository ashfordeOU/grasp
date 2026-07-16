/**
 * Export the semantic knowledge graph to portable formats.
 *
 *  - cypher   : CREATE statements loadable into Neo4j / FalkorDB
 *  - graphml  : XML for Gephi / yEd
 *  - json     : {nodes, edges} for programmatic use
 *  - mermaid  : a bounded diagram for docs
 */

import { KnowledgeGraphStore } from './kg-store.js';

export type KgExportFormat = 'cypher' | 'graphml' | 'json' | 'mermaid';

function safeVar(id: string): string {
  return 'n_' + id.replace(/[^A-Za-z0-9_]/g, '');
}
function cypherStr(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function relType(t: string): string {
  const clean = t.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'RELATED_TO';
}
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mermaidId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '');
}

export function exportKnowledgeGraph(store: KnowledgeGraphStore, format: KgExportFormat, limit = 5000): string {
  const entities = store.allEntities(limit);
  const relations = store.allRelations(limit);
  const ids = new Set(entities.map((e) => e.id));
  const edges = relations.filter((r) => ids.has(r.srcId) && ids.has(r.dstId));

  switch (format) {
    case 'json':
      return JSON.stringify({
        nodes: entities.map((e) => ({ id: e.id, label: e.name, type: e.type, method: e.method, mentions: e.mentions })),
        edges: edges.map((r) => ({ source: r.srcId, target: r.dstId, label: r.type, method: r.method, weight: r.weight })),
      }, null, 2);

    case 'cypher': {
      const lines: string[] = [];
      for (const e of entities) {
        lines.push(`CREATE (${safeVar(e.id)}:Entity {id:${cypherStr(e.id)}, name:${cypherStr(e.name)}, type:${cypherStr(e.type)}, method:${cypherStr(e.method)}});`);
      }
      for (const r of edges) {
        lines.push(`MATCH (a:Entity {id:${cypherStr(r.srcId)}}),(b:Entity {id:${cypherStr(r.dstId)}}) CREATE (a)-[:${relType(r.type)} {method:${cypherStr(r.method)}, weight:${r.weight}}]->(b);`);
      }
      return lines.join('\n');
    }

    case 'graphml': {
      const lines: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
        '  <key id="name" for="node" attr.name="name" attr.type="string"/>',
        '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
        '  <key id="method" for="node" attr.name="method" attr.type="string"/>',
        '  <key id="etype" for="edge" attr.name="type" attr.type="string"/>',
        '  <key id="emethod" for="edge" attr.name="method" attr.type="string"/>',
        '  <graph edgedefault="directed">',
      ];
      for (const e of entities) {
        lines.push(`    <node id="${xmlEscape(e.id)}"><data key="name">${xmlEscape(e.name)}</data><data key="type">${xmlEscape(e.type)}</data><data key="method">${xmlEscape(e.method)}</data></node>`);
      }
      edges.forEach((r, i) => {
        lines.push(`    <edge id="e${i}" source="${xmlEscape(r.srcId)}" target="${xmlEscape(r.dstId)}"><data key="etype">${xmlEscape(r.type)}</data><data key="emethod">${xmlEscape(r.method)}</data></edge>`);
      });
      lines.push('  </graph>', '</graphml>');
      return lines.join('\n');
    }

    case 'mermaid': {
      const cap = Math.min(edges.length, 200);
      const lines = ['graph LR'];
      const labelFor = new Map(entities.map((e) => [e.id, e.name]));
      for (let i = 0; i < cap; i++) {
        const r = edges[i];
        const a = mermaidId(r.srcId);
        const b = mermaidId(r.dstId);
        lines.push(`  ${a}["${(labelFor.get(r.srcId) || r.srcName).replace(/"/g, "'")}"] -->|${r.type}| ${b}["${(labelFor.get(r.dstId) || r.dstName).replace(/"/g, "'")}"]`);
      }
      if (edges.length > cap) lines.push(`  %% ${edges.length - cap} more edges omitted`);
      return lines.join('\n');
    }

    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}
