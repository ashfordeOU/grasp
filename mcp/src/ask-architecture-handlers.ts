// Per-intent handlers for askArchitecture. Split out of ask-architecture.ts
// so the main file's intent dispatch stays trivial and the per-intent
// branching doesn't push the file over the critical-complexity threshold.

import type { SearchableBrainStore as BrainStore } from './brain-search.js';
import type { RepoRecord } from './brain.js';

export function handleComplexity(brain: BrainStore, source: string, lines: string[]): boolean {
  const files = brain.queryFiles(source, { minComplexity: 5, limit: 10 });
  if (files.length === 0) return false;
  lines.push('Most complex files:');
  files.forEach(f => lines.push(`  ${f.path}  complexity=${f.complexity}  grade=${f.healthGrade}`));
  return true;
}

export function handleSecurity(brain: BrainStore, source: string, lines: string[]): boolean {
  const files = brain.queryFiles(source, { limit: 10000 });
  const withSecurity: Array<{ path: string; issues: Array<{ severity: string; desc: string }> }> = [];
  for (const f of files) {
    const ctx = brain.getFileContext(source, f.path);
    if (ctx && ctx.security.length > 0) withSecurity.push({ path: f.path, issues: ctx.security });
  }
  if (withSecurity.length === 0) return false;
  lines.push(`Security issues found in ${withSecurity.length} file(s):`);
  withSecurity.forEach(f => f.issues.forEach(i => lines.push(`  [${i.severity}] ${f.path}: ${i.desc}`)));
  return true;
}

export function handleCoupling(brain: BrainStore, source: string, lines: string[]): boolean {
  const files = brain.queryFiles(source, { limit: 20 });
  const sorted = files.sort((a, b) => (b.couplingOut + b.couplingIn) - (a.couplingOut + a.couplingIn));
  if (sorted.length === 0) return false;
  lines.push('Files with highest coupling (blast radius):');
  sorted.slice(0, 10).forEach(f => lines.push(`  ${f.path}  in=${f.couplingIn} out=${f.couplingOut}`));
  return true;
}

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

export function handleGrade(brain: BrainStore, source: string, gradeFilter: string | null, lines: string[]): boolean {
  const files = brain.queryFiles(source, { limit: 10000 });
  const filtered = gradeFilter
    ? files.filter(f => f.healthGrade === gradeFilter)
    : files.sort((a, b) => GRADE_ORDER.indexOf(b.healthGrade) - GRADE_ORDER.indexOf(a.healthGrade)).slice(0, 10);
  if (filtered.length === 0) return false;
  lines.push(gradeFilter ? `Files with grade ${gradeFilter}:` : 'Worst-graded files:');
  filtered.slice(0, 10).forEach(f => lines.push(`  ${f.path}  grade=${f.healthGrade}  complexity=${f.complexity}`));
  return true;
}

export function handleChurn(brain: BrainStore, source: string, lines: string[]): boolean {
  const files = brain.queryFiles(source, { limit: 10000 });
  const sorted = files.sort((a, b) => b.churn - a.churn).slice(0, 10);
  if (sorted.length === 0) return false;
  lines.push('Most churned files:');
  sorted.forEach(f => lines.push(`  ${f.path}  churn=${f.churn}  grade=${f.healthGrade}`));
  return true;
}

export function handleLayer(brain: BrainStore, source: string, lines: string[]): boolean {
  const files = brain.queryFiles(source, { limit: 10000 });
  const byLayer: Record<string, number> = {};
  files.forEach(f => { byLayer[f.layer] = (byLayer[f.layer] ?? 0) + 1; });
  if (Object.keys(byLayer).length === 0) return false;
  lines.push('Architecture layers:');
  Object.entries(byLayer).sort((a, b) => b[1] - a[1]).forEach(([l, n]) => lines.push(`  ${l}: ${n} file(s)`));
  return true;
}

export function handleCycles(repo: RepoRecord, lines: string[]): boolean {
  lines.push(`Circular dependency count: ${repo.circularDepCount}`);
  if (repo.circularDepCount === 0) lines.push('  No circular dependencies detected.');
  return true;
}
