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

  close(): void {
    this.db.close();
  }
}
