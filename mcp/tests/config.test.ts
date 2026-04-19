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
});

test('returns null when no grasp.yml present', async () => {
  const cfg = await loadGraspConfig(dir);
  expect(cfg).toBeNull();
});

test('throws on invalid rule structure', () => {
  const bad = { rules: [{ unknown_key: 'x' }] };
  expect(() => validateConfig(bad)).toThrow('Unknown rule key: unknown_key');
});
