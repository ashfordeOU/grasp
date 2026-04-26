import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';

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

function buildAdjacency(connections: Array<{ source: string; target: string }>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const c of connections) {
    if (!adj.has(c.source)) adj.set(c.source, new Set());
    adj.get(c.source)!.add(c.target);
  }
  return adj;
}

function rrfMerge(
  bm25: Array<{ filePath: string; fnName: string }>,
  vec: Array<{ filePath: string; fnName: string }>,
  k = 60,
): Map<string, number> {
  const key = (fp: string, fn: string) => fp + '::' + fn;
  const scores = new Map<string, number>();
  bm25.forEach((r, i) => { const k_ = key(r.filePath, r.fnName); scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1)); });
  vec.forEach((r, i)  => { const k_ = key(r.filePath, r.fnName); scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1)); });
  return scores;
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

  indexFts(result: import('./types.js').AnalysisResult): void {
    const id = makeRepoId(result.source);
    const insert = this.db.prepare(
      "INSERT INTO fts_idx (file_path, fn_name, body) VALUES (?, ?, ?)"
    );
    this.db.transaction(() => {
      // Delete previous entries for this repo (file_path starts with repoId+':')
      const existing = this.db.prepare(
        "SELECT rowid FROM fts_idx WHERE file_path LIKE ?"
      ).all(id + ':%') as { rowid: number }[];
      const del = this.db.prepare("DELETE FROM fts_idx WHERE rowid = ?");
      for (const row of existing) del.run(row.rowid);
      // Insert new entries
      for (const f of result.files) {
        // File-level entry
        insert.run(
          id + ':' + f.path,
          '',
          [f.name, f.layer, f.path.replace(/[/_-]/g, ' ')].join(' ')
        );
        // Per-function entries
        for (const fn of f.functions) {
          insert.run(
            id + ':' + f.path,
            fn.name,
            [fn.name, f.name, f.layer, fn.type ?? ''].join(' ')
          );
        }
      }
    })();
  }

  async indexEmbeddings(result: import('./types.js').AnalysisResult): Promise<void> {
    const { embed, vecToBlob } = await import('./embed.js');
    const id = makeRepoId(result.source);
    const upsert = this.db.prepare(
      "INSERT OR REPLACE INTO embeddings (repo_id, file_path, fn_name, content_hash, vector) VALUES (?, ?, ?, ?, ?)"
    );
    const existing = new Map<string, string>();
    const rows = this.db.prepare(
      "SELECT file_path, fn_name, content_hash FROM embeddings WHERE repo_id = ?"
    ).all(id) as { file_path: string; fn_name: string; content_hash: string }[];
    for (const r of rows) existing.set(r.file_path + ':' + r.fn_name, r.content_hash);

    for (const f of result.files) {
      for (const fn of f.functions) {
        const text = `${fn.name} ${fn.type ?? 'function'} in ${f.name} ${f.layer}`;
        const hash = crypto.createHash('sha1').update(text).digest('hex');
        const key = (id + ':' + f.path) + ':' + fn.name;
        if (existing.get(key) === hash) continue; // unchanged — skip re-embedding
        const vec = await embed(text);
        if (!vec) continue;
        upsert.run(id, id + ':' + f.path, fn.name, hash, vecToBlob(vec));
      }
    }
  }

  indexProcesses(result: import('./types.js').AnalysisResult): void {
    const id = makeRepoId(result.source);
    const ENTRY_RE = /(?:^|[/\\])(?:index|main|app|server|cli|run)\.[jt]sx?$/i;
    const entryFiles = result.files.filter(f => ENTRY_RE.test(f.path)).map(f => f.path);
    if (entryFiles.length === 0) return;
    const adjOut = buildAdjacency(result.connections);
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO processes (repo_id, process_name, file_path, fn_name, depth) VALUES (?, ?, ?, ?, ?)"
    );
    const fileMap = new Map(result.files.map(f => [f.path, f]));
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM processes WHERE repo_id = ?").run(id);
      for (const entry of entryFiles) {
        this._bfsProcess(id, entry, adjOut, fileMap, insert);
      }
    })();
  }

  private _query<T>(sql: string, params: unknown[], mapper: (row: any) => T): T[] {
    return (this.db.prepare(sql).all(...params) as any[]).map(mapper);
  }

  private _bfsProcess(
    id: string, entry: string,
    adjOut: Map<string, Set<string>>,
    fileMap: Map<string, { functions: Array<{ name: string }> }>,
    insert: Database.Statement,
  ): void {
    const processName = entry.replace(/.*[/\\]/, '').replace(/\.[jt]sx?$/, '');
    const visited = new Set<string>([entry]);
    const queue: { file: string; depth: number }[] = [{ file: entry, depth: 0 }];
    while (queue.length > 0) {
      const { file, depth } = queue.shift()!;
      if (depth > 8) continue;
      insert.run(id, processName, id + ':' + file, '', depth);
      const fileObj = fileMap.get(file);
      if (fileObj) {
        for (const fn of fileObj.functions) insert.run(id, processName, id + ':' + file, fn.name, depth);
      }
      for (const next of adjOut.get(file) ?? []) {
        if (!visited.has(next)) { visited.add(next); queue.push({ file: next, depth: depth + 1 }); }
      }
    }
  }

  bm25Search(repoId: string, query: string, limit = 20): Array<{ filePath: string; fnName: string; score: number }> {
    const prefix = repoId + ':';
    const safe = query
      .replace(/['"*^(){}\[\]-]/g, ' ')
      .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
      .trim();
    if (!safe) return [];
    // Build token query from safe string
    const tokens = safe.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const tokenQuery = tokens.join(' OR ');
    const ftsQuery = `file_path : ${repoId}* AND (${tokenQuery})`;

    try {
      const rows = this.db.prepare(`
        SELECT file_path, fn_name, bm25(fts_idx) AS score
        FROM fts_idx
        WHERE fts_idx MATCH ?
        ORDER BY bm25(fts_idx)
        LIMIT ?
      `).all(ftsQuery, limit) as { file_path: string; fn_name: string; score: number }[];
      return rows
        .filter(r => r.file_path.startsWith(prefix))  // keep as safety net
        .slice(0, limit)
        .map(r => ({
          filePath: r.file_path.slice(prefix.length),
          fnName: r.fn_name,
          score: -r.score,
        }));
    } catch {
      return [];
    }
  }

  async vectorSearch(repoId: string, queryVec: Float32Array, limit = 20): Promise<Array<{ filePath: string; fnName: string; score: number }>> {
    const { cosine, blobToVec } = await import('./embed.js');
    const rows = this.db.prepare(
      "SELECT file_path, fn_name, vector FROM embeddings WHERE repo_id = ?"
    ).all(repoId) as { file_path: string; fn_name: string; vector: Buffer }[];
    const prefix = repoId + ':';
    const scored = rows.map(r => ({
      filePath: r.file_path.startsWith(prefix) ? r.file_path.slice(prefix.length) : r.file_path,
      fnName: r.fn_name,
      score: cosine(queryVec, blobToVec(r.vector)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async hybridSearch(source: string, query: string, limit = 20): Promise<Array<{
    filePath: string; fnName: string; score: number;
    processes: string[]; layer: string; complexity: number;
  }>> {
    const id = makeRepoId(source);
    const bm25 = this.bm25Search(id, query, limit * 2);
    const { embed } = await import('./embed.js');
    const queryVec = await embed(query);
    const vec = queryVec ? await this.vectorSearch(id, queryVec, limit * 2) : [];
    const scores = rrfMerge(bm25, vec);
    const key = (fp: string, fn: string) => fp + '::' + fn;
    const seen = new Set<string>();
    const all = [...bm25, ...vec].filter(r => {
      const k_ = key(r.filePath, r.fnName);
      if (seen.has(k_)) return false;
      seen.add(k_);
      return true;
    });
    all.sort((a, b) => (scores.get(key(b.filePath, b.fnName)) ?? 0) - (scores.get(key(a.filePath, a.fnName)) ?? 0));
    return this._enrichHybridResults(id, all.slice(0, limit), scores, key);
  }

  private _buildProcessMap(id: string): Map<string, Set<string>> {
    const prefix = id + ':';
    const key = (fp: string, fn: string) => fp + '::' + fn;
    const rows = this.db.prepare(
      "SELECT file_path, fn_name, process_name FROM processes WHERE repo_id = ?"
    ).all(id) as { file_path: string; fn_name: string; process_name: string }[];
    const processMap = new Map<string, Set<string>>();
    for (const r of rows) {
      const fp = r.file_path.startsWith(prefix) ? r.file_path.slice(prefix.length) : r.file_path;
      const k_ = key(fp, r.fn_name);
      if (!processMap.has(k_)) processMap.set(k_, new Set());
      processMap.get(k_)!.add(r.process_name);
    }
    return processMap;
  }

  private _enrichHybridResults(
    id: string,
    topResults: Array<{ filePath: string; fnName: string }>,
    scores: Map<string, number>,
    key: (fp: string, fn: string) => string,
  ): Array<{ filePath: string; fnName: string; score: number; processes: string[]; layer: string; complexity: number }> {
    const processMap = this._buildProcessMap(id);
    const filePaths = topResults.map(r => r.filePath);
    const fileRows = filePaths.length > 0
      ? (this.db.prepare(
          `SELECT path, layer, complexity FROM files WHERE repo_id = ? AND path IN (${filePaths.map(() => '?').join(',')})`
        ).all(id, ...filePaths) as { path: string; layer: string; complexity: number }[])
      : [];
    const fileRowMap = new Map(fileRows.map(r => [r.path, r]));
    return topResults.map(r => {
      const fileRow = fileRowMap.get(r.filePath);
      return {
        filePath: r.filePath, fnName: r.fnName,
        score: scores.get(key(r.filePath, r.fnName)) ?? 0,
        processes: [...(processMap.get(key(r.filePath, r.fnName)) ?? new Set())],
        layer: fileRow?.layer ?? 'unknown',
        complexity: fileRow?.complexity ?? 0,
      };
    });
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
