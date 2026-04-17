import fs from 'fs';
import path from 'path';
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

export class LocalSource {
  private rootPath: string;

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
    // Local reads are synchronous and fast — no need for async/concurrency
    return files.map((f, i) => {
      const content = this.getFileContent(f.path);
      onProgress?.(i + 1, files.length);
      return { entry: f, content, churn: 0 };
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
