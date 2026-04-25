import type { AnalyzedFile } from './types.js';

export interface ResolvedSymbol {
  id: string;
  confidence: number;
  tier: 1 | 2 | 3;
}

export interface ScopeIndex {
  fileExports: Map<string, Map<string, string>>;
  namedImports: Map<string, Map<string, { sourceFile: string; symbolId: string }>>;
  globalIndex: Map<string, string[]>;
}

export function buildScopeIndex(
  files: AnalyzedFile[],
  fnIds: Map<string, string>,  // "filePath::fnName" → kuzu node id
): ScopeIndex {
  const fileExports = new Map<string, Map<string, string>>();
  const globalIndex = new Map<string, string[]>();

  for (const file of files) {
    if (!file.isCode) continue;
    const exports = new Map<string, string>();
    for (const fn of file.functions) {
      if (!fn.isExported) continue;
      const id = fnIds.get(`${file.path}::${fn.name}`);
      if (!id) continue;
      exports.set(fn.name, id);
      const g = globalIndex.get(fn.name) ?? [];
      g.push(id);
      globalIndex.set(fn.name, g);
    }
    fileExports.set(file.path, exports);
  }

  // Tier 2: named imports
  const namedImports = new Map<string, Map<string, { sourceFile: string; symbolId: string }>>();
  for (const file of files) {
    if (!file.isCode || !file.imports) continue;
    const importMap = new Map<string, { sourceFile: string; symbolId: string }>();
    for (const imp of file.imports) {
      const sourceExports = fileExports.get(imp);
      if (!sourceExports) continue;
      for (const [name, id] of sourceExports) {
        importMap.set(name, { sourceFile: imp, symbolId: id });
      }
    }
    namedImports.set(file.path, importMap);
  }

  return { fileExports, namedImports, globalIndex };
}

export function resolveCallTarget(
  callerFile: string,
  calledName: string,
  scope: ScopeIndex,
): ResolvedSymbol | null {
  // Tier 1: same file export
  const sameFile = scope.fileExports.get(callerFile)?.get(calledName);
  if (sameFile) return { id: sameFile, confidence: 0.95, tier: 1 };

  // Tier 2: named import from an explicitly imported file
  const namedImport = scope.namedImports.get(callerFile)?.get(calledName);
  if (namedImport) return { id: namedImport.symbolId, confidence: 0.90, tier: 2 };

  // Tier 3: global fallback (only when exactly one candidate)
  const globals = scope.globalIndex.get(calledName);
  if (globals?.length === 1) return { id: globals[0], confidence: 0.50, tier: 3 };

  return null;
}
