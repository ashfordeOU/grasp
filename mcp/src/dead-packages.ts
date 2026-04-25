/**
 * Dead package detection — finds declared npm dependencies that are never
 * imported by any code file in the project.
 *
 * A "dead" package is one that appears in package.json dependencies or
 * devDependencies but has no matching import/require statement anywhere in
 * the analyzed code files.
 */

import type { FileEntry } from './types.js';

// Node.js core modules — never installed via npm, always skip
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

// Packages that are used at build/config time and don't appear in source imports
const ALWAYS_USED = new Set([
  'typescript', 'ts-node', 'esbuild', 'webpack', 'rollup', 'vite', 'parcel',
  '@babel/core', '@babel/cli', '@babel/preset-env', '@babel/preset-typescript',
  'eslint', 'prettier', 'husky', 'lint-staged', 'commitlint',
  'jest', 'vitest', 'mocha', 'chai', 'supertest', 'ts-jest', '@types/jest',
  'nodemon', 'concurrently', 'rimraf', 'cross-env', 'dotenv-cli',
  'npm-run-all', 'wait-on', 'turbo', 'nx', 'lerna',
  // tree-sitter grammars — loaded dynamically via require() with variable paths
  'tree-sitter', 'tree-sitter-javascript', 'tree-sitter-typescript',
  'tree-sitter-python', 'tree-sitter-go', 'tree-sitter-java', 'tree-sitter-rust',
  'tree-sitter-c', 'tree-sitter-cpp', 'tree-sitter-c-sharp', 'tree-sitter-ruby',
  'tree-sitter-php', 'tree-sitter-swift', 'tree-sitter-kotlin', 'tree-sitter-scala',
  'tree-sitter-zig', 'tree-sitter-lua',
  // Platform/runtime deps used via CLI/scripts, not source imports
  'tsx', '@vscode/vsce', '@vercel/ncc', 'web-ext',
  // GitHub Actions SDK — used in compiled action entry-points
  '@actions/core', '@actions/github',
  // Browser extension build tools
  'webpack-cli', 'ts-loader', '@playwright/test',
  // Raycast
  '@raycast/api',
  // MSW / test utilities
  'msw', 'babel-jest',
  // Monorepo infra
  'grasp-mcp-server',
  // GitHub/GitLab SDKs — used in platform-specific integration packages
  '@octokit/rest', '@octokit/webhooks', '@octokit/app',
  // MCP SDK
  '@modelcontextprotocol/sdk',
]);

export interface DeadPackage {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
  packageJsonPath: string;
}

/**
 * Extract the npm package name from an import specifier.
 * Returns null for relative imports, absolute paths, and Node.js builtins.
 */
export function extractPackageName(specifier: string): string | null {
  if (!specifier) return null;
  // Relative or absolute
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  // node: protocol
  if (specifier.startsWith('node:')) return null;
  // Node.js builtin (without node: prefix)
  if (NODE_BUILTINS.has(specifier)) return null;
  if (NODE_BUILTINS.has(specifier.split('/')[0])) return null;

  // Scoped package: @scope/name[/sub/path]
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null; // malformed scoped
  }

  // Regular package: name[/sub/path]
  return specifier.split('/')[0];
}

/**
 * Collect all package names referenced by import/require in a source string.
 */
export function extractImportedPackages(source: string): Set<string> {
  const packages = new Set<string>();

  // ES import: import ... from 'pkg', import 'pkg'
  const esImport = /(?:from\s+|import\s+)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = esImport.exec(source)) !== null) {
    const pkg = extractPackageName(m[1]);
    if (pkg) packages.add(pkg);
  }

  // CommonJS require / dynamic import
  const cjsRequire = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = cjsRequire.exec(source)) !== null) {
    const pkg = extractPackageName(m[1]);
    if (pkg) packages.add(pkg);
  }

  return packages;
}

/**
 * Given a list of package.json contents and code file contents, return the
 * list of declared packages that appear in no import statement.
 *
 * Each package.json is scoped to its own directory subtree — a package declared
 * in saas/package.json is only checked against code files inside saas/.
 */
export function detectDeadPackages(
  packageJsonEntries: Array<{ path: string; content: string }>,
  codeContents: string[],
  codePathMap?: Map<string, string>, // path → content
): DeadPackage[] {
  // Build a global fallback set (used when we can't scope by path)
  const globalUsed = new Set<string>();
  for (const src of codeContents) {
    for (const pkg of extractImportedPackages(src)) globalUsed.add(pkg);
  }

  const dead: DeadPackage[] = [];

  for (const { path: pkgPath, content } of packageJsonEntries) {
    // Skip test fixtures — intentionally contain placeholder/unused packages
    if (pkgPath.includes('/fixtures/') || pkgPath.includes('/test-fixtures/')) continue;

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(content) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Determine the subtree this package.json governs (directory containing it)
    const pkgDir = pkgPath.includes('/') ? pkgPath.slice(0, pkgPath.lastIndexOf('/') + 1) : '';

    // Collect imports scoped to this subtree when a path map is available
    const scopedUsed = new Set<string>();
    if (codePathMap && pkgDir) {
      for (const [filePath, src] of codePathMap) {
        if (filePath.startsWith(pkgDir)) {
          for (const pkg of extractImportedPackages(src)) scopedUsed.add(pkg);
        }
      }
    }
    // Fall back to global scan if no scoped files found (e.g. root package.json)
    const usedPackages = scopedUsed.size > 0 ? scopedUsed : globalUsed;

    const deps = manifest['dependencies'] as Record<string, string> | undefined ?? {};
    const devDeps = manifest['devDependencies'] as Record<string, string> | undefined ?? {};

    for (const [name, version] of Object.entries(deps)) {
      if (ALWAYS_USED.has(name)) continue;
      if (name.startsWith('tree-sitter-')) continue; // always loaded dynamically
      if (name.startsWith('@types/')) continue;       // ambient TS declarations, never in imports
      if (!usedPackages.has(name)) {
        dead.push({ name, version: String(version), type: 'dependency', packageJsonPath: pkgPath });
      }
    }

    for (const [name, version] of Object.entries(devDeps)) {
      if (ALWAYS_USED.has(name)) continue;
      if (name.startsWith('@types/')) continue; // ambient TypeScript declarations
      if (!usedPackages.has(name)) {
        dead.push({ name, version: String(version), type: 'devDependency', packageJsonPath: pkgPath });
      }
    }
  }

  return dead;
}

/**
 * Convenience wrapper used by analyzeSource: given raw file entries and a
 * function to fetch file content, return detected dead packages.
 */
export async function findDeadPackages(
  fileEntries: FileEntry[],
  codeContents: Map<string, string>,
  fetchFile: (path: string) => Promise<string | null>,
  codePathMap?: Map<string, string>,
): Promise<DeadPackage[]> {
  // Find package.json files (at any depth, but skip nested node_modules)
  const pkgJsonEntries = fileEntries.filter(
    f => f.name === 'package.json' && !f.path.includes('node_modules')
  );
  if (pkgJsonEntries.length === 0) return [];

  const packageJsonContents: Array<{ path: string; content: string }> = [];
  for (const entry of pkgJsonEntries) {
    // Try to get from codeContents first (already fetched), then fetch
    const content = codeContents.get(entry.path) ?? await fetchFile(entry.path);
    if (content) packageJsonContents.push({ path: entry.path, content });
  }

  if (packageJsonContents.length === 0) return [];

  return detectDeadPackages(packageJsonContents, [...codeContents.values()], codePathMap ?? codeContents);
}
