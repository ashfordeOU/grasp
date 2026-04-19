import {
  formatIssueTitle,
  formatIssueDescription,
  createLinearIssue,
} from '../index';

test('formats issue title from circular-dep violation', () => {
  const title = formatIssueTitle({ file: 'src/auth.ts', violation: 'circular-dep', grade: 'F' });
  expect(title).toBe('[Grasp] Circular dependency in src/auth.ts (Grade: F)');
});

test('formats issue title from security-issue violation', () => {
  const title = formatIssueTitle({ file: 'src/db.ts', violation: 'security-issue', grade: 'D' });
  expect(title).toBe('[Grasp] Security issue in src/db.ts (Grade: D)');
});

test('formats issue title with unknown violation type', () => {
  const title = formatIssueTitle({ file: 'src/utils.ts', violation: 'custom-type', grade: 'C' });
  expect(title).toContain('[Grasp]');
  expect(title).toContain('custom-type');
});

test('formatIssueDescription includes file and grade', () => {
  const desc = formatIssueDescription({ file: 'src/index.ts', violation: 'circular-dep', grade: 'F' });
  expect(desc).toContain('src/index.ts');
  expect(desc).toContain('Grade: F');
  expect(desc).toContain('Grasp');
});

test('createLinearIssue calls createFn with formatted title', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ issue: { id: 'test-id', identifier: 'GRA-1' } });
  const result = await createLinearIssue(
    { file: 'src/auth.ts', violation: 'circular-dep', grade: 'F' },
    mockCreate
  );
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ title: '[Grasp] Circular dependency in src/auth.ts (Grade: F)' })
  );
  expect(result.issue.identifier).toBe('GRA-1');
});
