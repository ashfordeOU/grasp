import { parseJiraIssues } from '../src/jira.js';

test('parseJiraIssues maps issues to files from summary + description', () => {
  const issues = [
    { key: 'ENG-123', summary: 'Fix auth.ts login bug', description: 'auth service broken', status: 'Open' },
  ];
  const files = ['src/auth.ts', 'src/utils.ts'];
  const mapped = parseJiraIssues(issues, files);
  expect(mapped['src/auth.ts']).toContainEqual(expect.objectContaining({ key: 'ENG-123' }));
  expect(mapped['src/utils.ts']).toBeUndefined();
});

test('parseJiraIssues ignores issues with no file match', () => {
  const issues = [{ key: 'ENG-999', summary: 'Update documentation', description: 'docs only', status: 'Done' }];
  const files = ['src/auth.ts'];
  const mapped = parseJiraIssues(issues, files);
  expect(Object.keys(mapped)).toHaveLength(0);
});
