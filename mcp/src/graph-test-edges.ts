import crypto from 'crypto';
import type { AnalysisResult } from './types.js';
import { esc } from './graph-utils.js';

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx|py|rb|java|go|rs|cs)$/i,
  /\btest_[^/]+\.(py|rb|go|rs|java)$/i,
  /[^/]+_test\.(go|rs|py|java)$/i,
  /\/__tests__\//,
  /\/tests?\//,
];

export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some(p => p.test(filePath));
}

export async function indexTestFileEdges(
  exec: (cypher: string) => Promise<void>,
  result: AnalysisResult,
  rid: string,
  fnByNameAndFile: Map<string, string>,
): Promise<void> {
  const testFiles = result.files.filter(f => isTestFile(f.path));
  if (testFiles.length === 0) return;

  const fileIdMap = new Map<string, string>();
  for (const f of result.files) {
    const fid = crypto.createHash('sha256').update(`${rid}:${f.path}`).digest('hex').slice(0, 16);
    fileIdMap.set(f.path, fid);
  }

  function resolveImport(importerPath: string, importSource: string): string | null {
    const dir = importerPath.split('/').slice(0, -1).join('/');
    const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of exts) {
      const candidate = `${dir}/${importSource}${ext}`.replace(/\/\.\//g, '/').replace(/^\//, '');
      const norm = candidate.startsWith('./') ? candidate.slice(2) : candidate;
      if (fileIdMap.has(norm)) return norm;
      if (fileIdMap.has(candidate)) return candidate;
    }
    return null;
  }

  // Build a local fnByNameAndFile that falls back to creating Function nodes
  // for source files whose functions weren't indexed by indexNodes (e.g. missing isCode flag).
  // We store these with repoId = result.source so callers can query by source name.
  const localFnMap = new Map<string, string>(fnByNameAndFile);
  for (const f of result.files) {
    if (isTestFile(f.path)) continue;
    for (const fn of (f.functions ?? [])) {
      const fnKey = `${fn.file ?? f.path}::${fn.name}`;
      if (!localFnMap.has(fnKey)) {
        const fnId = `${rid}:${f.path}:${fn.name}:${(fn as any).line ?? 0}`;
        try {
          await exec(
            `CREATE (:Function {id: '${esc(fnId)}', name: '${esc(fn.name)}', filePath: '${esc(f.path)}', repoId: '${esc(result.source)}', returnType: '', startLine: ${(fn as any).line ?? 0}, endLine: ${(fn as any).line ?? 0}})`
          );
        } catch { /* already exists */ }
        localFnMap.set(fnKey, fnId);
      }
    }
  }

  for (const f of testFiles) {
    const tfid = `tf_${crypto.createHash('sha256').update(`${rid}:${f.path}`).digest('hex').slice(0, 14)}`;
    try {
      await exec(`CREATE (:TestFile {id: '${esc(tfid)}', filePath: '${esc(f.path)}', repoId: '${rid}'})`);
    } catch { continue; }

    const testContent = (f.functions ?? [])
      .map(fn => ((fn as any).code ?? fn.name)).join(' ').toLowerCase();

    for (const imp of (f.imports ?? [])) {
      const importSource = (imp as any).source ?? (typeof imp === 'string' ? imp : null);
      if (!importSource) continue;
      const resolvedPath = resolveImport(f.path, importSource);
      if (!resolvedPath) continue;
      const targetFid = fileIdMap.get(resolvedPath);
      if (!targetFid) continue;

      try {
        await exec(`MATCH (tf:TestFile {id: '${esc(tfid)}'}), (fi:File {id: '${esc(targetFid)}'}) CREATE (tf)-[:TESTS {confidence: 0.9}]->(fi)`);
      } catch {}

      const srcFile = result.files.find(rf => rf.path === resolvedPath);
      for (const fn of (srcFile?.functions ?? [])) {
        const fnKey = `${fn.file ?? resolvedPath}::${fn.name}`;
        const fnId = localFnMap.get(fnKey);
        if (!fnId) continue;
        const nameLower = fn.name.toLowerCase();
        if (testContent.includes(nameLower)) {
          try {
            await exec(`MATCH (tf:TestFile {id: '${esc(tfid)}'}), (fn:Function {id: '${esc(fnId)}'}) CREATE (tf)-[:COVERS {confidence: 0.9}]->(fn)`);
          } catch {}
        }
      }
    }
  }
}
