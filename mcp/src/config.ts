import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ForbiddenRule     { forbidden: string }
export interface MaxBlastRule      { max_blast_radius: number }
export interface MinHealthRule     { min_health_score: number }
export interface MaxComplexityRule { max_complexity: number }
export interface MaxDepthRule      { max_layer_depth: number }
export interface RequiredCoverageRule { required_coverage: number }

export type GraspRule =
  | ForbiddenRule | MaxBlastRule | MinHealthRule
  | MaxComplexityRule | MaxDepthRule | RequiredCoverageRule;

export interface GraspConfig {
  rules: GraspRule[];
  ignore?: string[];
  thresholds?: Record<string, number>;
}

const KNOWN_KEYS = new Set([
  'forbidden','max_blast_radius','min_health_score',
  'max_complexity','max_layer_depth','required_coverage',
]);

export function validateConfig(raw: unknown): GraspConfig {
  if (!raw || typeof raw !== 'object') throw new Error('grasp.yml must be an object');
  const obj = raw as Record<string, unknown>;
  const rules: GraspRule[] = [];
  for (const rule of (obj.rules as unknown[] ?? [])) {
    if (!rule || typeof rule !== 'object') throw new Error('Each rule must be an object');
    const key = Object.keys(rule as object)[0];
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown rule key: ${key}`);
    rules.push(rule as GraspRule);
  }
  return { rules, ignore: obj.ignore as string[], thresholds: obj.thresholds as Record<string, number> };
}

export async function loadGraspConfig(dir: string): Promise<GraspConfig | null> {
  for (const name of ['grasp.yml', 'grasp.yaml', '.grasp.yml']) {
    try {
      const raw = await readFile(join(dir, name), 'utf-8');
      return validateConfig(parseYaml(raw));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return null;
}

export interface RuleViolation {
  rule: string;
  message: string;
  file?: string;
  severity: 'error' | 'warn';
}

export interface EvalContext {
  score: number;
  blastMap: Record<string, number>;
  layers: string[];
}

export function evaluateRules(cfg: GraspConfig, ctx: EvalContext): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of cfg.rules) {
    if ('min_health_score' in rule && ctx.score < rule.min_health_score) {
      violations.push({ rule: 'min_health_score', severity: 'error',
        message: `Health score ${ctx.score} is below required minimum ${rule.min_health_score}` });
    }
    if ('max_blast_radius' in rule) {
      for (const [file, radius] of Object.entries(ctx.blastMap)) {
        if (radius > rule.max_blast_radius) {
          violations.push({ rule: 'max_blast_radius', severity: 'warn', file,
            message: `${file} blast radius ${radius} exceeds max ${rule.max_blast_radius}` });
        }
      }
    }
    // Phase 2: forbidden, max_complexity, max_layer_depth, required_coverage evaluation
    // These rule types are validated by validateConfig but not yet evaluated.
  }
  return violations;
}
