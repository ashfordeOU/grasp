// npm import-statement extraction. Split out of dead-packages.ts so each
// file stays under the critical-complexity threshold.

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder',
  'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url',
  'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Extract the npm package name from an import specifier.
 * Returns null for relative imports, absolute paths, and Node.js builtins.
 */
export function extractPackageName(specifier: string): string | null {
  if (!specifier) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:')) return null;
  if (NODE_BUILTINS.has(specifier)) return null;
  if (NODE_BUILTINS.has(specifier.split('/')[0])) return null;

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }

  return specifier.split('/')[0];
}

/**
 * Collect all package names referenced by import/require in a source string.
 */
export function extractImportedPackages(source: string): Set<string> {
  const packages = new Set<string>();

  const esImport = /(?:from\s+|import\s+)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = esImport.exec(source)) !== null) {
    const pkg = extractPackageName(m[1]);
    if (pkg) packages.add(pkg);
  }

  const cjsRequire = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = cjsRequire.exec(source)) !== null) {
    const pkg = extractPackageName(m[1]);
    if (pkg) packages.add(pkg);
  }

  return packages;
}
