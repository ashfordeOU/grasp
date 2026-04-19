import { handleQCommand } from '../plugin';

test('handles /grasp command with repo', async () => {
  const result = await handleQCommand({ command: '/grasp', args: 'test/repo' });
  expect(result.message).toContain('Grasp');
  expect(result.message).toContain('test/repo');
});

test('handles /grasp without args shows usage', async () => {
  const result = await handleQCommand({ command: '/grasp' });
  expect(result.message).toContain('Usage');
});

test('handles unknown command', async () => {
  const result = await handleQCommand({ command: '/other' });
  expect(result.type).toBe('error');
});

test('response type is code for valid repo', async () => {
  const result = await handleQCommand({ command: '/grasp', args: 'owner/repo' });
  expect(result.type).toBe('code');
});
