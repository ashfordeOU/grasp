// Monorepo workspace detection. Extracted from local.ts so each file
// stays under the critical-complexity threshold.

import fs from 'fs';
import path from 'path';

const MANIFESTS = new Set(['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'setup.py']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'vendor', 'bower_components',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', 'venv', '.venv',
  'env', '.env', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '.gradle', '.idea', '.vscode', 'coverage', '.nyc_output', 'tmp', '.tmp',
  'dist-safari', 'dist-firefox', 'dist-chrome', 'dist-edge',
]);

function readDirSafe(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function scanForWorkspaces(dir: string, relBase: string, depth: number, found: string[]): void {
  if (depth > 3) return;
  const entries = readDirSafe(dir);
  if (depth > 0 && entries.some(e => e.isFile() && MANIFESTS.has(e.name))) {
    found.push(relBase);
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    scanForWorkspaces(path.join(dir, e.name), rel, depth + 1, found);
  }
}

/**
 * Detect monorepo sub-package roots within rootPath.
 * Returns relative paths of directories that contain a package manifest at depth 1–3.
 */
export function detectWorkspaces(rootPath: string): string[] {
  const found: string[] = [];
  scanForWorkspaces(rootPath, '', 0, found);
  return found;
}

/**
 * Given detected workspaces and a file path, return which workspace it belongs to.
 */
export function fileWorkspace(filePath: string, workspaces: string[]): string | undefined {
  const sorted = [...workspaces].sort((a, b) => b.length - a.length);
  for (const ws of sorted) {
    if (filePath.startsWith(ws + '/') || filePath === ws) return ws;
  }
  return undefined;
}
