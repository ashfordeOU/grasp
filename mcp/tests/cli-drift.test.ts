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
    // Should exit 0 (not CRITICAL)
    expect(result.status).toBe(0);
    // Should print something about baseline or stable
    expect((result.stdout + result.stderr).toLowerCase()).toMatch(/baseline|stable|drift/i);
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
