/**
 * Grasp Migration Path Planner
 *
 * Given a codebase analysis, plans the ordered set of changes needed
 * to replace one dependency (package or module) with another — or
 * to remove a dependency entirely.
 *
 * Strategy:
 *  1. Find all files that import the "from" target.
 *  2. Build an import dependency graph to determine topological order.
 *  3. Estimate the effort for each file (number of import sites + function uses).
 *  4. Generate a phased migration plan: leaf files first, entry points last.
 *
 * Works for both:
 *  - npm package replacements  (e.g. moment → date-fns)
 *  - internal module refactors (e.g. src/utils/http → src/lib/fetch)
 */

import type { AnalyzedFile, Connection } from './types.js';
import { topoSort } from './migration-toposort.js';

export interface MigrationTarget {
  /** Import path or package name to replace (e.g. 'lodash', 'src/old/utils') */
  from: string;
  /** Replacement import path or package name (optional — omit to just remove) */
  to?: string;
}

export interface MigrationStep {
  file: string;
  phase: number;
  effort: 'low' | 'medium' | 'high';
  importSites: number;        // how many import/require statements mention 'from'
  functionUsages: number;     // approximate usage count across the file
  actions: string[];          // human-readable action items
  dependents: string[];       // files that import THIS file (must be done after)
}

export interface MigrationPlan {
  target: MigrationTarget;
  phases: Array<{
    phase: number;
    label: string;
    steps: MigrationStep[];
    canParallelize: boolean;
  }>;
  totalFiles: number;
  estimatedEffort: string;
  warnings: string[];
  summary: string;
}

// ── Import site scanner ──────────────────────────────────────────────────────

/**
 * Count how many times `importPath` is imported in `source`.
 * Handles ES imports, require(), and dynamic import().
 */
export function countImportSites(source: string, importPath: string): number {
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: import ... from 'path', require('path'), import('path')
  const re = new RegExp(
    `(?:from|require|import)\\s*\\(?\\s*['"](?:[./]*/)*${escaped}(?:['"\\s/]|$)`,
    'g'
  );
  return (source.match(re) ?? []).length;
}

/**
 * Rough estimate of how many times symbols from a module are used in a file.
 * Uses the import site count × average usage multiplier as a proxy.
 */
export function estimateFunctionUsages(source: string, importPath: string): number {
  const importCount = countImportSites(source, importPath);
  if (importCount === 0) return 0;

  // Count total lines that aren't the import declaration itself
  const nonImportLines = source
    .split('\n')
    .filter(line => !line.match(/^\s*import\s|^\s*(?:const|let|var)\s+\w+\s*=\s*require/))
    .length;

  // Very rough: assume ~5 usages per 100 lines of non-import code
  return Math.max(1, Math.round((nonImportLines / 100) * 5 * importCount));
}

function effortLevel(importSites: number, functionUsages: number): MigrationStep['effort'] {
  const score = importSites * 3 + functionUsages;
  if (score <= 3) return 'low';
  if (score <= 12) return 'medium';
  return 'high';
}

// Topological sort lives in migration-toposort.ts — re-exported so existing
// callers (migration-planner.test.ts) keep working.
export { topoSort };

// ── Plan builder ─────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<number, string> = {
  1: 'Leaf files — safe to migrate first (no dependents in affected set)',
  2: 'Intermediate files — depend only on phase-1 files',
  3: 'Core files — depend on phases 1–2',
  4: 'Entry points and shared utilities — migrate last',
};

function phaseLabel(phase: number): string {
  return PHASE_LABELS[phase] ?? `Phase ${phase} — depends on earlier phases`;
}

function buildActions(
  file: string,
  target: MigrationTarget,
  importSites: number,
): string[] {
  const actions: string[] = [];
  const from = target.from;
  const to = target.to;

  if (importSites > 0) {
    if (to) {
      actions.push(`Replace ${importSites} import(s) of '${from}' with '${to}'`);
    } else {
      actions.push(`Remove ${importSites} import(s) of '${from}'`);
    }
  }

  if (to) {
    actions.push(`Verify API compatibility: check ${to} exports match ${from} usage`);
  }

  actions.push(`Run existing tests for ${file.split('/').pop() ?? file}`);

  return actions;
}

