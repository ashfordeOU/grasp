import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AnalysisResult } from './types.js';
import crypto from 'crypto';
import { buildScopeIndex } from './scope-resolver.js';
import { esc } from './graph-utils.js';
import { indexNodes, indexImportEdges, indexCallEdges, indexReturnTypeEdges } from './graph-node-edges.js';
import { indexConstructorInference, indexOrmEdges, indexClassNodes } from './graph-class-edges.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const kuzu = require('kuzu') as {
  Database: new (path: string) => KuzuDatabase;
  Connection: new (db: KuzuDatabase) => KuzuConnection;
};

interface KuzuDatabase {
  close(): void;
}

interface KuzuQueryResult {
  getAll(): Promise<Record<string, any>[]>;
  close(): Promise<void>;
}

interface KuzuConnection {
  query(cypher: string): Promise<KuzuQueryResult>;
  close(): void;
}

const DEFAULT_DB_DIR = path.join(os.homedir(), '.grasp');

function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export class GraphStore {
  private db: KuzuDatabase;
  private conn: KuzuConnection;
  private ready: Promise<void>;

  constructor(dbDir?: string) {
    const dir = dbDir ?? DEFAULT_DB_DIR;
    const graphPath = path.join(dir, 'graph');
    fs.mkdirSync(graphPath, { recursive: true });
    this.db = new kuzu.Database(graphPath);
    this.conn = new kuzu.Connection(this.db);
    this.ready = this.ensureSchema();
  }

  private readonly SCHEMA_VERSION = '3';

  private async ensureSchema(): Promise<void> {
    // Check current schema version
    let currentVersion = '0';
    try {
      const res = await this.conn.query(`MATCH (m:GraspMeta {key: 'schema_version'}) RETURN m.value`);
      const rows = await res.getAll();
      await res.close();
      if (rows.length > 0) currentVersion = String(rows[0]['m.value'] ?? '0');
    } catch { /* GraspMeta table doesn't exist yet */ }

    if (currentVersion !== this.SCHEMA_VERSION) {
      await this.dropAllTables();
    }

    const stmts = [
      // Meta
      `CREATE NODE TABLE IF NOT EXISTS GraspMeta(key STRING, value STRING, PRIMARY KEY(key))`,
      // Existing nodes
      `CREATE NODE TABLE IF NOT EXISTS File(id STRING, path STRING, language STRING, repoId STRING, PRIMARY KEY(id))`,
      `CREATE NODE TABLE IF NOT EXISTS Function(id STRING, name STRING, filePath STRING, repoId STRING, returnType STRING, startLine INT64, endLine INT64, PRIMARY KEY(id))`,
      // New node tables
      `CREATE NODE TABLE IF NOT EXISTS Class(id STRING, name STRING, filePath STRING, repoId STRING, isAbstract BOOLEAN, isExported BOOLEAN, PRIMARY KEY(id))`,
      `CREATE NODE TABLE IF NOT EXISTS Interface(id STRING, name STRING, filePath STRING, repoId STRING, isExported BOOLEAN, PRIMARY KEY(id))`,
      `CREATE NODE TABLE IF NOT EXISTS Method(id STRING, name STRING, filePath STRING, className STRING, repoId STRING, startLine INT64, endLine INT64, returnType STRING, paramCount INT64, isStatic BOOLEAN, PRIMARY KEY(id))`,
      `CREATE NODE TABLE IF NOT EXISTS Constructor(id STRING, filePath STRING, className STRING, repoId STRING, paramCount INT64, PRIMARY KEY(id))`,
      // Edges — CALLS now has confidence
      `CREATE REL TABLE IF NOT EXISTS CALLS(FROM Function TO Function, count INT64, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS IMPORTS(FROM File TO File)`,
      `CREATE REL TABLE IF NOT EXISTS DEFINES(FROM File TO Function)`,
      `CREATE REL TABLE IF NOT EXISTS SAME_RETURN_TYPE(FROM Function TO Function, typeName STRING)`,
      // New edge tables
      `CREATE REL TABLE IF NOT EXISTS EXTENDS(FROM Class TO Class, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS IMPLEMENTS(FROM Class TO Interface, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS HAS_METHOD(FROM Class TO Method, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS HAS_CONSTRUCTOR(FROM Class TO Constructor, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS OVERRIDES(FROM Method TO Method, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS MEMBER_OF(FROM Method TO Class, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS STEP_IN_PROCESS(FROM Function TO Function, step INT64, processName STRING)`,
      `CREATE REL TABLE IF NOT EXISTS QUERIES(FROM Function TO File, orm STRING, model STRING, operation STRING)`,
      `CREATE NODE TABLE IF NOT EXISTS TestFile(id STRING, filePath STRING, repoId STRING, PRIMARY KEY(id))`,
      `CREATE REL TABLE IF NOT EXISTS TESTS(FROM TestFile TO File, confidence DOUBLE)`,
      `CREATE REL TABLE IF NOT EXISTS COVERS(FROM TestFile TO Function, confidence DOUBLE)`,
    ];
    for (const stmt of stmts) {
      const res = await this.conn.query(stmt);
      await res.close();
    }

    // Set schema version
    try {
      const setRes = await this.conn.query(
        `MERGE (m:GraspMeta {key: 'schema_version'}) SET m.value = '${this.SCHEMA_VERSION}'`
      );
      await setRes.close();
    } catch {
      // MERGE not supported in older Kuzu — use CREATE instead
      try {
        const delRes = await this.conn.query(`MATCH (m:GraspMeta {key: 'schema_version'}) DELETE m`);
        await delRes.close();
      } catch { /* ignore */ }
      const insRes = await this.conn.query(`CREATE (:GraspMeta {key: 'schema_version', value: '${this.SCHEMA_VERSION}'})`);
      await insRes.close();
    }
  }

  private async dropAllTables(): Promise<void> {
    const edgeTables = ['CALLS','IMPORTS','DEFINES','SAME_RETURN_TYPE','EXTENDS','IMPLEMENTS',
      'HAS_METHOD','HAS_CONSTRUCTOR','OVERRIDES','MEMBER_OF','STEP_IN_PROCESS','QUERIES',
      'TESTS','COVERS'];
    const nodeTables = ['TestFile','Method','Constructor','Class','Interface','Function','File','GraspMeta'];
    for (const t of edgeTables) {
      try { const r = await this.conn.query(`DROP TABLE ${t}`); await r.close(); } catch { /* already gone */ }
    }
    for (const t of nodeTables) {
      try { const r = await this.conn.query(`DROP TABLE ${t}`); await r.close(); } catch { /* already gone */ }
    }
  }

  async query(cypher: string): Promise<Record<string, any>[]> {
    await this.ready;
    const trimmed = cypher.trimStart();
    const firstToken = trimmed.split(/[\s(]/)[0].toUpperCase();
    const ALLOWED_STARTERS = new Set(['MATCH', 'RETURN', 'WITH', 'UNWIND', 'CALL', 'OPTIONAL']);
    if (!ALLOWED_STARTERS.has(firstToken)) {
      throw new Error('graph_query is read-only. Only MATCH, RETURN, WITH, UNWIND, CALL, OPTIONAL queries are permitted.');
    }
    const WRITE_KEYWORDS = ['CREATE', 'DELETE', 'MERGE', 'SET', 'REMOVE', 'DROP', 'DETACH'];
    const tokens = trimmed.toUpperCase().split(/[\s(,;]+/);
    if (WRITE_KEYWORDS.some(kw => tokens.includes(kw))) {
      throw new Error('graph_query is read-only. Only MATCH, RETURN, WITH, UNWIND, CALL, OPTIONAL queries are permitted.');
    }
    const res = await this.conn.query(cypher);
    const rows = await res.getAll();
    await res.close();
    return rows;
  }

  async indexResult(result: AnalysisResult): Promise<void> {
    await this.ready;
    const rid = repoId(result.source);
    await this.clearRepo(rid);
    const w = this._exec.bind(this);
    const { allFunctions, fnByNameAndFile, fnsByFile } = await indexNodes(w, result, rid);
    await indexImportEdges(w, result, rid);
    const scope = buildScopeIndex(result.files, new Map(allFunctions.map(fn => [`${fn.filePath}::${fn.name}`, fn.id])));
    await indexCallEdges(w, result, rid, fnByNameAndFile, fnsByFile, scope);
    await indexReturnTypeEdges(w, allFunctions);
    const r = this.query.bind(this);
    await indexConstructorInference(w, r, result, rid, fnByNameAndFile);
    await indexOrmEdges(w, result, rid, fnByNameAndFile);
    await indexClassNodes(w, result, rid, fnByNameAndFile);
  }

  private async _exec(cypher: string): Promise<void> {
    const r = await this.conn.query(cypher);
    await r.close();
  }

  private async clearRepo(rid: string): Promise<void> {
    const stmts = [
      `MATCH (n:Method {repoId: '${rid}'}) DETACH DELETE n`,
      `MATCH (n:Constructor {repoId: '${rid}'}) DETACH DELETE n`,
      `MATCH (n:Class {repoId: '${rid}'}) DETACH DELETE n`,
      `MATCH (n:Interface {repoId: '${rid}'}) DETACH DELETE n`,
      `MATCH (f:Function {repoId: '${rid}'}) DETACH DELETE f`,
      `MATCH (f:File {repoId: '${rid}'}) DETACH DELETE f`,
    ];
    for (const stmt of stmts) {
      const res = await this.conn.query(stmt);
      await res.close();
    }
  }

  async getCallChain(
    source: string,
    fnName: string,
    direction: 'callers' | 'callees' | 'both',
    depth: number
  ): Promise<{ nodes: Record<string, any>[]; edges: Record<string, any>[]; functionRows: Record<string, any>[] }> {
    await this.ready;
    const rid = repoId(source);
    const d = Math.min(Math.max(1, depth), 5);
    const nameEsc = esc(fnName);

    let cypher: string;
    if (direction === 'callees') {
      cypher = `MATCH p=(root:Function {name: '${nameEsc}', repoId: '${rid}'})-[:CALLS*1..${d}]->(callee:Function) RETURN root.name, callee.name, length(p) as hops ORDER BY hops`;
    } else if (direction === 'callers') {
      cypher = `MATCH p=(caller:Function)-[:CALLS*1..${d}]->(root:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN caller.name, root.name, length(p) as hops ORDER BY hops`;
    } else {
      cypher = `MATCH p=(a:Function)-[:CALLS*1..${d}]->(b:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN a.name, b.name, length(p) as hops
UNION
MATCH p=(root:Function {name: '${nameEsc}', repoId: '${rid}'})-[:CALLS*1..${d}]->(b:Function) RETURN root.name, b.name, length(p) as hops`;
    }

    const rootRows = await this.query(`MATCH (f:Function {name: '${nameEsc}', repoId: '${rid}'}) RETURN f.name, f.filePath, f.returnType LIMIT 1`);
    const chainRows = await this.query(cypher);

    return {
      nodes: [...rootRows, ...chainRows],
      edges: chainRows,
      functionRows: rootRows,
    };
  }

  async getTypeChain(
    source: string,
    typeName: string,
    hops: number
  ): Promise<{ producers: Record<string, any>[]; peers: Record<string, any>[] }> {
    await this.ready;
    const rid = repoId(source);
    const h = Math.min(Math.max(1, hops), 5);
    const typeEsc = esc(typeName);

    const producers = await this.query(
      `MATCH (f:Function {repoId: '${rid}'}) WHERE f.returnType = '${typeEsc}' RETURN f.name, f.filePath, f.returnType`
    );

    const peers = await this.query(
      `MATCH (a:Function {repoId: '${rid}'})-[:SAME_RETURN_TYPE*1..${h}]-(b:Function {repoId: '${rid}'}) WHERE a.returnType = '${typeEsc}' RETURN DISTINCT b.name, b.filePath, b.returnType`
    );

    return { producers, peers };
  }

  async clear(source: string): Promise<void> {
    await this.ready;
    await this.clearRepo(repoId(source));
  }

  async close(): Promise<void> {
    // Wait for schema init to complete before closing to avoid native teardown races
    await this.ready.catch(() => { /* ignore schema errors on close */ });
    await this.conn.close();
    await this.db.close();
  }
}

let instance: GraphStore | null = null;
export function getGraphStore(dbDir?: string): GraphStore {
  if (!instance) instance = new GraphStore(dbDir);
  return instance;
}
