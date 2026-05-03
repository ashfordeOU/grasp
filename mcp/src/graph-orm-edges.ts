import type { AnalysisResult } from './types.js';
import { detectOrmQueries } from './orm-tracker.js';
import { esc, type WriteCypherFn } from './graph-utils.js';

export async function indexOrmEdges(
  write: WriteCypherFn,
  result: AnalysisResult,
  rid: string,
  fnByNameAndFile: Map<string, string>,
): Promise<void> {
  for (const file of result.files) {
    if (!file.isCode || !file.content) continue;
    const ormQueries = detectOrmQueries(file.path, file.content);
    if (ormQueries.length === 0) continue;
    const fileNodeId = `${rid}:${file.path}`;
    for (const oq of ormQueries) {
      const fn = file.functions.find(f => f.line <= oq.line && (f.line + 50) >= oq.line);
      if (!fn) continue;
      const fnId = fnByNameAndFile.get(`${file.path}::${fn.name}`);
      if (!fnId) continue;
      try {
        await write(
          `MATCH (f:Function {id: '${esc(fnId)}'}), (fp:File {id: '${esc(fileNodeId)}'}) ` +
          `CREATE (f)-[:QUERIES {orm: '${esc(oq.orm)}', model: '${esc(oq.model)}', operation: '${esc(oq.operation)}'}]->(fp)`,
        );
      } catch { /* skip duplicates */ }
    }
  }
}
