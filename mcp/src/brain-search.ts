import crypto from 'crypto';
import { BrainStore, makeRepoId } from './brain.js';

function rrfMerge(
  bm25: Array<{ filePath: string; fnName: string }>,
  vec: Array<{ filePath: string; fnName: string }>,
  k = 60,
): Map<string, number> {
  const key = (fp: string, fn: string) => fp + '::' + fn;
  const scores = new Map<string, number>();
  bm25.forEach((r, i) => { const k_ = key(r.filePath, r.fnName); scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1)); });
  vec.forEach((r, i) => { const k_ = key(r.filePath, r.fnName); scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1)); });
  return scores;
}

export class SearchableBrainStore extends BrainStore {
  indexFts(result: import('./types.js').AnalysisResult): void {
    const id = makeRepoId(result.source);
    const db = this.getDb();
    const insert = db.prepare('INSERT INTO fts_idx (file_path, fn_name, body) VALUES (?, ?, ?)');
    db.transaction(() => {
      const existing = db.prepare('SELECT rowid FROM fts_idx WHERE file_path LIKE ?').all(id + ':%') as { rowid: number }[];
      const del = db.prepare('DELETE FROM fts_idx WHERE rowid = ?');
      for (const row of existing) del.run(row.rowid);
      for (const f of result.files) {
        insert.run(id + ':' + f.path, '', [f.name, f.layer, f.path.replace(/[/_-]/g, ' ')].join(' '));
        for (const fn of f.functions) {
          insert.run(id + ':' + f.path, fn.name, [fn.name, f.name, f.layer, fn.type ?? ''].join(' '));
        }
      }
    })();
  }

  async indexEmbeddings(result: import('./types.js').AnalysisResult): Promise<void> {
    const { embed, vecToBlob } = await import('./embed.js');
    const id = makeRepoId(result.source);
    const db = this.getDb();
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO embeddings (repo_id, file_path, fn_name, content_hash, vector) VALUES (?, ?, ?, ?, ?)',
    );
    const existing = new Map<string, string>();
    const rows = db.prepare(
      'SELECT file_path, fn_name, content_hash FROM embeddings WHERE repo_id = ?',
    ).all(id) as { file_path: string; fn_name: string; content_hash: string }[];
    for (const r of rows) existing.set(r.file_path + ':' + r.fn_name, r.content_hash);
    for (const f of result.files) {
      for (const fn of f.functions) {
        const text = `${fn.name} ${fn.type ?? 'function'} in ${f.name} ${f.layer}`;
        const hash = crypto.createHash('sha1').update(text).digest('hex');
        const key = (id + ':' + f.path) + ':' + fn.name;
        if (existing.get(key) === hash) continue;
        const vec = await embed(text);
        if (!vec) continue;
        upsert.run(id, id + ':' + f.path, fn.name, hash, vecToBlob(vec));
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
    const tokens = safe.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const ftsQuery = `file_path : ${repoId}* AND (${tokens.join(' OR ')})`;
    try {
      const rows = this.getDb().prepare(`
        SELECT file_path, fn_name, bm25(fts_idx) AS score
        FROM fts_idx
        WHERE fts_idx MATCH ?
        ORDER BY bm25(fts_idx)
        LIMIT ?
      `).all(ftsQuery, limit) as { file_path: string; fn_name: string; score: number }[];
      return rows
        .filter(r => r.file_path.startsWith(prefix))
        .slice(0, limit)
        .map(r => ({ filePath: r.file_path.slice(prefix.length), fnName: r.fn_name, score: -r.score }));
    } catch {
      return [];
    }
  }

  async vectorSearch(repoId: string, queryVec: Float32Array, limit = 20): Promise<Array<{ filePath: string; fnName: string; score: number }>> {
    const { cosine, blobToVec } = await import('./embed.js');
    const rows = this.getDb().prepare(
      'SELECT file_path, fn_name, vector FROM embeddings WHERE repo_id = ?',
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
    const rows = this.getDb().prepare(
      'SELECT file_path, fn_name, process_name FROM processes WHERE repo_id = ?',
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
      ? (this.getDb().prepare(
          `SELECT path, layer, complexity FROM files WHERE repo_id = ? AND path IN (${filePaths.map(() => '?').join(',')})`,
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
}
