import type { AnalysisResult } from './types.js';
import { esc, type WriteCypherFn, type ReadCypherFn } from './graph-utils.js';

const NEW_CALL_RE = /\bnew\s+(\w+)\s*\(/g;

async function linkConstructorCall(
  write: WriteCypherFn,
  readCypher: ReadCypherFn,
  ctorId: string,
  callerId: string,
  fileNodeId: string,
  className: string,
): Promise<void> {
  try {
    const rows = await readCypher(`MATCH (ctor:Constructor {id: '${esc(ctorId)}'}) RETURN ctor.id LIMIT 1`);
    if (rows.length === 0) return;
    await write(
      `MATCH (f:Function {id: '${esc(callerId)}'}), (fp:File {id: '${esc(fileNodeId)}'}) ` +
      `CREATE (f)-[:QUERIES {orm: 'constructor', model: '${esc(className)}', operation: 'new'}]->(fp)`,
    );
  } catch { /* Constructor not indexed — skip */ }
}

export async function indexConstructorInference(
  write: WriteCypherFn,
  readCypher: ReadCypherFn,
  result: AnalysisResult,
  rid: string,
  fnByNameAndFile: Map<string, string>,
): Promise<void> {
  const re = new RegExp(NEW_CALL_RE.source, NEW_CALL_RE.flags);
  for (const file of result.files) {
    if (!file.isCode) continue;
    for (const fn of file.functions) {
      if (!fn.code) continue;
      const callerId = fnByNameAndFile.get(`${file.path}::${fn.name}`);
      if (!callerId) continue;
      const fileNodeId = `${rid}:${file.path}`;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(fn.code)) !== null) {
        const ctorId = `${rid}:${file.path}:ctor:${m[1]}`;
        await linkConstructorCall(write, readCypher, ctorId, callerId, fileNodeId, m[1]);
      }
    }
  }
}
