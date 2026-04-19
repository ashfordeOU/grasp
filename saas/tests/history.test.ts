import { HistoryStore } from '../src/history.js';

test('records and retrieves health snapshots', async () => {
  const store = new HistoryStore();
  await store.record('owner/repo', { score: 87, grade: 'A', fileCount: 142, analyzedAt: '2026-04-19T10:00:00Z' });
  await store.record('owner/repo', { score: 82, grade: 'B', fileCount: 148, analyzedAt: '2026-04-20T10:00:00Z' });
  const history = await store.get('owner/repo', 30);
  expect(history).toHaveLength(2);
  expect(history[0].score).toBe(87);
});

test('returns empty array for unknown repo', async () => {
  const store = new HistoryStore();
  expect(await store.get('nobody/nothing', 30)).toEqual([]);
});
