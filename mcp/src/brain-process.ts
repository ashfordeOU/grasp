import type Database from 'better-sqlite3';
import type { AnalysisResult } from './types.js';
import { makeRepoId } from './brain.js';

function buildAdjacency(connections: Array<{ source: string; target: string }>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const c of connections) {
    if (!adj.has(c.source)) adj.set(c.source, new Set());
    adj.get(c.source)!.add(c.target);
  }
  return adj;
}

function bfsProcess(
  db: Database.Database, id: string, entry: string,
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

export function indexProcesses(db: Database.Database, result: AnalysisResult): void {
  const id = makeRepoId(result.source);
  const ENTRY_RE = /(?:^|[/\\])(?:index|main|app|server|cli|run)\.[jt]sx?$/i;
  const entryFiles = result.files.filter(f => ENTRY_RE.test(f.path)).map(f => f.path);
  if (entryFiles.length === 0) return;
  const adjOut = buildAdjacency(result.connections);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO processes (repo_id, process_name, file_path, fn_name, depth) VALUES (?, ?, ?, ?, ?)',
  );
  const fileMap = new Map(result.files.map(f => [f.path, f]));
  db.transaction(() => {
    db.prepare('DELETE FROM processes WHERE repo_id = ?').run(id);
    for (const entry of entryFiles) {
      bfsProcess(db, id, entry, adjOut, fileMap, insert);
    }
  })();
}
