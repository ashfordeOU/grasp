import { GroupManager } from '../src/group-manager';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const TMP_DIR = path.join(os.tmpdir(), 'grasp-group-test-' + process.pid);
fs.mkdirSync(TMP_DIR, { recursive: true });

afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

test('addToGroup and listGroup round-trip', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('backend', 'owner/repo-a');
  gm.addToGroup('backend', 'owner/repo-b');
  expect(gm.getGroup('backend')).toEqual(['owner/repo-a', 'owner/repo-b']);
});

test('addToGroup deduplicates', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('team', 'owner/repo-a');
  gm.addToGroup('team', 'owner/repo-a');
  expect(gm.getGroup('team')).toHaveLength(1);
});

test('listGroups returns all group names', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('alpha', 'a/b');
  gm.addToGroup('beta', 'c/d');
  const groups = gm.listGroups();
  expect(groups.some(g => g.name === 'alpha')).toBe(true);
  expect(groups.some(g => g.name === 'beta')).toBe(true);
});
