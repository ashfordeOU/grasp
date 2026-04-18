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
