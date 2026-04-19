export interface RustImport { path: string; module: string; stdlib: boolean; internal: boolean; reExport: boolean; }
export interface RustParseResult { imports: RustImport[]; submodules: string[]; }

export function parseRustImports(source: string, _filePath: string): RustParseResult {
  const imports: RustImport[] = [];
  const submodules: string[] = [];
  for (const m of source.matchAll(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm)) submodules.push(m[1]);
  for (const m of source.matchAll(/^\s*extern\s+crate\s+(\w+)\s*;/gm)) { const name = m[1]; imports.push({ path: name, module: name, stdlib: name === 'std', internal: false, reExport: false }); }
  for (const m of source.matchAll(/^\s*(pub\s+)?use\s+([\w:{}*,\s]+?)\s*;/gm)) {
    const reExport = !!m[1]; const trimmed = m[2].trim();
    const firstSeg = trimmed.split('::')[0].trim();
    const stdlib = firstSeg === 'std' || firstSeg === 'core' || firstSeg === 'alloc';
    const internal = firstSeg === 'crate' || firstSeg === 'super' || firstSeg === 'self';
    const parts = trimmed.split('::'); let module = firstSeg;
    if (internal && parts[1]) module = parts[1].trim().replace(/^\{/, '').trim();
    imports.push({ path: trimmed, module, stdlib, internal, reExport });
  }
  return { imports, submodules };
}
