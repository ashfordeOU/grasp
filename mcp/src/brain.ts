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
    return (this.db.prepare('SELECT * FROM repos ORDER BY indexed_at DESC').all() as any[]).map(row => ({
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

    const couplingIn = new Map<string, number>();
    const couplingOut = new Map<string, number>();
    for (const conn of result.connections) {
      couplingIn.set(conn.target, (couplingIn.get(conn.target) ?? 0) + 1);
      couplingOut.set(conn.source, (couplingOut.get(conn.source) ?? 0) + 1);
    }

    const gradeForComplexity = (c: number): string => {
      if (c >= 30) return 'F';
      if (c >= 20) return 'D';
      if (c >= 10) return 'C';
      if (c >= 5) return 'B';
      return 'A';
    };

    const secByFile = new Map<string, Array<{ severity: string; desc: string }>>();
    for (const sec of result.security) {
      if (!secByFile.has(sec.file)) secByFile.set(sec.file, []);
      secByFile.get(sec.file)!.push({ severity: sec.severity, desc: sec.desc });
    }

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

    // Build adjacency: file → files it imports (from connections)
    const adjOut = new Map<string, Set<string>>();
    for (const c of result.connections) {
      if (!adjOut.has(c.source)) adjOut.set(c.source, new Set());
      adjOut.get(c.source)!.add(c.target);
    }

    this.db.prepare("DELETE FROM processes WHERE repo_id = ?").run(id);
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO processes (repo_id, process_name, file_path, fn_name, depth) VALUES (?, ?, ?, ?, ?)"
    );

    this.db.transaction(() => {
      for (const entry of entryFiles) {
        const processName = entry.replace(/.*[/\\]/, '').replace(/\.[jt]sx?$/, '');
        const visited = new Set<string>();
        const queue: { file: string; depth: number }[] = [{ file: entry, depth: 0 }];
        while (queue.length > 0) {
          const { file, depth } = queue.shift()!;
          if (visited.has(file) || depth > 8) continue;
          visited.add(file);
          insert.run(id, processName, id + ':' + file, '', depth);
          // Tag all functions in this file
          const fileObj = result.files.find(f => f.path === file);
          if (fileObj) {
            for (const fn of fileObj.functions) {
              insert.run(id, processName, id + ':' + file, fn.name, depth);
            }
          }
          for (const next of adjOut.get(file) ?? []) {
            if (!visited.has(next)) queue.push({ file: next, depth: depth + 1 });
          }
        }
      }
    })();
  }

  queryFiles(source: string, opts: { layer?: string; minComplexity?: number; limit?: number }): FileRecord[] {
    const id = repoId(source);
    let sql = 'SELECT * FROM files WHERE repo_id = ?';
    const params: unknown[] = [id];
    if (opts.layer) { sql += ' AND layer = ?'; params.push(opts.layer); }
    if (opts.minComplexity !== undefined) { sql += ' AND complexity >= ?'; params.push(opts.minComplexity); }
    sql += ' ORDER BY complexity DESC LIMIT ?';
    params.push(opts.limit ?? 100);
    return (this.db.prepare(sql).all(...params) as any[]).map(row => ({
      repoId: row.repo_id, path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
    }));
  }

  queryFunctions(source: string, namePattern: string): FnRecord[] {
    const id = repoId(source);
    const escaped = namePattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
    return (this.db.prepare("SELECT * FROM functions WHERE repo_id = ? AND name LIKE ? ESCAPE '\\' LIMIT 50").all(id, `%${escaped}%`) as any[]).map(row => ({
      repoId: row.repo_id, filePath: row.file_path, name: row.name, line: row.line, type: row.type,
    }));
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

  getDb(): Database.Database { return this.db; }

  close(): void {
    this.db.close();
  }
}
