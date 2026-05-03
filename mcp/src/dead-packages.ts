/**
 * Dead package detection — finds declared npm dependencies that are never
 * imported by any code file in the project.
 *
 * A "dead" package is one that appears in package.json dependencies or
 * devDependencies but has no matching import/require statement anywhere in
 * the analyzed code files.
 */

import type { FileEntry } from './types.js';
import { extractPackageName, extractImportedPackages } from './dead-packages-imports.js';

// Re-export so existing callers keep working.
export { extractPackageName, extractImportedPackages };

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

// extractPackageName + extractImportedPackages live in dead-packages-imports.ts.

function buildGlobalUsedSet(codeContents: string[]): Set<string> {
  const used = new Set<string>();
  for (const src of codeContents) {
    for (const pkg of extractImportedPackages(src)) used.add(pkg);
  }
  return used;
}

function buildScopedUsedSet(pkgDir: string, codePathMap?: Map<string, string>): Set<string> {
  const used = new Set<string>();
  if (!codePathMap || !pkgDir) return used;
  for (const [filePath, src] of codePathMap) {
    if (!filePath.startsWith(pkgDir)) continue;
    for (const pkg of extractImportedPackages(src)) used.add(pkg);
  }
  return used;
}

function isAlwaysUsedDep(name: string): boolean {
  if (ALWAYS_USED.has(name)) return true;
  if (name.startsWith('tree-sitter-')) return true;
  if (name.startsWith('@types/')) return true;
  return false;
}

function appendDeadFromGroup(
  group: Record<string, string>,
  type: 'dependency' | 'devDependency',
  pkgPath: string,
  used: Set<string>,
  out: DeadPackage[],
): void {
  for (const [name, version] of Object.entries(group)) {
    if (isAlwaysUsedDep(name)) continue;
    if (!used.has(name)) out.push({ name, version: String(version), type, packageJsonPath: pkgPath });
  }
}

function processManifest(
  pkgPath: string,
  content: string,
  globalUsed: Set<string>,
  codePathMap: Map<string, string> | undefined,
  out: DeadPackage[],
): void {
  if (pkgPath.includes('/fixtures/') || pkgPath.includes('/test-fixtures/')) return;
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(content) as Record<string, unknown>; } catch { return; }

  const pkgDir = pkgPath.includes('/') ? pkgPath.slice(0, pkgPath.lastIndexOf('/') + 1) : '';
  const scopedUsed = buildScopedUsedSet(pkgDir, codePathMap);
  const usedPackages = scopedUsed.size > 0 ? scopedUsed : globalUsed;

  const deps = (manifest['dependencies'] as Record<string, string> | undefined) ?? {};
  const devDeps = (manifest['devDependencies'] as Record<string, string> | undefined) ?? {};
  appendDeadFromGroup(deps, 'dependency', pkgPath, usedPackages, out);
  appendDeadFromGroup(devDeps, 'devDependency', pkgPath, usedPackages, out);
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
  codePathMap?: Map<string, string>,
): DeadPackage[] {
  const globalUsed = buildGlobalUsedSet(codeContents);
  const dead: DeadPackage[] = [];
  for (const { path: pkgPath, content } of packageJsonEntries) {
    processManifest(pkgPath, content, globalUsed, codePathMap, dead);
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
