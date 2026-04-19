import { analyzeSource } from '../src/analyzer';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = path.join(os.tmpdir(), 'grasp-prog-' + Date.now());
beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'export const a = 1;');
  fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'import { a } from "./a";');
});
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

test('progress callback is called with done/total/file', async () => {
  const calls: Array<{ done: number; total: number; file: string }> = [];
  await analyzeSource({ type: 'local', path: tmpDir }, undefined, (done, total, file) => {
    calls.push({ done, total, file });
  });
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0].total).toBeGreaterThan(0);
  expect(calls[0].file).toBeTruthy();
});

test('progress callback is optional', async () => {
  await expect(analyzeSource({ type: 'local', path: tmpDir })).resolves.toBeDefined();
});
