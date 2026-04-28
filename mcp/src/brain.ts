import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';
import { indexProcesses as doIndexProcesses } from './brain-process.js';

const DEFAULT_DB_DIR = path.join(os.homedir(), '.grasp');

export interface RepoRecord {
  source: string;
  sourceType: string;
  healthScore: number;
  healthGrade: string;
  fileCount: number;
  functionCount: number;
  issueCount: number;
  securityIssueCount: number;
  circularDepCount: number;
  sessionId: string;
  indexedAt?: number;
}

export interface FileRecord {
  repoId: string;
  path: string;
  layer: string;
  lines: number;
  complexity: number;
  couplingIn: number;
  couplingOut: number;
  churn: number;
  healthGrade: string;
}

export interface FnRecord {
  repoId: string;
  filePath: string;
  name: string;
  line: number;
  type: string;
}

export interface SnapshotData {
  healthScore: number;
  healthGrade: string;
  circularDepCount: number;
  avgCouplingIn: number;
  fileCoupling: Record<string, { in: number; out: number }>;
  untestedFilePaths: string[];
  topCoupledFiles: Array<{ path: string; couplingIn: number }>;
}

export function makeRepoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function repoId(source: string): string {
  return makeRepoId(source);
}

function gradeForComplexity(c: number): string {
  if (c >= 30) return 'F';
  if (c >= 20) return 'D';
  if (c >= 10) return 'C';
  if (c >= 5) return 'B';
  return 'A';
}

function buildCouplingMaps(connections: Array<{ source: string; target: string }>): {
  couplingIn: Map<string, number>;
  couplingOut: Map<string, number>;
} {
  const couplingIn = new Map<string, number>();
  const couplingOut = new Map<string, number>();
  for (const conn of connections) {
    couplingIn.set(conn.target, (couplingIn.get(conn.target) ?? 0) + 1);
    couplingOut.set(conn.source, (couplingOut.get(conn.source) ?? 0) + 1);
  }
  return { couplingIn, couplingOut };
}

function groupSecByFile(security: Array<{ file: string; severity: string; desc: string }>): Map<string, Array<{ severity: string; desc: string }>> {
  const secByFile = new Map<string, Array<{ severity: string; desc: string }>>();
  for (const sec of security) {
    if (!secByFile.has(sec.file)) secByFile.set(sec.file, []);
    secByFile.get(sec.file)!.push({ severity: sec.severity, desc: sec.desc });
  }
  return secByFile;
}

export class BrainStore {
  private db: Database.Database;

  constructor(dbDir?: string) {
    const dir = dbDir ?? DEFAULT_DB_DIR;
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, 'brain.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL UNIQUE,
        source_type TEXT,
        indexed_at INTEGER DEFAULT (unixepoch()),
        health_score INTEGER,
        health_grade TEXT,
        file_count INTEGER,
        function_count INTEGER,
        issue_count INTEGER,
        security_issue_count INTEGER,
        circular_dep_count INTEGER,
        session_id TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        repo_id TEXT,
        path TEXT,
        layer TEXT,
        lines INTEGER,
        complexity REAL,
        coupling_in INTEGER,
        coupling_out INTEGER,
        churn INTEGER,
        health_grade TEXT,
        security_json TEXT,
        PRIMARY KEY (repo_id, path)
      );
      CREATE TABLE IF NOT EXISTS functions (
        repo_id TEXT,
        file_path TEXT,
        name TEXT,
        line INTEGER,
        type TEXT,
        PRIMARY KEY (repo_id, file_path, name)
      );
      CREATE TABLE IF NOT EXISTS edges (
        repo_id TEXT,
        from_path TEXT,
        to_path TEXT,
        fn_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(repo_id, to_path);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(repo_id, from_path);
      CREATE INDEX IF NOT EXISTS idx_files_layer ON files(repo_id, layer);
      CREATE INDEX IF NOT EXISTS idx_files_grade ON files(repo_id, health_grade);
      CREATE INDEX IF NOT EXISTS idx_fns_name ON functions(repo_id, name);
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_idx USING fts5(
        file_path,
        fn_name,
        body,
        tokenize='porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        fn_name TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL,
        vector BLOB NOT NULL,
        PRIMARY KEY (repo_id, file_path, fn_name)
      );
      CREATE TABLE IF NOT EXISTS processes (
        repo_id TEXT NOT NULL,
        process_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        fn_name TEXT NOT NULL DEFAULT '',
        depth INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (repo_id, process_name, file_path, fn_name)
      );
      CREATE INDEX IF NOT EXISTS idx_processes_file ON processes(repo_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_embed_repo ON embeddings(repo_id);
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_repo ON snapshots(repo_id, created_at);
    `);
  }

  upsertRepo(rec: RepoRecord): string {
    const id = repoId(rec.source);
    this.db.prepare(`
      INSERT OR REPLACE INTO repos
        (id, source, source_type, indexed_at, health_score, health_grade, file_count, function_count, issue_count, security_issue_count, circular_dep_count, session_id)
      VALUES (?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, rec.source, rec.sourceType, rec.healthScore, rec.healthGrade, rec.fileCount, rec.functionCount, rec.issueCount, rec.securityIssueCount, rec.circularDepCount, rec.sessionId);
    return id;
  }

  getRepo(source: string): (RepoRecord & { id: string; indexedAt: number }) | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE source = ?').get(source) as any;
    if (!row) return null;
    return {
      id: row.id, source: row.source, sourceType: row.source_type,
      healthScore: row.health_score, healthGrade: row.health_grade,
      fileCount: row.file_count, functionCount: row.function_count,
      issueCount: row.issue_count, securityIssueCount: row.security_issue_count,
      circularDepCount: row.circular_dep_count, sessionId: row.session_id,
      indexedAt: row.indexed_at,
    };
  }

