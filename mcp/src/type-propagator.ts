import type { AnalyzedFile, Connection } from './types.js';

export interface PropagatedType {
  callerFile: string;
  calleeName: string;
  inferredType: string;
  confidence: number;
}

export function propagateTypes(
  files: AnalyzedFile[],
  connections: Connection[],
): PropagatedType[] {
  // Build import adjacency for Kahn's topological sort
  const inDegree = new Map<string, number>();
  const importAdj = new Map<string, string[]>();

  for (const f of files) {
    if (!inDegree.has(f.path)) inDegree.set(f.path, 0);
    if (!importAdj.has(f.path)) importAdj.set(f.path, []);
    for (const imp of f.imports ?? []) {
      const cur = importAdj.get(f.path)!;
      cur.push(imp);
      inDegree.set(imp, (inDegree.get(imp) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([f]) => f);
  const topoOrder: string[] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    topoOrder.push(node);
    for (const dep of importAdj.get(node) ?? []) {
      const d = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }
  // Any files not reached (cycles) appended at end
  for (const f of files) {
    if (!visited.has(f.path)) topoOrder.push(f.path);
  }

  // Build fn return type lookup: "filePath::fnName" → returnType
  const fnReturnType = new Map<string, string>();
  for (const f of files) {
    for (const fn of f.functions) {
      if (fn.returnType) fnReturnType.set(`${f.path}::${fn.name}`, fn.returnType);
    }
  }

  // Propagate in topo order
  const results: PropagatedType[] = [];
  for (const filePath of topoOrder) {
    // Find connections where this file is the caller (target)
    const outgoing = connections.filter(c => c.target === filePath);
    for (const conn of outgoing) {
      const calleeType = fnReturnType.get(`${conn.source}::${conn.fn}`);
      if (!calleeType) continue;
      results.push({
        callerFile: filePath,
        calleeName: conn.fn,
        inferredType: calleeType,
        confidence: 0.85,
      });
    }
  }

  return results;
}
