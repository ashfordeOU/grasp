/**
 * Semantic knowledge-graph extraction.
 *
 * Turns an ingested document's chunks into entities + relationships stored in the
 * {@link KnowledgeGraphStore}. Two modes:
 *
 *  - LLM mode (when a provider resolves): each chunk is sent to the configured
 *    backend which returns entities and relationships, each tagged EXTRACTED
 *    (explicitly stated) or INFERRED (derived).
 *  - Deterministic mode (no provider / offline): heading structure, capitalised
 *    noun phrases and fenced identifiers become entities; same-chunk co-occurrence
 *    becomes INFERRED "related_to" edges. Guarantees a usable graph with zero
 *    credentials — Grasp's local-first default.
 */

import { IngestedDoc, IngestedChunk } from '../ingest/types.js';
import { KnowledgeGraphStore, ExtractionMethod, KgChunk } from './kg-store.js';
import { LLMProvider, resolveProvider, ProviderConfig } from '../llm/provider.js';
import { embed } from '../embed.js';

export interface ExtractedEntity { name: string; type: string; method: ExtractionMethod }
export interface ExtractedRelation { source: string; sourceType?: string; target: string; targetType?: string; type: string; method: ExtractionMethod }

export interface ExtractionResult {
  docId: string;
  mode: 'llm' | 'deterministic';
  provider?: string;
  entities: number;
  relations: number;
  chunks: number;
}

const EXTRACT_SYSTEM = `You extract a knowledge graph from a document excerpt.
Return ONLY valid JSON of the form:
{"entities":[{"name":"...","type":"..."}],"relationships":[{"source":"...","target":"...","type":"...","method":"EXTRACTED|INFERRED"}]}
Rules:
- "type" for entities is a short category (person, org, concept, tool, file, function, event, place, metric, etc.).
- Relationship "type" is a short verb phrase (uses, depends_on, authored_by, part_of, causes, mentions, etc.).
- method=EXTRACTED when the excerpt states the relationship explicitly; method=INFERRED when you deduced it.
- Keep names canonical and concise. Do not invent facts not supported by the text.
- No prose, no markdown fences — JSON only.`;

function parseJsonLoose(text: string): any | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function extractChunkLLM(provider: LLMProvider, chunk: IngestedChunk): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const res = await provider.complete({
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: chunk.text.slice(0, 6000) }],
    maxTokens: 1200,
    temperature: 0,
    json: true,
  });
  const parsed = parseJsonLoose(res.text);
  if (!parsed) return { entities: [], relations: [] };
  const entities: ExtractedEntity[] = (parsed.entities || [])
    .filter((e: any) => e && e.name)
    .map((e: any) => ({ name: String(e.name).trim(), type: String(e.type || 'concept').trim(), method: 'EXTRACTED' as ExtractionMethod }));
  const relations: ExtractedRelation[] = (parsed.relationships || parsed.relations || [])
    .filter((r: any) => r && r.source && r.target)
    .map((r: any) => ({
      source: String(r.source).trim(),
      target: String(r.target).trim(),
      type: String(r.type || 'related_to').trim().replace(/\s+/g, '_'),
      method: (r.method === 'INFERRED' ? 'INFERRED' : 'EXTRACTED') as ExtractionMethod,
    }));
  return { entities, relations };
}

