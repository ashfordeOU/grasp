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