  listRepos(): Array<RepoRecord & { id: string; indexedAt: number }> {
    return this._query('SELECT * FROM repos ORDER BY indexed_at DESC', [], row => ({
      id: row.id, source: row.source, sourceType: row.source_type,
      healthScore: row.health_score, healthGrade: row.health_grade,
      fileCount: row.file_count, functionCount: row.function_count,
      issueCount: row.issue_count, securityIssueCount: row.security_issue_count,
      circularDepCount: row.circular_dep_count, sessionId: row.session_id,
      indexedAt: row.indexed_at,
    }));
  }

  saveSnapshot(repoId: string, name: string, data: SnapshotData): void {
    this.db.prepare(
      'INSERT INTO snapshots (repo_id, name, data) VALUES (?, ?, ?)'
    ).run(repoId, name, JSON.stringify(data));
  }

  getLastSnapshot(repoId: string): { id: number; name: string; createdAt: number; data: string } | null {
    const row = this.db.prepare(
      'SELECT id, name, created_at, data FROM snapshots WHERE repo_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(repoId) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, createdAt: row.created_at, data: row.data };
  }

  getSnapshot(id: number): { id: number; name: string; createdAt: number; data: string } | null {
    const row = this.db.prepare(
      'SELECT id, name, created_at, data FROM snapshots WHERE id = ?'
    ).get(id) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, createdAt: row.created_at, data: row.data };
  }

  listSnapshots(repoId: string): Array<{ id: number; name: string; createdAt: number }> {
    return (this.db.prepare(
      'SELECT id, name, created_at FROM snapshots WHERE repo_id = ? ORDER BY created_at DESC'
    ).all(repoId) as any[]).map(r => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  queryEdges(source: string): Array<{ fromPath: string; toPath: string; fnName: string }> {
    const id = repoId(source);
    return this._query(
      'SELECT from_path, to_path, fn_name FROM edges WHERE repo_id = ?',
      [id],
      row => ({ fromPath: row.from_path, toPath: row.to_path, fnName: row.fn_name })
    );
  }

  deleteRepo(source: string): void {
    const id = repoId(source);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM edges WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM functions WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM files WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM repos WHERE id = ?').run(id);
    })();
  }

