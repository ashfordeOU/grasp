import fs from 'fs';
import path from 'path';
import type { FileEntry, AnalysisResult, AnalyzedFile, Connection } from '../types.js';
import { getGitChurn, getGitOwnership, getGitTimeline, type CommitSnapshot } from './local-git.js';
import { detectWorkspaces, fileWorkspace } from './local-workspaces.js';

export { getGitChurn, getGitOwnership, getGitTimeline, detectWorkspaces, fileWorkspace };
export type { CommitSnapshot };

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'vendor', 'bower_components',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', 'venv', '.venv',
  'env', '.env', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '.gradle', '.idea', '.vscode', 'coverage', '.nyc_output', 'tmp', '.tmp',
  'dist-safari', 'dist-firefox', 'dist-chrome', 'dist-edge',
]);

// Git history helpers (getGitChurn / getGitOwnership / getGitTimeline) live
// in local-git.ts; they're re-exported above so existing callers keep working.

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


// detectWorkspaces / fileWorkspace live in local-workspaces.ts.

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

// ── Incremental Watch Re-analysis ─────────────────────────────────────────

/**
 * Tracks which files changed and computes the minimal affected set
 * (the changed file + all files that directly import it).
 * On each change, only those files need re-parsing; the rest of the
 * AnalysisResult is merged from the previous run.
 */
export class FileChangeTracker {
  private cachedResult: AnalysisResult;
  // Map from file path → set of files that import it (reverse index)
  private dependentsIndex: Map<string, Set<string>>;

  constructor(initialResult: AnalysisResult) {
    this.cachedResult = initialResult;
    this.dependentsIndex = this.buildDependentsIndex(initialResult.connections);
  }

  private buildDependentsIndex(connections: Connection[]): Map<string, Set<string>> {
    const idx = new Map<string, Set<string>>();
    for (const conn of connections) {
      // conn.source = imported file, conn.target = importer
      if (!idx.has(conn.source)) idx.set(conn.source, new Set());
      idx.get(conn.source)!.add(conn.target);
    }
    return idx;
  }

  /**
   * Returns the set of file paths that must be re-parsed when `changedRelPath`
   * is modified: the file itself plus all files that directly import it.
   */
  affectedFiles(changedRelPath: string): Set<string> {
    const affected = new Set<string>([changedRelPath]);
    const importers = this.dependentsIndex.get(changedRelPath);
    if (importers) {
      for (const imp of importers) affected.add(imp);
    }
    return affected;
  }

  /**
   * Merge a fresh partial AnalysisResult (for the affected files) back into
   * the cached full result and return the merged result.
   */
  merge(fresh: AnalysisResult, affectedPaths: Set<string>): AnalysisResult {
    // Replace files that were re-analysed, keep the rest
    const unchangedFiles = this.cachedResult.files.filter(
      f => !affectedPaths.has(f.path)
    );
    const newFiles: AnalyzedFile[] = [
      ...unchangedFiles,
      ...fresh.files,
    ];

    // Replace connections touching affected files, keep the rest
    const unchangedConns = this.cachedResult.connections.filter(
      c => !affectedPaths.has(c.source) && !affectedPaths.has(c.target)
    );
    const newConns: Connection[] = [...unchangedConns, ...fresh.connections];

    // Issues are grouped (not per-file), so use fresh issues directly
    const newIssues = fresh.issues;

    // Security: same pattern
    const unchangedSecurity = this.cachedResult.security.filter(
      s => !affectedPaths.has(s.file)
    );
    const newSecurity = [...unchangedSecurity, ...fresh.security];

    const merged: AnalysisResult = {
      ...this.cachedResult,
      sessionId: fresh.sessionId,
      analyzedAt: fresh.analyzedAt,
      files: newFiles,
      connections: newConns,
      issues: newIssues,
      security: newSecurity,
      // Re-use fresh summary (it will be based on all files in fresh, which
      // is the full re-analysis for incremental mode)
      summary: {
        ...fresh.summary,
        fileCount: newFiles.length,
        codeFileCount: newFiles.filter(f => f.lines > 0).length,
        connectionCount: newConns.length,
        securityIssueCount: newSecurity.length,
      },
    };

    // Update the cache and rebuild the index
    this.cachedResult = merged;
    this.dependentsIndex = this.buildDependentsIndex(newConns);
    return merged;
  }

  getCached(): AnalysisResult {
    return this.cachedResult;
  }
}
