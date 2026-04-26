import type { AnalysisResult } from './types.js';
import { detectOrmQueries } from './orm-tracker.js';
import { esc, type WriteCypherFn, type ReadCypherFn } from './graph-utils.js';

export async function indexConstructorInference(
  write: WriteCypherFn, readCypher: ReadCypherFn, result: AnalysisResult, rid: string,
  fnByNameAndFile: Map<string, string>,
): Promise<void> {
  const newCallRe = /\bnew\s+(\w+)\s*\(/g;
  for (const file of result.files) {
    if (!file.isCode) continue;
    for (const fn of file.functions) {
      if (!fn.code) continue;
      const callerId = fnByNameAndFile.get(`${file.path}::${fn.name}`);
      if (!callerId) continue;
      const fileNodeId = `${rid}:${file.path}`;
      newCallRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = newCallRe.exec(fn.code)) !== null) {
        const className = m[1];
        const ctorId = `${rid}:${file.path}:ctor:${className}`;
        try {
          const rows = await readCypher(`MATCH (ctor:Constructor {id: '${esc(ctorId)}'}) RETURN ctor.id LIMIT 1`);
          if (rows.length > 0) await write(`MATCH (f:Function {id: '${esc(callerId)}'}), (fp:File {id: '${esc(fileNodeId)}'}) CREATE (f)-[:QUERIES {orm: 'constructor', model: '${esc(className)}', operation: 'new'}]->(fp)`);
        } catch { /* Constructor not indexed — skip */ }
      }
    }
  }
}

export async function indexOrmEdges(
  write: WriteCypherFn, result: AnalysisResult, rid: string,
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
      try { await write(`MATCH (f:Function {id: '${esc(fnId)}'}), (fp:File {id: '${esc(fileNodeId)}'}) CREATE (f)-[:QUERIES {orm: '${esc(oq.orm)}', model: '${esc(oq.model)}', operation: '${esc(oq.operation)}'}]->(fp)`); } catch { /* skip duplicates */ }
    }
  }
}

export async function indexClassNodes(
  write: WriteCypherFn, result: AnalysisResult, rid: string,
  fnByNameAndFile: Map<string, string>,
): Promise<void> {
  const classIds = new Map<string, string>();
  for (const file of result.files) {
    if (!file.isCode || !file.classes?.length) continue;
    for (const cls of file.classes) {
      const clsId = `${rid}:${file.path}:class:${cls.name}`;
      classIds.set(cls.name, clsId);
      try { await write(`CREATE (:Class {id: '${esc(clsId)}', name: '${esc(cls.name)}', filePath: '${esc(file.path)}', repoId: '${rid}', isAbstract: ${cls.isAbstract}, isExported: ${cls.isExported}})`); } catch { continue; }
      await indexConstructorNode(write, file, cls, rid, clsId);
      await indexMethodNodes(write, file, cls, rid, clsId);
    }
  }
  await indexInheritanceEdges(write, result, classIds);
}

async function indexConstructorNode(
  write: WriteCypherFn,
  file: AnalysisResult['files'][number],
  cls: { name: string; isAbstract: boolean; isExported: boolean },
  rid: string, clsId: string,
): Promise<void> {
  const ctorFn = file.functions.find(fn =>
    fn.isClassMethod && fn.className === cls.name &&
    (fn.type === 'constructor' || fn.name === 'constructor' || fn.name === '__init__')
  );
  if (!ctorFn) return;
  const ctorId = `${rid}:${file.path}:ctor:${cls.name}`;
  try {
    await write(`CREATE (:Constructor {id: '${esc(ctorId)}', filePath: '${esc(file.path)}', className: '${esc(cls.name)}', repoId: '${rid}', paramCount: 0})`);
    await write(`MATCH (c:Class {id: '${esc(clsId)}'}), (ctor:Constructor {id: '${esc(ctorId)}'}) CREATE (c)-[:HAS_CONSTRUCTOR {confidence: 1.0}]->(ctor)`);
  } catch { /* skip if already exists */ }
}

async function indexMethodNodes(
  write: WriteCypherFn,
  file: AnalysisResult['files'][number],
  cls: { name: string; methods: string[] },
  rid: string, clsId: string,
): Promise<void> {
  for (const methodName of cls.methods) {
    if (methodName === 'constructor' || methodName === '__init__') continue;
    const mFn = file.functions.find(fn => fn.name === methodName && fn.isClassMethod && fn.className === cls.name);
    if (!mFn) continue;
    const methodId = `${rid}:${file.path}:method:${cls.name}:${methodName}`;
    const isStatic = mFn.type === 'static_method' || (mFn.decorators ?? []).includes('staticmethod');
    try {
      await write(`CREATE (:Method {id: '${esc(methodId)}', name: '${esc(methodName)}', filePath: '${esc(file.path)}', className: '${esc(cls.name)}', repoId: '${rid}', startLine: ${mFn.line}, endLine: ${mFn.line}, returnType: '${esc(mFn.returnType ?? '')}', paramCount: 0, isStatic: ${isStatic}})`);
      await write(`MATCH (c:Class {id: '${esc(clsId)}'}), (m:Method {id: '${esc(methodId)}'}) CREATE (c)-[:HAS_METHOD {confidence: 1.0}]->(m)`);
      await write(`MATCH (m:Method {id: '${esc(methodId)}'}), (c:Class {id: '${esc(clsId)}'}) CREATE (m)-[:MEMBER_OF {confidence: 1.0}]->(c)`);
    } catch { /* skip on duplicate */ }
  }
}

async function indexInheritanceEdges(
  write: WriteCypherFn, result: AnalysisResult, classIds: Map<string, string>,
): Promise<void> {
  for (const file of result.files) {
    if (!file.isCode || !file.classes?.length) continue;
    const conf = (file.imports ?? []).length > 0 ? 0.9 : 0.5;
    for (const cls of file.classes) {
      const clsId = classIds.get(cls.name);
      if (!clsId || !cls.superClass) continue;
      const superClsId = classIds.get(cls.superClass);
      if (!superClsId || superClsId === clsId) continue;
      try { await write(`MATCH (a:Class {id: '${esc(clsId)}'}), (b:Class {id: '${esc(superClsId)}'}) CREATE (a)-[:EXTENDS {confidence: ${conf}}]->(b)`); } catch { /* skip */ }
    }
  }
}
