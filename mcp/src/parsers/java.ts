export interface JavaImport { fullPath: string; package: string; className: string; isStatic: boolean; wildcard: boolean; stdlib: boolean; }
export interface JavaParseResult { imports: JavaImport[]; packageName: string; }

const STDLIB_PREFIXES = ['java.', 'javax.', 'jakarta.', 'com.sun.', 'sun.', 'jdk.'];
function isStdlib(p: string): boolean { return STDLIB_PREFIXES.some(pre => p.startsWith(pre)); }

export function parseJavaImports(source: string, _filePath: string): JavaParseResult {
  const imports: JavaImport[] = [];
  const pkgMatch = source.match(/^\s*package\s+([\w.]+)\s*;/m);
  const packageName = pkgMatch?.[1] ?? '';
  for (const m of source.matchAll(/^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
    const [, staticKw, p, wildcardSuffix] = m;
    const isStatic = !!staticKw; const wildcard = !!wildcardSuffix;
    let pkg: string; let className: string;
    if (wildcard) { pkg = p; className = '*'; }
    else { const d = p.lastIndexOf('.'); pkg = d === -1 ? '' : p.substring(0, d); className = d === -1 ? p : p.substring(d + 1); }
    imports.push({ fullPath: p + (wildcard ? '.*' : ''), package: pkg, className, isStatic, wildcard, stdlib: isStdlib(p) });
  }
  return { imports, packageName };
}
