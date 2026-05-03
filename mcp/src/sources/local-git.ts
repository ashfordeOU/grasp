// Git history helpers for the local source adapter. Extracted from
// local.ts so each file stays under the critical-complexity threshold.

import path from 'path';
import { execSync } from 'child_process';

export interface CommitSnapshot {
  hash: string;
  shortHash: string;
  date: string;
  message: string;
  author: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFiles: string[];
}

function gitStripPrefix(rootPath: string): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const relPrefix = path.relative(gitRoot, path.resolve(rootPath));
    return relPrefix ? relPrefix.replace(/\\/g, '/') + '/' : '';
  } catch {
    return '';
  }
}

function relativise(filePath: string, stripPrefix: string): string {
  return stripPrefix && filePath.startsWith(stripPrefix) ? filePath.slice(stripPrefix.length) : filePath;
}

export function getGitChurn(rootPath: string): Map<string, number> {
  const churnMap = new Map<string, number>();
  try {
    const stripPrefix = gitStripPrefix(rootPath);
    const out = execSync(
      'git log --name-only --pretty=format: --no-merges',
      { cwd: rootPath, timeout: 10_000, maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    for (const line of out.split('\n')) {
      const f = line.trim();
      if (!f) continue;
      const rel = relativise(f, stripPrefix);
      churnMap.set(rel, (churnMap.get(rel) ?? 0) + 1);
    }
  } catch { /* not a git repo / git unavailable */ }
  return churnMap;
}

function buildFileAuthorMap(out: string, stripPrefix: string): Map<string, Map<string, number>> {
  const fileAuthors = new Map<string, Map<string, number>>();
  let currentAuthor = '';
  for (const line of out.split('\n')) {
    const l = line.trim();
    if (l.startsWith('AUTHOR:')) { currentAuthor = l.slice(7); continue; }
    if (!l || !currentAuthor) continue;
    const rel = relativise(l, stripPrefix);
    if (!fileAuthors.has(rel)) fileAuthors.set(rel, new Map());
    const counts = fileAuthors.get(rel)!;
    counts.set(currentAuthor, (counts.get(currentAuthor) || 0) + 1);
  }
  return fileAuthors;
}

export function getGitOwnership(rootPath: string): Map<string, { topAuthor: string; authorCount: number }> {
  const ownerMap = new Map<string, { topAuthor: string; authorCount: number }>();
  try {
    const stripPrefix = gitStripPrefix(rootPath);
    const out = execSync(
      'git log --format="AUTHOR:%ae" --name-only --no-merges',
      { cwd: rootPath, timeout: 15_000, maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();

    const fileAuthors = buildFileAuthorMap(out, stripPrefix);
    for (const [filePath, authorCounts] of fileAuthors) {
      let topAuthor = '', topCount = 0;
      for (const [author, count] of authorCounts) {
        if (count > topCount) { topCount = count; topAuthor = author; }
      }
      ownerMap.set(filePath, { topAuthor, authorCount: authorCounts.size });
    }
  } catch { /* git unavailable */ }
  return ownerMap;
}

interface NumstatTotals {
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFiles: string[];
}

function parseNumstat(numstat: string, stripPrefix: string): NumstatTotals {
  const totals: NumstatTotals = { filesChanged: 0, additions: 0, deletions: 0, changedFiles: [] };
  for (const row of numstat.split('\n')) {
    const cols = row.trim().split('\t');
    if (cols.length < 3) continue;
    const [add, del, filePath] = cols;
    totals.filesChanged++;
    totals.additions += parseInt(add) || 0;
    totals.deletions += parseInt(del) || 0;
    totals.changedFiles.push(relativise(filePath, stripPrefix));
  }
  return totals;
}

function fetchCommitNumstat(rootPath: string, hash: string, stripPrefix: string): NumstatTotals {
  try {
    const numstat = execSync(
      `git diff-tree --no-commit-id -r --numstat ${hash}`,
      { cwd: rootPath, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    return parseNumstat(numstat, stripPrefix);
  } catch {
    return { filesChanged: 0, additions: 0, deletions: 0, changedFiles: [] };
  }
}

export function getGitTimeline(rootPath: string, n = 20): CommitSnapshot[] {
  const snapshots: CommitSnapshot[] = [];
  try {
    const stripPrefix = gitStripPrefix(rootPath);
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
      const ns = fetchCommitNumstat(rootPath, hash, stripPrefix);
      snapshots.push({
        hash, shortHash, date: date.trim(), message: message.trim(), author: author.trim(),
        ...ns,
      });
    }
  } catch { /* git unavailable */ }
  return snapshots;
}
