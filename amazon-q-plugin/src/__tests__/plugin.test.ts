import { handleQCommand } from '../plugin';

const MOCK_RESULT = JSON.stringify({
  summary: { healthGrade: 'A', healthScore: 95, fileCount: 42 },
  issues: [{ description: 'High complexity: src/index.ts' }],
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) => cb(null, { stdout: MOCK_RESULT, stderr: '' })),
}));

test('handles /grasp command with repo — returns real analysis', async () => {
  const result = await handleQCommand({ command: '/grasp', args: 'test/repo' });
  expect(result.message).toContain('Grasp Health Report');
  expect(result.message).toContain('test/repo');
  expect(result.message).toContain('Grade:** A');
});

test('handles /grasp without args shows usage', async () => {
  const result = await handleQCommand({ command: '/grasp' });
  expect(result.message).toContain('Usage');
});

test('handles unknown command', async () => {
  const result = await handleQCommand({ command: '/other' });
  expect(result.type).toBe('error');
});

test('response type is text for valid repo', async () => {
  const result = await handleQCommand({ command: '/grasp', args: 'owner/repo' });
  expect(result.type).toBe('text');
});
