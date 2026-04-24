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

function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
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
    const id = this.upsertRepo({
      source: result.source,
      sourceType: result.sourceType,
      healthScore: result.summary.healthScore,
      healthGrade: result.summary.healthGrade,
      fileCount: result.summary.fileCount,
      functionCount: result.summary.functionCount,
      issueCount: result.summary.issueCount,
      securityIssueCount: result.summary.securityIssueCount,
      circularDepCount: result.summary.circularDepCount,
      sessionId: result.sessionId,
    });

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

    const upsertFile = this.db.prepare(`
      INSERT OR REPLACE INTO files (repo_id, path, layer, lines, complexity, coupling_in, coupling_out, churn, health_grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertFn = this.db.prepare(`
      INSERT OR REPLACE INTO functions (repo_id, file_path, name, line, type)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM files WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM functions WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM edges WHERE repo_id = ?').run(id);
      for (const f of result.files) {
        const complexity = f.complexity ?? 1;
        upsertFile.run(id, f.path, f.layer, f.lines, complexity, couplingIn.get(f.path) ?? 0, couplingOut.get(f.path) ?? 0, f.churn, gradeForComplexity(complexity));
        for (const fn of f.functions) {
          upsertFn.run(id, f.path, fn.name, fn.line, fn.type ?? 'function');
        }
      }
    })();

    const insertEdge = this.db.prepare('INSERT INTO edges (repo_id, from_path, to_path, fn_name) VALUES (?, ?, ?, ?)');
    this.db.transaction(() => {
      for (const conn of result.connections) {
        insertEdge.run(id, conn.source, conn.target, conn.fn);
      }
    })();

    // Store security findings on file rows
    const secByFile = new Map<string, Array<{ severity: string; desc: string }>>();
    for (const sec of result.security) {
      if (!secByFile.has(sec.file)) secByFile.set(sec.file, []);
      secByFile.get(sec.file)!.push({ severity: sec.severity, desc: sec.desc });
    }
    if (secByFile.size > 0) {
      const updateSec = this.db.prepare('UPDATE files SET security_json = ? WHERE repo_id = ? AND path = ?');
      this.db.transaction(() => {
        for (const [fp, secs] of secByFile) updateSec.run(JSON.stringify(secs), id, fp);
      })();
    }
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
    return (this.db.prepare('SELECT * FROM functions WHERE repo_id = ? AND name LIKE ? LIMIT 50').all(id, `%${namePattern}%`) as any[]).map(row => ({
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
    const dependents = (this.db.prepare('SELECT DISTINCT to_path FROM edges WHERE repo_id = ? AND from_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.to_path);
    const dependencies = (this.db.prepare('SELECT DISTINCT from_path FROM edges WHERE repo_id = ? AND to_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.from_path);
    const security: Array<{ severity: string; desc: string }> = row.security_json ? JSON.parse(row.security_json) : [];
    return {
      path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
      dependents, dependencies, security,
    };
  }

  close(): void {
    this.db.close();
  }
}
