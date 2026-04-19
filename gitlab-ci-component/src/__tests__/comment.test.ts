import { formatMrComment } from '../comment';

test('formats MR comment with grade and score', () => {
  const body = formatMrComment({ grade: 'C', score: 65, repo: 'ns/project' });
  expect(body).toContain('Grasp');
  expect(body).toContain('Grade: **C**');
  expect(body).toContain('65/100');
});

test('grade A gets checkmark emoji', () => {
  const body = formatMrComment({ grade: 'A', score: 95, repo: 'ns/project' });
  expect(body).toContain('✅');
});

test('grade F gets X emoji', () => {
  const body = formatMrComment({ grade: 'F', score: 15, repo: 'ns/project' });
  expect(body).toContain('❌');
});

test('issues are included when present', () => {
  const body = formatMrComment({ grade: 'D', score: 45, repo: 'ns/project', issues: ['circular dep', 'secret exposed'] });
  expect(body).toContain('circular dep');
  expect(body).toContain('secret exposed');
});

test('no issues omits issue section', () => {
  const body = formatMrComment({ grade: 'B', score: 80, repo: 'ns/project' });
  expect(body).not.toContain('Issues:');
});
