import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { FileEntry } from '../types.js';

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'vendor', 'bower_components',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', 'venv', '.venv',
  'env', '.env', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '.gradle', '.idea', '.vscode', 'coverage', '.nyc_output', 'tmp', '.tmp',
]);

/**
 * Run `git log --numstat` in rootPath and return a map of
 * relative file path → commit count (churn).  Returns an empty
 * map if the directory is not a git repo or git is unavailable.
 */
export function getGitChurn(rootPath: string): Map<string, number> {
  const churnMap = new Map<string, number>();
  try {
    // Find the git repo root so we can strip the prefix from git paths
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();

    // Prefix to strip: e.g. if gitRoot=/repo and rootPath=/repo/mcp, prefix is "mcp/"
    const relPrefix = path.relative(gitRoot, path.resolve(rootPath));
    const stripPrefix = relPrefix ? relPrefix.replace(/\\/g, '/') + '/' : '';

    const out = execSync(
      'git log --name-only --pretty=format: --no-merges',
      { cwd: rootPath, timeout: 10_000, maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();

    for (const line of out.split('\n')) {
      const f = line.trim();
      if (!f) continue;
      // Strip the subdirectory prefix so paths match file entries
      const rel = stripPrefix && f.startsWith(stripPrefix) ? f.slice(stripPrefix.length) : f;
      churnMap.set(rel, (churnMap.get(rel) ?? 0) + 1);
    }
  } catch {
    // Not a git repo, git not installed, or timed out — silently skip
  }
  return churnMap;
}

/**
 * Run `git log --format="%ae" --name-only` and return a map of
 * relative file path → { topAuthor: string, authorCount: number }
 */
export function getGitOwnership(rootPath: string): Map<string, { topAuthor: string; authorCount: number }> {
  const ownerMap = new Map<string, { topAuthor: string; authorCount: number }>();
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const relPrefix = path.relative(gitRoot, path.resolve(rootPath));
    const stripPrefix = relPrefix ? relPrefix.replace(/\\/g, '/') + '/' : '';

    const out = execSync(
      'git log --format="AUTHOR:%ae" --name-only --no-merges',
      { cwd: rootPath, timeout: 15_000, maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();

    let currentAuthor = '';
    // Map<filePath, Map<author, count>>
    const fileAuthors = new Map<string, Map<string, number>>();
    for (const line of out.split('\n')) {
      const l = line.trim();
      if (l.startsWith('AUTHOR:')) { currentAuthor = l.slice(7); continue; }
      if (!l || !currentAuthor) continue;
      const rel = stripPrefix && l.startsWith(stripPrefix) ? l.slice(stripPrefix.length) : l;
      if (!fileAuthors.has(rel)) fileAuthors.set(rel, new Map());
      const authorCounts = fileAuthors.get(rel)!;
      authorCounts.set(currentAuthor, (authorCounts.get(currentAuthor) || 0) + 1);
    }

    for (const [filePath, authorCounts] of fileAuthors) {
      let topAuthor = '', topCount = 0;
      for (const [author, count] of authorCounts) {
        if (count > topCount) { topCount = count; topAuthor = author; }
      }
      ownerMap.set(filePath, { topAuthor, authorCount: authorCounts.size });
    }
  } catch {
    // Not a git repo or git unavailable — silently skip
  }
  return ownerMap;
}

export class LocalSource {
  private rootPath: string;
  private _churnMap: Map<string, number> | null = null;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  getFileTree(): FileEntry[] {
    const files: FileEntry[] = [];
    this._walk(this.rootPath, '', files);
    return files.slice(0, MAX_FILES);
  }

  private _walk(dir: string, relBase: string, out: FileEntry[]): void {
    if (out.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const relDir = relBase ? `${relBase}/${entry.name}` : entry.name;
        this._walk(path.join(dir, entry.name), relDir, out);
      } else if (entry.isFile()) {
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        const folder = relBase || '/';
        out.push({ path: relPath, name: entry.name, folder });
      }
    }
  }

  getFileContent(filePath: string): string | null {
    const abs = path.join(this.rootPath, filePath);
    try {
      const stat = fs.statSync(abs);
      if (stat.size > MAX_FILE_SIZE) return null;
      return fs.readFileSync(abs, 'utf-8');
    } catch {
      return null;
    }
  }

  getFileSize(filePath: string): number {
    try {
      return fs.statSync(path.join(this.rootPath, filePath)).size;
    } catch {
      return 0;
    }
  }

  fetchFilesParallel(
    files: FileEntry[],
    isCode: (name: string) => boolean,
    onProgress?: (done: number, total: number) => void
  ): Array<{ entry: FileEntry; content: string | null; churn: number }> {
    // Lazy-load git churn once per LocalSource instance
    if (this._churnMap === null) {
      this._churnMap = getGitChurn(this.rootPath);
    }
    const churnMap = this._churnMap;

    return files.map((f, i) => {
      const content = this.getFileContent(f.path);
      onProgress?.(i + 1, files.length);
      // git log outputs paths relative to repo root; f.path is relative to rootPath
      const churn = churnMap.get(f.path) ?? churnMap.get(f.name) ?? 0;
      return { entry: f, content, churn };
    });
  }
}

export interface CommitSnapshot {
  hash: string;
  shortHash: string;
  date: string;       // ISO
  message: string;
  author: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFiles: string[];
}

/**
 * Return the last `n` commits for rootPath with per-commit file change stats.
 * Each entry lists files changed so the browser can highlight them on the graph.
 */
export function getGitTimeline(rootPath: string, n = 20): CommitSnapshot[] {
  const snapshots: CommitSnapshot[] = [];
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const relPrefix = path.relative(gitRoot, path.resolve(rootPath));
    const stripPrefix = relPrefix ? relPrefix.replace(/\\/g, '/') + '/' : '';

    // Get commit list: hash|shortHash|date|author|subject
    const logOut = execSync(
      `git log --max-count=${n} --format="%H|%h|%ai|%ae|%s"`,
      { cwd: rootPath, timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();

    if (!logOut) return snapshots;

    for (const line of logOut.split('\n')) {
      const parts = line.split('|');
      if (parts.length < 5) continue;
      const [hash, shortHash, date, author, ...msgParts] = parts;
      const message = msgParts.join('|');

      // Get numstat for this commit
      let filesChanged = 0, additions = 0, deletions = 0;
      const changedFiles: string[] = [];
      try {
        const numstat = execSync(
          `git diff-tree --no-commit-id -r --numstat ${hash}`,
          { cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString();
        for (const row of numstat.split('\n')) {
          const cols = row.trim().split('\t');
          if (cols.length < 3) continue;
          const [add, del, filePath] = cols;
          const rel = stripPrefix && filePath.startsWith(stripPrefix) ? filePath.slice(stripPrefix.length) : filePath;
          filesChanged++;
          additions += parseInt(add) || 0;
          deletions += parseInt(del) || 0;
          changedFiles.push(rel);
        }
      } catch { /* ignore */ }

      snapshots.push({ hash, shortHash, date: date.trim(), message: message.trim(), author: author.trim(), filesChanged, additions, deletions, changedFiles });
    }
  } catch {
    // Not a git repo or git unavailable
  }
  return snapshots;
}

/**
 * Detect monorepo sub-package roots within rootPath.
 * Returns relative paths of directories that contain a package manifest
 * (package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, build.gradle)
 * at depth 1–3.
 */
export function detectWorkspaces(rootPath: string): string[] {
  const MANIFESTS = new Set(['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'setup.py']);
  const found: string[] = [];

  function scan(dir: string, relBase: string, depth: number) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    const hasManifest = depth > 0 && entries.some(e => e.isFile() && MANIFESTS.has(e.name));
    if (hasManifest) { found.push(relBase); return; } // don't recurse into sub-packages

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      scan(path.join(dir, e.name), rel, depth + 1);
    }
  }

  scan(rootPath, '', 0);
  return found;
}

/**
 * Given detected workspaces and a file path, return which workspace it belongs to.
 */
export function fileWorkspace(filePath: string, workspaces: string[]): string | undefined {
  // Sort longest first so more specific paths win
  const sorted = [...workspaces].sort((a, b) => b.length - a.length);
  for (const ws of sorted) {
    if (filePath.startsWith(ws + '/') || filePath === ws) return ws;
  }
  return undefined;
}

export function isLocalPath(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('~') ||
    /^[a-zA-Z]:\\/.test(input)
  );
}

export function resolveLocalPath(input: string): string {
  if (input.startsWith('~')) {
    return path.join(process.env.HOME || '', input.slice(1));
  }
  return path.resolve(input);
}
