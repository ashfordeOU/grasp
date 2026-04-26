import type { AnalysisResult } from './types.js';
import { resolveCallTarget, buildScopeIndex } from './scope-resolver.js';
import { esc, type ExecFn } from './graph-utils.js';

export async function indexNodes(
  exec: ExecFn, result: AnalysisResult, rid: string,
): Promise<{
  allFunctions: Array<{ id: string; name: string; filePath: string; returnType: string; startLine: number; repoId: string }>;
  fnByNameAndFile: Map<string, string>;
  fnsByFile: Map<string, string[]>;
}> {
  const allFunctions: Array<{ id: string; name: string; filePath: string; returnType: string; startLine: number; repoId: string }> = [];
  for (const file of result.files) {
    if (!file.isCode) continue;
    const fileId = `${rid}:${file.path}`;
    await exec(`CREATE (:File {id: '${esc(fileId)}', path: '${esc(file.path)}', language: '${esc(file.path.split('.').pop() ?? '')}', repoId: '${rid}'})`);
    for (const fn of file.functions) {
      const fnId = `${rid}:${file.path}:${fn.name}:${fn.line}`;
      const returnType = fn.returnType ?? '';
      allFunctions.push({ id: fnId, name: fn.name, filePath: file.path, returnType, startLine: fn.line, repoId: rid });
      await exec(`CREATE (:Function {id: '${esc(fnId)}', name: '${esc(fn.name)}', filePath: '${esc(file.path)}', repoId: '${rid}', returnType: '${esc(returnType)}', startLine: ${fn.line}, endLine: ${fn.line}})`);
      await exec(`MATCH (f:File {id: '${esc(fileId)}'}), (fn:Function {id: '${esc(fnId)}'}) CREATE (f)-[:DEFINES]->(fn)`);
    }
  }
  const fnByNameAndFile = new Map<string, string>();
  const fnsByFile = new Map<string, string[]>();
  for (const fn of allFunctions) {
    fnByNameAndFile.set(`${fn.filePath}::${fn.name}`, fn.id);
    if (!fnsByFile.has(fn.filePath)) fnsByFile.set(fn.filePath, []);
    fnsByFile.get(fn.filePath)!.push(fn.id);
  }
  return { allFunctions, fnByNameAndFile, fnsByFile };
}

export async function indexImportEdges(exec: ExecFn, result: AnalysisResult, rid: string): Promise<void> {
  for (const file of result.files) {
    if (!file.isCode) continue;
    const fileId = `${rid}:${file.path}`;
    for (const imp of (file.imports ?? [])) {
      await exec(`MATCH (a:File {id: '${esc(fileId)}'}), (b:File {id: '${esc(`${rid}:${imp}`)}'}) WHERE a <> b CREATE (a)-[:IMPORTS]->(b)`);
    }
  }
}

export async function indexCallEdges(
  exec: ExecFn, result: AnalysisResult, rid: string,
  fnByNameAndFile: Map<string, string>, fnsByFile: Map<string, string[]>,
  scope: ReturnType<typeof buildScopeIndex>,
): Promise<void> {
  for (const connection of result.connections) {
    const calleeId = fnByNameAndFile.get(`${connection.source}::${connection.fn}`);
    if (!calleeId) continue;
    const confidence = resolveCallTarget(connection.target, connection.fn, scope)?.confidence ?? 0.5;
    for (const callerId of fnsByFile.get(connection.target) ?? []) {
      if (callerId === calleeId) continue;
      await exec(`MATCH (a:Function {id: '${esc(callerId)}'}), (b:Function {id: '${esc(calleeId)}'}) CREATE (a)-[:CALLS {count: ${connection.count}, confidence: ${confidence}}]->(b)`);
    }
  }
}

export async function indexReturnTypeEdges(
  exec: ExecFn,
  allFunctions: Array<{ id: string; returnType: string }>,
): Promise<void> {
  const byReturnType = new Map<string, string[]>();
  for (const fn of allFunctions) {
    if (!fn.returnType) continue;
    if (!byReturnType.has(fn.returnType)) byReturnType.set(fn.returnType, []);
    byReturnType.get(fn.returnType)!.push(fn.id);
  }
  for (const [typeName, ids] of byReturnType) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        await exec(`MATCH (a:Function {id: '${esc(ids[i])}'}), (b:Function {id: '${esc(ids[j])}'}) CREATE (a)-[:SAME_RETURN_TYPE {typeName: '${esc(typeName)}'}]->(b)`);
      }
    }
  }
}
