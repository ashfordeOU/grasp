import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AnalysisResult } from './types.js';
import crypto from 'crypto';

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

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/[\0\n\r\t]/g, ' ');
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

  private readonly SCHEMA_VERSION = '2';

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
      'HAS_METHOD','HAS_CONSTRUCTOR','OVERRIDES','MEMBER_OF','STEP_IN_PROCESS','QUERIES'];
    const nodeTables = ['Method','Constructor','Class','Interface','Function','File','GraspMeta'];
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

  // Task 6: Index an AnalysisResult into the graph
  async indexResult(result: AnalysisResult): Promise<void> {
    await this.ready;
    const rid = repoId(result.source);

    // Clear existing data for this repo
    await this.clearRepo(rid);

    const allFunctions: Array<{
      id: string; name: string; filePath: string; returnType: string;
      startLine: number; repoId: string;
    }> = [];

    for (const file of result.files) {
      if (!file.isCode) continue;
      const fileId = `${rid}:${file.path}`;

      const fileRes = await this.conn.query(
        `CREATE (:File {id: '${esc(fileId)}', path: '${esc(file.path)}', language: '${esc(file.path.split('.').pop() ?? '')}', repoId: '${rid}'})`
      );
      await fileRes.close();

      for (const fn of file.functions) {
        const fnId = `${rid}:${file.path}:${fn.name}:${fn.line}`;
        const returnType = fn.returnType ?? '';
        allFunctions.push({ id: fnId, name: fn.name, filePath: file.path, returnType, startLine: fn.line, repoId: rid });

        const fnRes = await this.conn.query(
          `CREATE (:Function {id: '${esc(fnId)}', name: '${esc(fn.name)}', filePath: '${esc(file.path)}', repoId: '${rid}', returnType: '${esc(returnType)}', startLine: ${fn.line}, endLine: ${fn.line}})`
        );
        await fnRes.close();

        const defRes = await this.conn.query(
          `MATCH (f:File {id: '${esc(fileId)}'}), (fn:Function {id: '${esc(fnId)}'}) CREATE (f)-[:DEFINES]->(fn)`
        );
        await defRes.close();
      }
    }

    // IMPORTS edges — second pass so all File nodes exist
    for (const file of result.files) {
      if (!file.isCode) continue;
      const fileId = `${rid}:${file.path}`;
      for (const imp of (file.imports ?? [])) {
        const targetId = `${rid}:${imp}`;
        const impRes = await this.conn.query(
          `MATCH (a:File {id: '${esc(fileId)}'}), (b:File {id: '${esc(targetId)}'}) WHERE a <> b CREATE (a)-[:IMPORTS]->(b)`
        );
        await impRes.close();
      }
    }

    // Build lookups: fn by (filePath, name) and fn ids by filePath
    const fnByNameAndFile = new Map<string, string>(); // "filePath::name" → id
    const fnsByFile = new Map<string, string[]>();     // filePath → [id, ...]
    for (const fn of allFunctions) {
      fnByNameAndFile.set(`${fn.filePath}::${fn.name}`, fn.id);
      if (!fnsByFile.has(fn.filePath)) fnsByFile.set(fn.filePath, []);
      fnsByFile.get(fn.filePath)!.push(fn.id);
    }

    // CALLS edges from connections
    // connection.source = file where fn is defined (callee's file)
    // connection.target = file that calls the function (caller's file)
    // connection.fn = name of the called function
    for (const connection of result.connections) {
      // callee: the named function in the source file (where it is defined)
      const calleeId = fnByNameAndFile.get(`${connection.source}::${connection.fn}`);
      if (!calleeId) continue;
      // callers: all functions in the target file (the calling file)
      const callerIds = fnsByFile.get(connection.target) ?? [];
      for (const callerId of callerIds) {
        if (callerId === calleeId) continue;
        const edgeRes = await this.conn.query(
          `MATCH (a:Function {id: '${esc(callerId)}'}), (b:Function {id: '${esc(calleeId)}'}) CREATE (a)-[:CALLS {count: ${connection.count}}]->(b)`
        );
        await edgeRes.close();
      }
    }

    // SAME_RETURN_TYPE edges
    const byReturnType = new Map<string, string[]>();
    for (const fn of allFunctions) {
      if (!fn.returnType) continue;
      if (!byReturnType.has(fn.returnType)) byReturnType.set(fn.returnType, []);
      byReturnType.get(fn.returnType)!.push(fn.id);
    }
    for (const [typeName, ids] of byReturnType) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const edgeRes = await this.conn.query(
            `MATCH (a:Function {id: '${esc(ids[i])}'}), (b:Function {id: '${esc(ids[j])}'}) CREATE (a)-[:SAME_RETURN_TYPE {typeName: '${esc(typeName)}'}]->(b)`
          );
          await edgeRes.close();
        }
      }
    }
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
