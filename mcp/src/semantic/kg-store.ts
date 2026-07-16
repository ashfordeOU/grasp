/**
 * Persistent semantic knowledge-graph store (SQLite via better-sqlite3).
 *
 * Holds entities and relationships extracted from ingested documents, plus the
 * source chunks and their embeddings for hybrid (lexical + vector) retrieval.
 * Mirrors the BrainStore pattern and reuses Grasp's local embedding helpers, so
 * the whole thing stays on-machine. Lives in its own `kg.db` to keep the code
 * "brain" schema untouched.
 *
 * Every entity and relation carries a `method` tag — EXTRACTED (explicitly
 * stated in the source) vs INFERRED (derived) — and a source locator, so answers
 * can always cite where a fact came from.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';
import { vecToBlob, blobToVec, cosine } from '../embed.js';

export type ExtractionMethod = 'EXTRACTED' | 'INFERRED';

export interface KgDoc {
  id: string;
  source: string;
  kind: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface KgChunk {
  id: string;
  docId: string;
  index: number;
  text: string;
  locator?: string;
}

export interface KgEntity {
  id: string;
  name: string;
  type: string;
  docId: string;
  locator?: string;
  method: ExtractionMethod;
}

export interface KgRelation {
  id: string;
  srcName: string;
  dstName: string;
  type: string;
  method: ExtractionMethod;
  docId: string;
  locator?: string;
  confidence?: number;
}

export function entityId(name: string, type: string): string {
  return 'ent_' + crypto.createHash('sha1').update(`${name.toLowerCase()}::${type.toLowerCase()}`).digest('hex').slice(0, 12);
}

function relationId(src: string, dst: string, type: string): string {
  return 'rel_' + crypto.createHash('sha1').update(`${src.toLowerCase()}::${type.toLowerCase()}::${dst.toLowerCase()}`).digest('hex').slice(0, 12);
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS kg_docs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    kind TEXT,
    title TEXT,
    indexed_at INTEGER DEFAULT (unixepoch()),
    metadata_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS kg_chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    locator TEXT,
    vector BLOB
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kg_chunks_doc ON kg_chunks(doc_id)`,
  `CREATE TABLE IF NOT EXISTS kg_entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    doc_id TEXT,
    locator TEXT,
    method TEXT NOT NULL DEFAULT 'EXTRACTED',
    mentions INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON kg_entities(name)`,
  `CREATE TABLE IF NOT EXISTS kg_relations (
    id TEXT PRIMARY KEY,
    src_id TEXT NOT NULL,
    dst_id TEXT NOT NULL,
    src_name TEXT NOT NULL,
    dst_name TEXT NOT NULL,
    type TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'EXTRACTED',
    doc_id TEXT,
    locator TEXT,
    confidence REAL,
    weight INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_kg_rel_src ON kg_relations(src_id)`,
  `CREATE INDEX IF NOT EXISTS idx_kg_rel_dst ON kg_relations(dst_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS kg_fts USING fts5(
    chunk_id UNINDEXED,
    body,
    tokenize='porter unicode61'
  )`,
];

export class KnowledgeGraphStore {
  private db: Database.Database;

  constructor(dbDir?: string) {
    const dir = dbDir ?? path.join(os.homedir(), '.grasp');
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, 'kg.db'));
    this.db.pragma('journal_mode = WAL');
    // Apply schema one statement at a time (each is idempotent).
    for (const stmt of SCHEMA) this.db.prepare(stmt).run();
  }

  getDb(): Database.Database { return this.db; }
  close(): void { this.db.close(); }

  upsertDoc(doc: KgDoc): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO kg_docs (id, source, kind, title, indexed_at, metadata_json) VALUES (?, ?, ?, ?, unixepoch(), ?)',
    ).run(doc.id, doc.source, doc.kind, doc.title ?? null, doc.metadata ? JSON.stringify(doc.metadata) : null);
  }

  /** Replace all chunks for a doc (with optional embedding vectors). */
  saveChunks(chunks: Array<KgChunk & { vector?: Float32Array | null }>): void {
    const insChunk = this.db.prepare('INSERT OR REPLACE INTO kg_chunks (id, doc_id, idx, text, locator, vector) VALUES (?, ?, ?, ?, ?, ?)');
    const insFts = this.db.prepare('INSERT INTO kg_fts (chunk_id, body) VALUES (?, ?)');
    const delFts = this.db.prepare('DELETE FROM kg_fts WHERE chunk_id = ?');
    this.db.transaction(() => {
      for (const c of chunks) {
        insChunk.run(c.id, c.docId, c.index, c.text, c.locator ?? null, c.vector ? vecToBlob(c.vector) : null);
        delFts.run(c.id);
        insFts.run(c.id, c.text);
      }
    })();
  }

  /** Upsert an entity, accumulating mention count. Returns its id. */
  upsertEntity(e: Omit<KgEntity, 'id'>): string {
    const id = entityId(e.name, e.type);
    this.db.prepare(`
      INSERT INTO kg_entities (id, name, type, doc_id, locator, method, mentions)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET mentions = mentions + 1,
        method = CASE WHEN method = 'INFERRED' AND excluded.method = 'EXTRACTED' THEN 'EXTRACTED' ELSE method END
    `).run(id, e.name, e.type, e.docId ?? null, e.locator ?? null, e.method);
    return id;
  }

  /** Upsert a relation between two entities (by name/type-derived ids). */
  upsertRelation(r: { srcName: string; srcType: string; dstName: string; dstType: string; type: string; method: ExtractionMethod; docId?: string; locator?: string; confidence?: number }): string {
    const srcId = entityId(r.srcName, r.srcType);
    const dstId = entityId(r.dstName, r.dstType);
    const id = relationId(r.srcName, r.dstName, r.type);
    this.db.prepare(`
      INSERT INTO kg_relations (id, src_id, dst_id, src_name, dst_name, type, method, doc_id, locator, confidence, weight)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET weight = weight + 1,
        method = CASE WHEN method = 'INFERRED' AND excluded.method = 'EXTRACTED' THEN 'EXTRACTED' ELSE method END
    `).run(id, srcId, dstId, r.srcName, r.dstName, r.type, r.method, r.docId ?? null, r.locator ?? null, r.confidence ?? null);
    return id;
  }

  /** Lexical (FTS) + vector retrieval of chunks, merged by reciprocal rank fusion. */
  searchChunks(queryText: string, queryVec: Float32Array | null, limit = 8): Array<{ chunkId: string; docId: string; text: string; locator?: string; score: number }> {
    const scores = new Map<string, number>();
    const k = 60;

    // Lexical.
    try {
      const ftsQuery = queryText.replace(/["']/g, ' ').split(/\s+/).filter(Boolean).slice(0, 12).map((t) => `"${t}"`).join(' OR ');
      if (ftsQuery) {
        const rows = this.db.prepare('SELECT chunk_id FROM kg_fts WHERE kg_fts MATCH ? ORDER BY rank LIMIT 40').all(ftsQuery) as any[];
        rows.forEach((r, i) => scores.set(r.chunk_id, (scores.get(r.chunk_id) ?? 0) + 1 / (k + i + 1)));
      }
    } catch {
      /* FTS syntax fallbacks are non-fatal */
    }

    // Vector.
    if (queryVec) {
      const rows = this.db.prepare('SELECT id, vector FROM kg_chunks WHERE vector IS NOT NULL').all() as any[];
      const sims = rows
        .map((r) => ({ id: r.id as string, sim: cosine(queryVec, blobToVec(r.vector)) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 40);
      sims.forEach((s, i) => scores.set(s.id, (scores.get(s.id) ?? 0) + 1 / (k + i + 1)));
    }

    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    const out: Array<{ chunkId: string; docId: string; text: string; locator?: string; score: number }> = [];
    const getChunk = this.db.prepare('SELECT id, doc_id, text, locator FROM kg_chunks WHERE id = ?');
    for (const [id, score] of top) {
      const row = getChunk.get(id) as any;
      if (row) out.push({ chunkId: row.id, docId: row.doc_id, text: row.text, locator: row.locator ?? undefined, score });
    }
    return out;
  }

  findEntities(namePattern: string, limit = 20): KgEntity[] {
    const rows = this.db.prepare(
      'SELECT * FROM kg_entities WHERE name LIKE ? ORDER BY mentions DESC LIMIT ?',
    ).all(`%${namePattern.replace(/[%_]/g, ' ')}%`, limit) as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, docId: r.doc_id, locator: r.locator, method: r.method }));
  }

  /** Neighbours (1-hop) of an entity, both directions. */
  neighbors(entId: string): Array<{ direction: 'out' | 'in'; type: string; otherName: string; otherId: string; method: string; docId?: string; locator?: string }> {
    const outRows = this.db.prepare('SELECT dst_id, dst_name, type, method, doc_id, locator FROM kg_relations WHERE src_id = ?').all(entId) as any[];
    const inRows = this.db.prepare('SELECT src_id, src_name, type, method, doc_id, locator FROM kg_relations WHERE dst_id = ?').all(entId) as any[];
    return [
      ...outRows.map((r) => ({ direction: 'out' as const, type: r.type, otherName: r.dst_name, otherId: r.dst_id, method: r.method, docId: r.doc_id, locator: r.locator })),
      ...inRows.map((r) => ({ direction: 'in' as const, type: r.type, otherName: r.src_name, otherId: r.src_id, method: r.method, docId: r.doc_id, locator: r.locator })),
    ];
  }

  /** Shortest path (BFS) between two entities over the undirected relation graph. */
  findPath(fromId: string, toId: string, maxDepth = 5): Array<{ name: string; id: string }> | null {
    const start = this.getEntity(fromId);
    if (!start) return null;
    if (fromId === toId) return [{ name: start.name, id: start.id }];
    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: Array<{ name: string; id: string }> }> = [
      { id: fromId, path: [{ name: start.name, id: start.id }] },
    ];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.path.length > maxDepth) continue;
      for (const n of this.neighbors(cur.id)) {
        if (visited.has(n.otherId)) continue;
        const nextPath = [...cur.path, { name: n.otherName, id: n.otherId }];
        if (n.otherId === toId) return nextPath;
        visited.add(n.otherId);
        queue.push({ id: n.otherId, path: nextPath });
      }
    }
    return null;
  }

  getEntity(id: string): KgEntity | null {
    const r = this.db.prepare('SELECT * FROM kg_entities WHERE id = ?').get(id) as any;
    return r ? { id: r.id, name: r.name, type: r.type, docId: r.doc_id, locator: r.locator, method: r.method } : null;
  }

  getDoc(id: string): (KgDoc & { indexedAt: number }) | null {
    const r = this.db.prepare('SELECT * FROM kg_docs WHERE id = ?').get(id) as any;
    return r ? { id: r.id, source: r.source, kind: r.kind, title: r.title, metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined, indexedAt: r.indexed_at } : null;
  }

  stats(): { docs: number; chunks: number; entities: number; relations: number; extracted: number; inferred: number } {
    const one = (sql: string) => (this.db.prepare(sql).get() as any).n as number;
    return {
      docs: one('SELECT COUNT(*) n FROM kg_docs'),
      chunks: one('SELECT COUNT(*) n FROM kg_chunks'),
      entities: one('SELECT COUNT(*) n FROM kg_entities'),
      relations: one('SELECT COUNT(*) n FROM kg_relations'),
      extracted: one("SELECT COUNT(*) n FROM kg_relations WHERE method='EXTRACTED'"),
      inferred: one("SELECT COUNT(*) n FROM kg_relations WHERE method='INFERRED'"),
    };
  }

  /** Most-connected entities ("god nodes"). */
  hubs(limit = 10): Array<{ id: string; name: string; type: string; degree: number }> {
    const rows = this.db.prepare(`
      SELECT e.id, e.name, e.type,
        (SELECT COUNT(*) FROM kg_relations r WHERE r.src_id = e.id OR r.dst_id = e.id) AS degree
      FROM kg_entities e ORDER BY degree DESC LIMIT ?
    `).all(limit) as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, degree: r.degree }));
  }
}
