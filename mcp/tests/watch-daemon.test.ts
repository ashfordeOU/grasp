import { WatchDaemon } from '../src/watch-daemon.js';
import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-daemon-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('WatchDaemon instantiates without starting', () => {
  const daemon = new WatchDaemon(tmpDir, brain, async () => {});
  expect(daemon).toBeDefined();
  daemon.stop();
});

test('WatchDaemon.stop() is idempotent', () => {
  const daemon = new WatchDaemon(tmpDir, brain, async () => {});
  daemon.stop();
  expect(() => daemon.stop()).not.toThrow();
});

test('WatchDaemon calls reindex when a file changes', async () => {
  let callCount = 0;
  const daemon = new WatchDaemon(tmpDir, brain, async () => { callCount++; });
  daemon.start();

  // write a file to trigger change
  fs.writeFileSync(path.join(tmpDir, 'test.ts'), 'export const x = 1;');

  // wait up to 1.5 seconds for debounced callback
  await new Promise<void>(resolve => {
    const t = setTimeout(() => resolve(), 1500);
    const check = setInterval(() => { if (callCount > 0) { clearInterval(check); clearTimeout(t); resolve(); } }, 50);
  });

  daemon.stop();
  expect(callCount).toBeGreaterThan(0);
}, 10000);
