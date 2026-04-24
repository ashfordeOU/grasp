import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectEditors, generateHookScript, generateClaudeMd, generateAgentsMd } from '../src/setup-manager.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'grasp-setup-')); });
afterEach(() => rmSync(dir, { recursive: true }));

test('detectEditors returns [] when no marker files exist', () => {
  const editors = detectEditors(dir);
  expect(editors).toEqual([]);
});

test('detectEditors returns [claude-code] when .claude/ dir exists', () => {
  mkdirSync(join(dir, '.claude'));
  const editors = detectEditors(dir);
  expect(editors).toContain('claude-code');
});

test('generateHookScript creates .claude/hooks/pre-tool-use.sh containing grasp context', () => {
  const scriptPath = generateHookScript(dir, 'claude-code');
  expect(existsSync(scriptPath)).toBe(true);
  expect(scriptPath).toContain('.claude/hooks/pre-tool-use.sh');
  const contents = readFileSync(scriptPath, 'utf8');
  expect(contents).toContain('grasp context');
});

test('generateClaudeMd creates CLAUDE.md containing grasp context and owner/repo', () => {
  const p = generateClaudeMd(dir, 'owner/repo');
  expect(existsSync(p)).toBe(true);
  const contents = readFileSync(p, 'utf8');
  expect(contents).toContain('grasp context');
  expect(contents).toContain('owner/repo');
});

test('generateAgentsMd creates AGENTS.md containing grasp context', () => {
  const p = generateAgentsMd(dir, 'owner/repo');
  expect(existsSync(p)).toBe(true);
  const contents = readFileSync(p, 'utf8');
  expect(contents).toContain('grasp context');
});
