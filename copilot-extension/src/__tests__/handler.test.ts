import { handleCopilotMessage } from '../index';

const MOCK_RESULT = JSON.stringify({
  summary: { healthGrade: 'A', healthScore: 95, fileCount: 42 },
  issues: [{ description: 'High complexity: src/index.ts' }],
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) => cb(null, { stdout: MOCK_RESULT, stderr: '' })),
}));

test('responds to @grasp analyze with real health report', async () => {
  const response = await handleCopilotMessage({ content: '@grasp analyze test/repo' });
  expect(response.content).toContain('Health Report');
  expect(response.content).toContain('test/repo');
  expect(response.content).toContain('Grade:** A');
  expect(response.content).toContain('95/100');
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
