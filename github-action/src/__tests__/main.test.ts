import { formatComment, gradeAboveThreshold } from '../main';

describe('gradeAboveThreshold', () => {
  test('grade A passes threshold D', () => {
    expect(gradeAboveThreshold('A', 'D')).toBe(true);
  });
  test('grade B passes threshold B', () => {
    expect(gradeAboveThreshold('B', 'B')).toBe(true);
  });
  test('grade F fails threshold C', () => {
    expect(gradeAboveThreshold('F', 'C')).toBe(false);
  });
  test('grade D fails threshold B', () => {
    expect(gradeAboveThreshold('D', 'B')).toBe(false);
  });
  test('unknown grade is permissive', () => {
    expect(gradeAboveThreshold('X', 'C')).toBe(true);
  });
});

describe('formatComment', () => {
  test('formats health comment as markdown with grade and score', () => {
    const comment = formatComment({ grade: 'B', score: 78, repo: 'test/repo', issues: [] });
    expect(comment).toContain('Grasp Health Report');
    expect(comment).toContain('Grade: **B**');
    expect(comment).toContain('78/100');
    expect(comment).toContain('test/repo');
  });
  test('grade A uses checkmark emoji', () => {
    const comment = formatComment({ grade: 'A', score: 95, repo: 'org/app', issues: [] });
    expect(comment).toContain('✅');
  });
  test('grade F uses X emoji', () => {
    const comment = formatComment({ grade: 'F', score: 12, repo: 'org/app', issues: [] });
    expect(comment).toContain('❌');
  });
  test('issues are listed when present', () => {
    const comment = formatComment({ grade: 'D', score: 40, repo: 'org/app', issues: ['circular dep in src/auth.ts', 'hardcoded secret'] });
    expect(comment).toContain('circular dep');
    expect(comment).toContain('hardcoded secret');
  });
  test('no issues shows placeholder', () => {
    const comment = formatComment({ grade: 'A', score: 97, repo: 'org/app', issues: [] });
    expect(comment).toContain('No issues found');
  });
});
