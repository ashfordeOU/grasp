// Topological sort using Kahn's algorithm. Extracted from
// migration-planner.ts so each piece stays under the critical-complexity
// threshold.

import type { Connection } from './types.js';

interface ToposortState {
  inDegree: Map<string, number>;
  reverseAdj: Map<string, string[]>;
}

function initState(files: string[]): ToposortState {
  const inDegree = new Map<string, number>();
  const reverseAdj = new Map<string, string[]>();
  for (const file of files) {
    inDegree.set(file, 0);
    reverseAdj.set(file, []);
  }
  return { inDegree, reverseAdj };
}

function addEdge(state: ToposortState, fileSet: Set<string>, conn: Connection): void {
  if (!fileSet.has(conn.source) || !fileSet.has(conn.target)) return;
  const dependents = state.reverseAdj.get(conn.source) ?? [];
  if (dependents.includes(conn.target)) return;
  dependents.push(conn.target);
  state.reverseAdj.set(conn.source, dependents);
  state.inDegree.set(conn.target, (state.inDegree.get(conn.target) ?? 0) + 1);
}

function nextReadyPhase(state: ToposortState, remaining: Set<string>): string[] {
  return [...remaining].filter(f => (state.inDegree.get(f) ?? 0) === 0);
}

function consumePhase(state: ToposortState, remaining: Set<string>, ready: string[]): void {
  for (const file of ready) {
    remaining.delete(file);
    for (const dependent of (state.reverseAdj.get(file) ?? [])) {
      state.inDegree.set(dependent, (state.inDegree.get(dependent) ?? 0) - 1);
    }
  }
}

/**
 * Returns groups of files that can be migrated in parallel per phase.
 * Phase 1 = files no other file in our set depends on (safe to change first).
 * Subsequent phases = files whose dependencies are already migrated.
 */
export function topoSort(files: string[], connections: Connection[]): string[][] {
  const fileSet = new Set(files);
  const state = initState(files);
  for (const conn of connections) addEdge(state, fileSet, conn);

  const phases: string[][] = [];
  const remaining = new Set(files);
  while (remaining.size > 0) {
    const ready = nextReadyPhase(state, remaining);
    if (ready.length === 0) {
      phases.push([...remaining]);
      break;
    }
    phases.push(ready);
    consumePhase(state, remaining, ready);
  }
  return phases;
}
