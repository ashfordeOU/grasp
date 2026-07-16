/**
 * Natural-language querying over the semantic knowledge graph.
 *
 * Retrieval is always local (hybrid lexical + vector). Answer synthesis uses the
 * configured LLM provider when available and otherwise returns a structured,
 * fully-sourced digest — so `ask` works with zero credentials, just less prose.
 */

import { KnowledgeGraphStore } from './kg-store.js';
import { resolveProvider, ProviderConfig } from '../llm/provider.js';
import { embed } from '../embed.js';

export interface Citation { docId: string; source?: string; title?: string; locator?: string; snippet: string }

export interface AskResult {
  question: string;
  answer: string;
  mode: 'llm' | 'retrieval';
  citations: Citation[];
  entities: Array<{ name: string; type: string; method: string }>;
}

function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 10);
}

/** Answer a natural-language question grounded in the knowledge graph. */
export async function ask(
  question: string,
  store: KnowledgeGraphStore,
  opts: { llm?: ProviderConfig; disableLlm?: boolean; k?: number } = {},
): Promise<AskResult> {
  const qVec = await embed(question).catch(() => null);
  const chunks = store.searchChunks(question, qVec, opts.k ?? 8);

  // Entity subgraph: entities whose names hit the question keywords.
  const seen = new Set<string>();
  const entities: Array<{ name: string; type: string; method: string }> = [];
  const relationLines: string[] = [];
  for (const kw of keywords(question)) {
    for (const e of store.findEntities(kw, 5)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entities.push({ name: e.name, type: e.type, method: e.method });
      for (const n of store.neighbors(e.id).slice(0, 6)) {
        const arrow = n.direction === 'out' ? `${e.name} —${n.type}→ ${n.otherName}` : `${n.otherName} —${n.type}→ ${e.name}`;
        relationLines.push(`${arrow} [${n.method}]`);
      }
    }
  }

  const citations: Citation[] = chunks.map((c) => {
    const doc = store.getDoc(c.docId);
    return {
      docId: c.docId,
      source: doc?.source,
      title: doc?.title,
      locator: c.locator,
      snippet: c.text.slice(0, 300).replace(/\s+/g, ' ').trim(),
    };
  });

  const provider = opts.disableLlm ? null : await resolveProvider(opts.llm ?? {});

  if (!provider) {
    // Deterministic digest: sourced snippets + graph facts.
    const parts: string[] = [];
    if (relationLines.length) {
      parts.push('Relevant knowledge-graph facts:');
      parts.push(...[...new Set(relationLines)].slice(0, 12).map((l) => `  • ${l}`));
    }
    if (citations.length) {
      parts.push('', 'Top sources:');
      citations.slice(0, 5).forEach((c, i) => parts.push(`  [${i + 1}] ${c.title || c.source || c.docId}${c.locator ? ` (@${c.locator})` : ''}: ${c.snippet}`));
    }
    if (!parts.length) parts.push('No indexed knowledge matched this question. Ingest documents first with grasp_ingest.');
    return { question, answer: parts.join('\n'), mode: 'retrieval', citations, entities };
  }

  const context = [
    relationLines.length ? `Knowledge-graph facts:\n${[...new Set(relationLines)].slice(0, 20).join('\n')}` : '',
    citations.length ? `Source excerpts:\n${citations.map((c, i) => `[${i + 1}] (${c.title || c.source || c.docId}${c.locator ? ` @${c.locator}` : ''})\n${c.snippet}`).join('\n\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await provider.complete({
    system: 'Answer the question using ONLY the provided knowledge-graph facts and source excerpts. Cite sources inline as [n]. If the context is insufficient, say so plainly. Be concise and accurate.',
    messages: [{ role: 'user', content: `Question: ${question}\n\nContext:\n${context || '(no indexed context found)'}` }],
    maxTokens: 900,
    temperature: 0.1,
  });

  return { question, answer: res.text.trim() || '(empty response)', mode: 'llm', citations, entities };
}

export interface PathResult { from: string; to: string; found: boolean; hops: number; path: string[]; note?: string }

/** Trace a relationship path between two named concepts. */
export function tracePath(fromName: string, toName: string, store: KnowledgeGraphStore, maxDepth = 6): PathResult {
  const fromMatches = store.findEntities(fromName, 1);
  const toMatches = store.findEntities(toName, 1);
  if (!fromMatches.length || !toMatches.length) {
    return { from: fromName, to: toName, found: false, hops: 0, path: [], note: !fromMatches.length ? `No entity matching "${fromName}"` : `No entity matching "${toName}"` };
  }
  const path = store.findPath(fromMatches[0].id, toMatches[0].id, maxDepth);
  if (!path) return { from: fromMatches[0].name, to: toMatches[0].name, found: false, hops: 0, path: [], note: 'No connecting path found within depth limit.' };
  return { from: fromMatches[0].name, to: toMatches[0].name, found: true, hops: path.length - 1, path: path.map((p) => p.name) };
}

export interface ExplainResult { name: string; type: string; method: string; found: boolean; facts: string[]; sources: Citation[] }

/** Explain a concept: its type, its graph neighbourhood, and where it appears. */
export function explainEntity(name: string, store: KnowledgeGraphStore): ExplainResult {
  const matches = store.findEntities(name, 1);
  if (!matches.length) return { name, type: '', method: '', found: false, facts: [], sources: [] };
  const e = matches[0];
  const facts = store.neighbors(e.id).slice(0, 20).map((n) =>
    n.direction === 'out' ? `${e.name} —${n.type}→ ${n.otherName} [${n.method}]` : `${n.otherName} —${n.type}→ ${e.name} [${n.method}]`,
  );
  const sources: Citation[] = [];
  const chunks = store.searchChunks(e.name, null, 3);
  for (const c of chunks) {
    const doc = store.getDoc(c.docId);
    sources.push({ docId: c.docId, source: doc?.source, title: doc?.title, locator: c.locator, snippet: c.text.slice(0, 240).replace(/\s+/g, ' ').trim() });
  }
  return { name: e.name, type: e.type, method: e.method, found: true, facts, sources };
}
