import { SearchableBrainStore as BrainStore } from '../src/brain-search';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const TMP = path.join(os.tmpdir(), 'grasp-test-' + process.pid);

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('bm25Search returns results for matching term', () => {
  const brain = new BrainStore(TMP);
  const db = brain.getDb();
  // Insert a test FTS row
  db.prepare("INSERT INTO fts_idx (file_path, fn_name, body) VALUES (?, ?, ?)")
    .run('repo1:src/auth.ts', 'validateToken', 'validateToken function auth layer');
  const results = brain.bm25Search('repo1', 'auth token', 5);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].filePath).toBe('src/auth.ts');
  brain.close();
});

test('bm25Search returns empty for no match', () => {
  const brain = new BrainStore(TMP + '2');
  const results = brain.bm25Search('repo99', 'zzznomatch', 5);
  expect(results).toEqual([]);
  brain.close();
});
