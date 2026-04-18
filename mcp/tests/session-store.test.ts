import { SessionStore } from '../src/session-store';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = path.join(os.tmpdir(), 'grasp-test-' + Date.now());

afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function makeResult(id: string): any {
  return { sessionId: id, source: 'test/repo', sourceType: 'github', analyzedAt: new Date().toISOString(), files: [], connections: [], issues: [], patterns: [], security: [], duplicates: [], layerViolations: [], folders: [], layers: [], summary: { fileCount: 0, codeFileCount: 0, functionCount: 0, connectionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, healthScore: 80, healthGrade: 'B', layers: [], topFolders: [], languages: [] } };
}

test('set then get returns same result', async () => {
  const store = new SessionStore(tmpDir);
  const r = makeResult('abc');
  await store.set('abc', r);
  const got = await store.get('abc');
  expect(got?.sessionId).toBe('abc');
});

test('get returns null for unknown id', async () => {
  const store = new SessionStore(tmpDir);
  expect(await store.get('nope')).toBeNull();
});

test('list returns all sessions', async () => {
  const store = new SessionStore(tmpDir);
  await store.set('a', makeResult('a'));
  await store.set('b', makeResult('b'));
  const list = await store.list();
  expect(list.map(s => s.id).sort()).toEqual(['a', 'b']);
});

test('delete removes session', async () => {
  const store = new SessionStore(tmpDir);
  await store.set('x', makeResult('x'));
  await store.delete('x');
  expect(await store.get('x')).toBeNull();
  const list = await store.list();
  expect(list.find(s => s.id === 'x')).toBeUndefined();
});

test('rejects session id with path traversal characters', async () => {
  const store = new SessionStore(tmpDir);
  await expect(store.get('../etc/passwd')).resolves.toBeNull();
  await expect(store.set('../etc/passwd', makeResult('x'))).rejects.toThrow();
});

test('prune removes expired sessions', async () => {
  const store = new SessionStore(tmpDir, 0.0001); // ~8 seconds TTL
  const r = makeResult('old');
  await store.set('old', r);
  // Manually backdate analyzedAt in the index
  const indexPath = path.join(tmpDir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  index['old'].analyzedAt = new Date(Date.now() - 10000).toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index));
  const pruned = await store.prune();
  expect(pruned).toBe(1);
  expect(await store.get('old')).toBeNull();
});

test('evicts oldest session when over limit', async () => {
  const store = new SessionStore(tmpDir, 7, 2); // limit 2
  await store.set('first', makeResult('first'));
  await store.set('second', makeResult('second'));
  await store.set('third', makeResult('third')); // triggers evict
  const list = await store.list();
  expect(list.length).toBe(2);
  const ids = list.map(s => s.id);
  expect(ids).not.toContain('first');
});
