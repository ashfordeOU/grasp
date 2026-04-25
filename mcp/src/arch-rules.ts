export interface ArchRule { from: string; to: string; type: 'FORBIDDEN'; reason?: string; }
export interface RuleViolation { rule: string; from: string; fromLayer: string; to: string; toLayer: string; fn: string; reason: string; }

export function applyArchRules(
  files: Array<{ path: string; layer: string }>,
  connections: Array<{ source: string; target: string; fn: string }>,
  rules: ArchRule[]
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const layerMap: Record<string, string> = {};
  files.forEach(f => { layerMap[f.path] = f.layer; });
  rules.filter(r => r.type === 'FORBIDDEN').forEach(rule => {
    connections.forEach(conn => {
      const srcLayer = layerMap[conn.source];
      const tgtLayer = layerMap[conn.target];
      if (!srcLayer || !tgtLayer) return;
      const fromMatch = rule.from === '*' || rule.from === srcLayer;
      const toMatch   = rule.to   === '*' || rule.to   === tgtLayer;
      if (fromMatch && toMatch) {
        violations.push({ rule: `${rule.from} → ${rule.to}`, from: conn.source, fromLayer: srcLayer, to: conn.target, toLayer: tgtLayer, fn: conn.fn, reason: rule.reason || 'FORBIDDEN' });
      }
    });
  });
  return violations;
}
