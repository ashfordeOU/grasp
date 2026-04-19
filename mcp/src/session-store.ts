import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { AnalysisResult } from './types.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface SessionMeta {
  id: string;
  source: string;
  sourceType: string;
  analyzedAt: string;
  lastAccessed: string;
  sizeBytes: number;
  healthGrade: string;
  fileCount: number;
}

interface IndexFile {
  [id: string]: Omit<SessionMeta, 'id'>;
}

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid session id: "${id}"`);
  }
}

export class SessionStore {
  private dir: string;
  private indexPath: string;
  private memory = new Map<string, AnalysisResult>();
  private ttlMs: number;
  private maxSessions: number;

  constructor(
    dir = path.join(process.env.HOME || '~', '.grasp', 'sessions'),
    ttlDays = Number(process.env.GRASP_SESSION_TTL ?? 7),
    maxSessions = Number(process.env.GRASP_SESSION_LIMIT ?? 20),
  ) {
    this.dir = dir;
    this.indexPath = path.join(dir, 'index.json');
    this.ttlMs = ttlDays * 86_400_000;
    this.maxSessions = maxSessions;
    fs.mkdirSync(dir, { recursive: true });
  }

  async get(id: string): Promise<AnalysisResult | null> {
    if (!SAFE_ID_RE.test(id)) return null;

    if (this.memory.has(id)) {
      // Cache hit — do NOT touch the index; lastAccessed was set on disk load
      return this.memory.get(id)!;
    }
    const filePath = this.sessionPath(id);
    if (!fs.existsSync(filePath)) return null;
    try {
      const compressed = await fs.promises.readFile(filePath);
      const buf = await gunzip(compressed);
      const result: AnalysisResult = JSON.parse(buf.toString('utf8'));
      this.memory.set(id, result);
      await this.touchIndex(id);
      return result;
    } catch {
      // Corrupt file — remove it so it doesn't poison future lookups
      try { await fs.promises.unlink(filePath); } catch { /* ignore */ }
      const index = await this.readIndex();
      if (index[id]) {
        delete index[id];
        await this.writeIndex(index);
      }
      return null;
    }
  }

  async set(id: string, result: AnalysisResult): Promise<void> {
    validateId(id);

    this.memory.set(id, result);
    const json = JSON.stringify(result);
    const compressed = await gzip(json);
    await fs.promises.writeFile(this.sessionPath(id), compressed);
    const index = await this.readIndex();
    index[id] = {
      source: result.source,
      sourceType: result.sourceType,
      analyzedAt: result.analyzedAt,
      lastAccessed: new Date().toISOString(),
      sizeBytes: compressed.length,
      healthGrade: result.summary.healthGrade,
      fileCount: result.summary.fileCount,
    };
    await this.writeIndex(index);
    // Pass the already-built index so evict() doesn't re-read it
    await this.evict(index);
  }

  async list(): Promise<SessionMeta[]> {
    const index = await this.readIndex();
    return Object.entries(index).map(([id, meta]) => ({ id, ...meta }));
  }

  async delete(id: string): Promise<void> {
    validateId(id);

    this.memory.delete(id);
    const filePath = this.sessionPath(id);
    if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
    const index = await this.readIndex();
    delete index[id];
    await this.writeIndex(index);
  }

  private sessionPath(id: string): string {
    return path.join(this.dir, `${id}.json.gz`);
  }

  private async readIndex(): Promise<IndexFile> {
    try {
      const raw = await fs.promises.readFile(this.indexPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeIndex(index: IndexFile): Promise<void> {
    await fs.promises.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  private async touchIndex(id: string): Promise<void> {
    const index = await this.readIndex();
    if (index[id]) {
      index[id].lastAccessed = new Date().toISOString();
      await this.writeIndex(index);
    }
  }

  // Accept the already-built index to avoid a redundant re-read.
  // Deletes files in a loop but writes the index only once at the end.
  private async evict(index: IndexFile): Promise<void> {
    const entries = Object.entries(index);
    if (entries.length <= this.maxSessions) return;
    entries.sort((a, b) => a[1].lastAccessed.localeCompare(b[1].lastAccessed));
    const toDelete = entries.slice(0, entries.length - this.maxSessions);
    for (const [id] of toDelete) {
      this.memory.delete(id);
      const filePath = this.sessionPath(id);
      if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
      delete index[id];
    }
    await this.writeIndex(index);
  }

  async prune(): Promise<number> {
    const index = await this.readIndex();
    const now = Date.now();
    let pruned = 0;
    for (const [id, meta] of Object.entries(index)) {
      if (now - new Date(meta.analyzedAt).getTime() > this.ttlMs) {
        await this.delete(id);
        pruned++;
      }
    }
    return pruned;
  }
}