/**
 * Build a full migration plan for replacing `target.from` with `target.to`.
 */
export function buildMigrationPlan(
  files: AnalyzedFile[],
  connections: Connection[],
  target: MigrationTarget,
): MigrationPlan {
  const warnings: string[] = [];

  // Find affected files
  const affected: Array<{ file: AnalyzedFile; importSites: number; functionUsages: number }> = [];

  for (const file of files) {
    if (!file.content || !file.isCode) continue;
    const importSites = countImportSites(file.content, target.from);
    if (importSites === 0) continue;
    const functionUsages = estimateFunctionUsages(file.content, target.from);
    affected.push({ file, importSites, functionUsages });
  }

  if (affected.length === 0) {
    return {
      target,
      phases: [],
      totalFiles: 0,
      estimatedEffort: 'none',
      warnings: [`No files found importing '${target.from}'`],
      summary: `No migration needed — '${target.from}' is not imported by any file in this codebase.`,
    };
  }

  // Build dependents map for each affected file
  const affectedPaths = new Set(affected.map(a => a.file.path));
  const dependentsMap = new Map<string, string[]>();
  for (const { file } of affected) {
    const deps = connections
      .filter(c => c.source === file.path && affectedPaths.has(c.target))
      .map(c => c.target);
    dependentsMap.set(file.path, [...new Set(deps)]);
  }

  // Topological sort
  const sortedPhases = topoSort(
    affected.map(a => a.file.path),
    connections,
  );

  const phases: MigrationPlan['phases'] = sortedPhases.map((group, idx) => {
    const phaseNum = idx + 1;
    const steps: MigrationStep[] = group.map(filePath => {
      const info = affected.find(a => a.file.path === filePath)!;
      return {
        file: filePath,
        phase: phaseNum,
        effort: effortLevel(info.importSites, info.functionUsages),
        importSites: info.importSites,
        functionUsages: info.functionUsages,
        actions: buildActions(filePath, target, info.importSites),
        dependents: dependentsMap.get(filePath) ?? [],
      };
    });

    return {
      phase: phaseNum,
      label: phaseLabel(phaseNum),
      steps,
      canParallelize: steps.length > 1,
    };
  });

  // Effort estimation
  const totalLow = phases.flatMap(p => p.steps).filter(s => s.effort === 'low').length;
  const totalMed = phases.flatMap(p => p.steps).filter(s => s.effort === 'medium').length;
  const totalHigh = phases.flatMap(p => p.steps).filter(s => s.effort === 'high').length;
  const effortScore = totalLow + totalMed * 3 + totalHigh * 8;

  let estimatedEffort: string;
  if (effortScore <= 5) estimatedEffort = 'small (< 1 hour)';
  else if (effortScore <= 20) estimatedEffort = 'medium (1–4 hours)';
  else if (effortScore <= 50) estimatedEffort = 'large (4–16 hours)';
  else estimatedEffort = 'extra-large (> 2 days)';

  // Warnings
  if (totalHigh > 0) {
    warnings.push(`${totalHigh} files have high migration effort — consider incremental rollout`);
  }
  if (phases.length === 1 && phases[0].steps.length > 10) {
    warnings.push('All files at same dependency depth — can migrate in any order');
  }
  if (target.to && target.from.startsWith('@') !== target.to.startsWith('@')) {
    warnings.push(`Migration crosses scope boundary (scoped ↔ unscoped package)`);
  }

  const toClause = target.to ? ` → '${target.to}'` : ' (removal)';
  const summary = [
    `Migration plan: '${target.from}'${toClause}`,
    `${affected.length} files across ${phases.length} phase${phases.length !== 1 ? 's' : ''}`,
    `Estimated effort: ${estimatedEffort}`,
    `Low: ${totalLow}  Medium: ${totalMed}  High: ${totalHigh}`,
  ].join(' · ');

  return {
    target,
    phases,
    totalFiles: affected.length,
    estimatedEffort,
    warnings,
    summary,
  };
}
