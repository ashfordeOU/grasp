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