  indexResult(result: import('./types.js').AnalysisResult): void {
    const id = repoId(result.source);
    const { couplingIn, couplingOut } = buildCouplingMaps(result.connections);
    const secByFile = groupSecByFile(result.security);

    const upsertRepoStmt = this.db.prepare(`
      INSERT OR REPLACE INTO repos
        (id, source, source_type, indexed_at, health_score, health_grade, file_count, function_count, issue_count, security_issue_count, circular_dep_count, session_id)
      VALUES (?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertFile = this.db.prepare(`
      INSERT OR REPLACE INTO files (repo_id, path, layer, lines, complexity, coupling_in, coupling_out, churn, health_grade, security_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertFn = this.db.prepare(`
      INSERT OR REPLACE INTO functions (repo_id, file_path, name, line, type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertEdge = this.db.prepare('INSERT INTO edges (repo_id, from_path, to_path, fn_name) VALUES (?, ?, ?, ?)');

    this.db.transaction(() => {
      upsertRepoStmt.run(id, result.source, result.sourceType,
        result.summary.healthScore, result.summary.healthGrade,
        result.summary.fileCount, result.summary.functionCount,
        result.summary.issueCount, result.summary.securityIssueCount,
        result.summary.circularDepCount, result.sessionId);
      this.db.prepare('DELETE FROM edges WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM functions WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM files WHERE repo_id = ?').run(id);
      for (const f of result.files) {
        const complexity = f.complexity ?? 1;
        const secJson = secByFile.has(f.path) ? JSON.stringify(secByFile.get(f.path)) : null;
        upsertFile.run(id, f.path, f.layer, f.lines, complexity, couplingIn.get(f.path) ?? 0, couplingOut.get(f.path) ?? 0, f.churn, gradeForComplexity(complexity), secJson);
        for (const fn of f.functions) {
          upsertFn.run(id, f.path, fn.name, fn.line, fn.type ?? 'function');
        }
      }
      for (const conn of result.connections) {
        insertEdge.run(id, conn.source, conn.target, conn.fn);
      }
    })();
  }

  indexProcesses(result: import('./types.js').AnalysisResult): void {
    doIndexProcesses(this.db, result);
  }

  private _query<T>(sql: string, params: unknown[], mapper: (row: any) => T): T[] {
    return (this.db.prepare(sql).all(...params) as any[]).map(mapper);
  }

  queryFiles(source: string, opts: { layer?: string; minComplexity?: number; limit?: number }): FileRecord[] {
    const id = repoId(source);
    let sql = 'SELECT * FROM files WHERE repo_id = ?';
    const params: unknown[] = [id];
    if (opts.layer) { sql += ' AND layer = ?'; params.push(opts.layer); }
    if (opts.minComplexity !== undefined) { sql += ' AND complexity >= ?'; params.push(opts.minComplexity); }
    sql += ' ORDER BY complexity DESC LIMIT ?';
    params.push(opts.limit ?? 100);
    return this._query(sql, params, row => ({
      repoId: row.repo_id, path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
    }));
  }

  queryFunctions(source: string, namePattern: string): FnRecord[] {
    const id = repoId(source);
    const escaped = namePattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
    return this._query(
      "SELECT * FROM functions WHERE repo_id = ? AND name LIKE ? ESCAPE '\\' LIMIT 50",
      [id, `%${escaped}%`],
      row => ({ repoId: row.repo_id, filePath: row.file_path, name: row.name, line: row.line, type: row.type }),
    );
  }

  getFnsInRange(repoId: string, filePath: string, startLine: number, endLine: number): FnRecord[] {
    return this._query(
      `SELECT repo_id, file_path, name, line, type FROM functions WHERE repo_id = ? AND file_path = ? AND line >= ? AND line <= ?`,
      [repoId, filePath, startLine, endLine],
      row => ({ repoId: row.repo_id, filePath: row.file_path, name: row.name, line: row.line, type: row.type }),
    );
  }

  getProcessesForFiles(repoId: string, filePaths: string[]): Array<{ process_name: string; entry_file: string; depth: number }> {
    if (filePaths.length === 0) return [];
    const placeholders = filePaths.map(() => '?').join(',');
    return this._query(
      `SELECT DISTINCT process_name, file_path AS entry_file, MIN(depth) AS depth FROM processes WHERE repo_id = ? AND file_path IN (${placeholders}) GROUP BY process_name ORDER BY depth`,
      [repoId, ...filePaths],
      row => ({ process_name: row.process_name, entry_file: row.entry_file, depth: row.depth }),
    );
  }

  getFileContext(source: string, filePath: string): {
    path: string; layer: string; lines: number; complexity: number;
    couplingIn: number; couplingOut: number; churn: number; healthGrade: string;
    dependents: string[]; dependencies: string[]; security: Array<{ severity: string; desc: string }>;
  } | null {
    const id = repoId(source);
    const row = this.db.prepare('SELECT * FROM files WHERE repo_id = ? AND path = ?').get(id, filePath) as any;
    if (!row) return null;
    const dependents = (this.db.prepare('SELECT DISTINCT from_path FROM edges WHERE repo_id = ? AND to_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.from_path);
    const dependencies = (this.db.prepare('SELECT DISTINCT to_path FROM edges WHERE repo_id = ? AND from_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.to_path);
    const security: Array<{ severity: string; desc: string }> = row.security_json ? JSON.parse(row.security_json) : [];
    return {
      path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
      dependents, dependencies, security,
    };
  }

  getFiles(repoId: string): FileRecord[] {
    return this._query('SELECT * FROM files WHERE repo_id = ? ORDER BY path', [repoId], row => ({
      repoId: row.repo_id, path: row.path, layer: row.layer ?? '', lines: row.lines ?? 0,
      complexity: row.complexity ?? 1, couplingIn: row.coupling_in ?? 0,
      couplingOut: row.coupling_out ?? 0, churn: row.churn ?? 0, healthGrade: row.health_grade ?? 'A',
    }));
  }

  getFnsForFile(repoId: string, filePath: string): FnRecord[] {
    return this._query(
      'SELECT * FROM functions WHERE repo_id = ? AND file_path = ? LIMIT 20',
      [repoId, filePath],
      row => ({ repoId: row.repo_id, filePath: row.file_path, name: row.name, line: row.line, type: row.type ?? 'function' }),
    );
  }

  listProcesses(repoId: string): Array<{ process_name: string; file_count: number; max_depth: number }> {
    return this._query(
      `SELECT process_name, COUNT(DISTINCT file_path) AS file_count, MAX(depth) AS max_depth FROM processes WHERE repo_id = ? GROUP BY process_name ORDER BY max_depth DESC`,
      [repoId],
      row => ({ process_name: row.process_name, file_count: row.file_count ?? 0, max_depth: row.max_depth ?? 0 }),
    );
  }

  getProcessSteps(repoId: string, processName: string): Array<{ file_path: string; fn_name: string; depth: number }> {
    return this._query(
      `SELECT file_path, fn_name, depth FROM processes WHERE repo_id = ? AND process_name = ? ORDER BY depth, file_path`,
      [repoId, processName],
      row => ({ file_path: row.file_path, fn_name: row.fn_name ?? '', depth: row.depth ?? 0 }),
    );
  }

  getDb(): Database.Database { return this.db; }

  close(): void {
    this.db.close();
  }
}
