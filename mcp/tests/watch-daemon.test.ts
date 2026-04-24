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
  // Use 50ms debounce so the callback fires quickly even under CI load
  const daemon = new WatchDaemon(tmpDir, brain, async () => { callCount++; }, 50);
  daemon.start();

  // Give the watcher a moment to register before writing
  await new Promise(r => setTimeout(r, 100));
  fs.writeFileSync(path.join(tmpDir, 'test.ts'), 'export const x = 1;');

  // poll up to 3 seconds for debounced callback
  await new Promise<void>(resolve => {
    let check: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => { if (check) clearInterval(check); resolve(); }, 3000);
    check = setInterval(() => { if (callCount > 0) { clearInterval(check!); clearTimeout(t); resolve(); } }, 20);
  });

  daemon.stop();
  expect(callCount).toBeGreaterThan(0);
}, 15000);
