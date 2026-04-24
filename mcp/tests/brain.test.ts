import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-brain-test-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('creates brain.db in the given directory', () => {
  expect(fs.existsSync(path.join(tmpDir, 'brain.db'))).toBe(true);
});

test('upsertRepo stores a repo and getRepo retrieves it', () => {
  brain.upsertRepo({
    source: 'owner/repo',
    sourceType: 'github',
    healthScore: 72,
    healthGrade: 'C',
    fileCount: 50,
    functionCount: 300,
    issueCount: 5,
    securityIssueCount: 1,
    circularDepCount: 2,
    sessionId: 'abc123',
  });
  const r = brain.getRepo('owner/repo');
  expect(r).not.toBeNull();
  expect(r!.healthScore).toBe(72);
  expect(r!.healthGrade).toBe('C');
});

test('listRepos returns all upserted repos', () => {
  brain.upsertRepo({ source: 'a/b', sourceType: 'github', healthScore: 80, healthGrade: 'B', fileCount: 10, functionCount: 50, issueCount: 0, securityIssueCount: 0, circularDepCount: 0, sessionId: 's1' });
  brain.upsertRepo({ source: 'c/d', sourceType: 'github', healthScore: 60, healthGrade: 'D', fileCount: 20, functionCount: 100, issueCount: 3, securityIssueCount: 0, circularDepCount: 1, sessionId: 's2' });
  expect(brain.listRepos()).toHaveLength(2);
});

test('deleteRepo removes the repo', () => {
  brain.upsertRepo({ source: 'del/me', sourceType: 'local', healthScore: 50, healthGrade: 'D', fileCount: 5, functionCount: 20, issueCount: 1, securityIssueCount: 0, circularDepCount: 0, sessionId: 's3' });
  brain.deleteRepo('del/me');
  expect(brain.getRepo('del/me')).toBeNull();
});
