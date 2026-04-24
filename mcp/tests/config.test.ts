import { loadGraspConfig, validateConfig, type GraspConfig } from '../src/config.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'grasp-cfg-')); });
afterEach(() => rmSync(dir, { recursive: true }));

test('loads valid grasp.yml', async () => {
  writeFileSync(join(dir, 'grasp.yml'), `
rules:
  - forbidden: "utils -> services"
  - max_blast_radius: 50
  - min_health_score: 80
`);
  const cfg = await loadGraspConfig(dir);
  expect(cfg!.rules).toHaveLength(3);
}, 15000);

test('returns null when no grasp.yml present', async () => {
  const cfg = await loadGraspConfig(dir);
  expect(cfg).toBeNull();
}, 15000);

test('throws on invalid rule structure', () => {
  const bad = { rules: [{ unknown_key: 'x' }] };
  expect(() => validateConfig(bad)).toThrow('Unknown rule key: unknown_key');
});

import { evaluateRules, type RuleViolation } from '../src/config.js';

test('evaluateRules detects min_health_score violation', () => {
  const cfg: GraspConfig = { rules: [{ min_health_score: 80 }] };
  const violations = evaluateRules(cfg, { score: 65, blastMap: {}, layers: [] });
  expect(violations).toHaveLength(1);
  expect(violations[0].rule).toBe('min_health_score');
  expect(violations[0].message).toContain('65');
});

test('evaluateRules detects max_blast_radius violation', () => {
  const cfg: GraspConfig = { rules: [{ max_blast_radius: 10 }] };
  const violations = evaluateRules(cfg, { score: 90, blastMap: { 'src/auth.ts': 45 }, layers: [] });
  expect(violations[0].rule).toBe('max_blast_radius');
  expect(violations[0].file).toBe('src/auth.ts');
});

test('evaluateRules passes when all rules met', () => {
  const cfg: GraspConfig = { rules: [{ min_health_score: 80 }] };
  const violations = evaluateRules(cfg, { score: 95, blastMap: {}, layers: [] });
  expect(violations).toHaveLength(0);
});
