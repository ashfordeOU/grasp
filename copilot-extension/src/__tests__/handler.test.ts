import { handleCopilotMessage } from '../index';

test('responds to @grasp analyze with health report', async () => {
  const response = await handleCopilotMessage({ content: '@grasp analyze test/repo' });
  expect(response.content).toContain('Health');
  expect(response.content).toContain('test/repo');
});

test('responds to @grasp without analyze keyword', async () => {
  const response = await handleCopilotMessage({ content: '@grasp ashfordeOU/grasp' });
  expect(response.content).toContain('ashfordeOU/grasp');
});

test('responds with help for @grasp help', async () => {
  const response = await handleCopilotMessage({ content: '@grasp help' });
  expect(response.content).toContain('Grasp');
  expect(response.content).toContain('Usage');
});

test('responds with usage for unknown command', async () => {
  const response = await handleCopilotMessage({ content: 'what is grasp?' });
  expect(response.content).toContain('Usage');
});
