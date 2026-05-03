import type { AnalysisResult } from './types.js';
import { esc, type WriteCypherFn } from './graph-utils.js';

// Re-exports of the heavier indexers, split into their own files so each
// piece stays under the critical-complexity threshold.
export { indexConstructorInference } from './graph-constructor-inference.js';
export { indexOrmEdges } from './graph-orm-edges.js';

async function indexConstructorNode(
  write: WriteCypherFn,
  file: AnalysisResult['files'][number],
  cls: { name: string; isAbstract: boolean; isExported: boolean },
  rid: string,
  clsId: string,
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
  rid: string,
  clsId: string,
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
  write: WriteCypherFn,
  result: AnalysisResult,
  classIds: Map<string, string>,
): Promise<void> {
  for (const file of result.files) {
    if (!file.isCode || !file.classes?.length) continue;
    const conf = (file.imports ?? []).length > 0 ? 0.9 : 0.5;
    for (const cls of file.classes) {
      const clsId = classIds.get(cls.name);
      if (!clsId || !cls.superClass) continue;
      const superClsId = classIds.get(cls.superClass);
      if (!superClsId || superClsId === clsId) continue;
      try {
        await write(`MATCH (a:Class {id: '${esc(clsId)}'}), (b:Class {id: '${esc(superClsId)}'}) CREATE (a)-[:EXTENDS {confidence: ${conf}}]->(b)`);
      } catch { /* skip */ }
    }
  }
}

export async function indexClassNodes(
  write: WriteCypherFn,
  result: AnalysisResult,
  rid: string,
  _fnByNameAndFile: Map<string, string>,
): Promise<void> {
  const classIds = new Map<string, string>();
  for (const file of result.files) {
    if (!file.isCode || !file.classes?.length) continue;
    for (const cls of file.classes) {
      const clsId = `${rid}:${file.path}:class:${cls.name}`;
      classIds.set(cls.name, clsId);
      try {
        await write(`CREATE (:Class {id: '${esc(clsId)}', name: '${esc(cls.name)}', filePath: '${esc(file.path)}', repoId: '${rid}', isAbstract: ${cls.isAbstract}, isExported: ${cls.isExported}})`);
      } catch { continue; }
      await indexConstructorNode(write, file, cls, rid, clsId);
      await indexMethodNodes(write, file, cls, rid, clsId);
    }
  }
  await indexInheritanceEdges(write, result, classIds);
}