const STOPWORDS = new Set(['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'And', 'But', 'For', 'From', 'With', 'When', 'While', 'Where', 'What', 'Which', 'It', 'We', 'You', 'They', 'He', 'She', 'I', 'In', 'On', 'At', 'To', 'Of', 'As', 'By', 'Or', 'If', 'Is', 'Are', 'Be']);

/** Heuristic entity/relation extraction with no LLM. */
function extractChunkDeterministic(chunk: IngestedChunk): { entities: ExtractedEntity[]; relations: ExtractedRelation[] } {
  const found = new Map<string, ExtractedEntity>();
  const add = (name: string, type: string) => {
    const clean = name.trim().replace(/[.,;:]$/, '');
    if (clean.length < 2 || clean.length > 80) return;
    const key = clean.toLowerCase();
    if (!found.has(key)) found.set(key, { name: clean, type, method: 'INFERRED' });
  };

  // Markdown/section headings -> topic entities (captured first so they anchor).
  for (const m of chunk.text.matchAll(/^#{1,6}[ \t]+(.+)$/gm)) add(m[1], 'topic');
  // Fenced / inline code identifiers -> code entities.
  for (const m of chunk.text.matchAll(/`([A-Za-z_][A-Za-z0-9_.]{1,60})`/g)) add(m[1], 'code');
  // Capitalised multi-word proper-noun phrases (same line only) -> named entities.
  for (const m of chunk.text.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:[ \t]+[A-Z][a-zA-Z0-9]+){0,3})\b/g)) {
    const phrase = m[1];
    const firstWord = phrase.split(/[ \t]+/)[0];
    if (STOPWORDS.has(firstWord) && !phrase.includes(' ')) continue;
    add(phrase, 'entity');
  }

  const entities = [...found.values()].slice(0, 24);
  const relations: ExtractedRelation[] = [];
  if (entities.length > 1) {
    // Anchor-star: the first entity (usually the section heading) links to the
    // rest, guaranteeing a connected component per chunk so paths are traceable.
    const anchor = entities[0];
    for (let i = 1; i < entities.length; i++) {
      relations.push({ source: anchor.name, sourceType: anchor.type, target: entities[i].name, targetType: entities[i].type, type: 'related_to', method: 'INFERRED' });
    }
    // Plus a small clique among the most salient entities for local richness.
    const top = entities.slice(1, 6);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        relations.push({ source: top[i].name, sourceType: top[i].type, target: top[j].name, targetType: top[j].type, type: 'related_to', method: 'INFERRED' });
      }
    }
  }
  return { entities, relations };
}

/** Build (or update) the knowledge graph for one ingested document. */
export async function extractToGraph(
  doc: IngestedDoc,
  store: KnowledgeGraphStore,
  opts: { llm?: ProviderConfig; disableLlm?: boolean; embedChunks?: boolean } = {},
): Promise<ExtractionResult> {
  store.upsertDoc({ id: doc.id, source: doc.source, kind: doc.kind, title: doc.title, metadata: doc.metadata });

  const provider = opts.disableLlm ? null : await resolveProvider(opts.llm ?? {});
  const mode: 'llm' | 'deterministic' = provider ? 'llm' : 'deterministic';

  // Embed + persist chunks for retrieval.
  const chunkRows: Array<KgChunk & { vector?: Float32Array | null }> = [];
  for (const c of doc.chunks) {
    const vector = opts.embedChunks === false ? null : await embed(c.text).catch(() => null);
    chunkRows.push({ ...c, docId: doc.id, vector });
  }
  store.saveChunks(chunkRows);

  let entityCount = 0;
  let relationCount = 0;
  const typeOf = new Map<string, string>();

  for (const chunk of doc.chunks) {
    let result: { entities: ExtractedEntity[]; relations: ExtractedRelation[] };
    if (provider) {
      try {
        result = await extractChunkLLM(provider, chunk);
      } catch {
        result = extractChunkDeterministic(chunk); // degrade gracefully on provider error
      }
    } else {
      result = extractChunkDeterministic(chunk);
    }

    for (const e of result.entities) {
      typeOf.set(e.name.toLowerCase(), e.type);
      store.upsertEntity({ name: e.name, type: e.type, docId: doc.id, locator: chunk.locator ?? `${chunk.index}`, method: e.method });
      entityCount++;
    }
    for (const r of result.relations) {
      store.upsertRelation({
        srcName: r.source,
        srcType: r.sourceType ?? typeOf.get(r.source.toLowerCase()) ?? 'concept',
        dstName: r.target,
        dstType: r.targetType ?? typeOf.get(r.target.toLowerCase()) ?? 'concept',
        type: r.type,
        method: r.method,
        docId: doc.id,
        locator: chunk.locator ?? `${chunk.index}`,
      });
      relationCount++;
    }
  }

  return { docId: doc.id, mode, provider: provider?.name, entities: entityCount, relations: relationCount, chunks: doc.chunks.length };
}
