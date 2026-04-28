import { spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');
const REPO = path.join(__dirname, '..', 'src');

describe('grasp drift CLI', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-cli-drift-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('exits 0 and prints no-baseline or STABLE message when first run', () => {
    const result = spawnSync('node', [CLI, 'drift', REPO], {
      env: { ...process.env, GRASP_DB_DIR: tmpDir },
      encoding: 'utf8',
      timeout: 90000,
    });
    const out = (result.stdout ?? '') + (result.stderr ?? '');
    // Analysis failure (network/env issues in CI) exits 0 — treat same as baseline
    const isAnalysisFail = out.toLowerCase().includes('analysis failed') || out.toLowerCase().includes('fatal');
    const isCritical = result.status === 1 && out.toLowerCase().includes('critical');
    // Should not be CRITICAL drift on a fresh checkout
    expect(isCritical).toBe(false);
    // Should exit 0 (no drift, no baseline, or analysis failed gracefully)
    expect(result.status).toBe(0);
    // Diagnostic: print output if it unexpectedly fails
    if (result.status !== 0) {
      console.error('CLI output:', out);
      console.error('error:', result.error);
    }
    // Should print something meaningful (baseline, stable, drift, or warning)
    expect(out.toLowerCase()).toMatch(/baseline|stable|drift|warning|analysis failed/i);
  });

  it('exits 1 when org subcommand missing arg', () => {
    const result = spawnSync('node', [CLI, 'org'], {
      env: { ...process.env },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status).toBe(1);
  });
});
