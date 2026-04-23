import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DEFAULT_DB_DIR = path.join(os.homedir(), '.grasp');

function validateId(id: string): void {
  if (/[\/\\\x00]/.test(id)) throw new Error(`Invalid session id: ${id}`);
}

export class SessionStore {
  private db: Database.Database;
  private ttlDays: number;
  private maxSessions: number;

  constructor(dbDir?: string, ttlDays = 30, maxSessions = 0) {
    const dir = dbDir ?? (process.env.GRASP_DB ? path.dirname(process.env.GRASP_DB) : DEFAULT_DB_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = dbDir ? path.join(dir, 'sessions.db') : (process.env.GRASP_DB ?? path.join(DEFAULT_DB_DIR, 'sessions.db'));
    this.db = new Database(dbPath);
    this.ttlDays = ttlDays;
    this.maxSessions = maxSessions;
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repo TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER,
      data BLOB
    )`);
  }

  async get(id: string): Promise<any | null> {
    if (/[\/\\\x00]/.test(id)) return null;
    const row = this.db.prepare('SELECT data FROM sessions WHERE id = ? AND expires_at > unixepoch()').get(id) as any;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async set(id: string, data: any): Promise<void> {
    validateId(id);
    const expiresAt = Math.floor(Date.now() / 1000) + this.ttlDays * 86400;
    const repo = data.repo ?? data.source ?? '';
    this.db.prepare('INSERT OR REPLACE INTO sessions (id, repo, expires_at, data) VALUES (?, ?, ?, ?)').run(id, repo, expiresAt, JSON.stringify(data));
    if (this.maxSessions > 0) this._evictOverLimit();
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  async list(): Promise<Array<{ id: string; repo: string; created_at: number }>> {
    return this.db.prepare('SELECT id, repo, created_at FROM sessions WHERE expires_at > unixepoch() ORDER BY created_at DESC').all() as any[];
  }

  async prune(): Promise<number> {
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()').run();
    return result.changes;
  }

  /** Exposed for tests — force a session's expires_at into the past */
  _expireNow(id: string): void {
    this.db.prepare('UPDATE sessions SET expires_at = 0 WHERE id = ?').run(id);
  }

  private _evictOverLimit(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as n FROM sessions').get() as any).n;
    if (count > this.maxSessions) {
      const oldest = this.db.prepare('SELECT id FROM sessions ORDER BY created_at ASC LIMIT ?').all(count - this.maxSessions) as any[];
      const del = this.db.prepare('DELETE FROM sessions WHERE id = ?');
      for (const row of oldest) del.run(row.id);
    }
  }
}
