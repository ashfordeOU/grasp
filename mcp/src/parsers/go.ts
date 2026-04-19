export interface GoImport { path: string; alias?: string; stdlib: boolean; internal: boolean; localPath?: string; }
export interface GoParseResult { imports: GoImport[]; packageName: string; }

function isStdlib(p: string): boolean { return !p.split('/')[0].includes('.'); }

function buildImport(importPath: string, alias: string | undefined, moduleName?: string): GoImport {
  const stdlib = isStdlib(importPath);
  let internal = false; let localPath: string | undefined;
  if (moduleName && importPath.startsWith(moduleName + '/')) { internal = true; localPath = importPath.slice(moduleName.length + 1); }
  return { path: importPath, ...(alias ? { alias } : {}), stdlib, internal, ...(localPath ? { localPath } : {}) };
}

export function parseGoImports(source: string, _filePath: string, moduleName?: string): GoParseResult {
  const imports: GoImport[] = [];
  const pkgMatch = source.match(/^package\s+(\w+)/m);
  const packageName = pkgMatch?.[1] ?? '';
  const singleRe = /^import\s+(?:(\w+)\s+)?"([^"]+)"/gm;
  for (const m of source.matchAll(singleRe)) imports.push(buildImport(m[2], m[1] || undefined, moduleName));
  const blockRe = /import\s*\(([^)]+)\)/gs;
  for (const bm of source.matchAll(blockRe)) {
    const lineRe = /^\s*(?:(\w+|_|\.)\s+)?"([^"]+)"/gm;
    for (const lm of bm[1].matchAll(lineRe)) imports.push(buildImport(lm[2], lm[1] === '_' || lm[1] === '.' ? lm[1] : (lm[1] || undefined), moduleName));
  }
  return { imports, packageName };
}
