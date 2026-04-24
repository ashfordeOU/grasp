import { formatSetupSummary } from '../src/cli.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-cli-setup-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('formatSetupSummary([]) returns string containing "No supported editors detected"', () => {
  const result = formatSetupSummary([]);
  expect(result).toContain('No supported editors detected');
});

test('formatSetupSummary([\'claude-code\']) returns string containing "claude-code"', () => {
  const result = formatSetupSummary(['claude-code']);
  expect(result).toContain('claude-code');
});

test('formatSetupSummary([\'claude-code\']) returns string containing "pre-tool-use.sh"', () => {
  const result = formatSetupSummary(['claude-code']);
  expect(result).toContain('pre-tool-use.sh');
});
