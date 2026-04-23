import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DB_PATH = process.env.GRASP_DB ?? path.join(os.homedir(), '.grasp', 'sessions.db');

export class SessionStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repo TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER,
      data BLOB
    )`);
  }

  async get(id: string): Promise<any | null> {
    const row = this.db.prepare('SELECT data FROM sessions WHERE id = ? AND expires_at > unixepoch()').get(id) as any;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async set(id: string, data: any, ttlDays = 30): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86400;
    const repo = data.repo ?? data.source ?? '';
    this.db.prepare('INSERT OR REPLACE INTO sessions (id, repo, expires_at, data) VALUES (?, ?, ?, ?)').run(id, repo, expiresAt, JSON.stringify(data));
  }

  async list(): Promise<Array<{ id: string; repo: string; created_at: number }>> {
    return this.db.prepare('SELECT id, repo, created_at FROM sessions WHERE expires_at > unixepoch() ORDER BY created_at DESC').all() as any[];
  }

  async prune(): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()').run();
  }
}
