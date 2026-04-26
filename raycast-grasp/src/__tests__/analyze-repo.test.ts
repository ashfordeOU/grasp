import { analyzeRepo } from '../analyze-repo';
import { showToast, Toast } from '@raycast/api';

const MOCK_RESULT = JSON.stringify({
  summary: { healthGrade: 'A', healthScore: 95, fileCount: 42, issueCount: 1, securityIssueCount: 0 },
  issues: [{ description: 'High complexity: src/index.ts' }],
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd: string, _args: string[], _opts: object, cb: (err: null, result: { stdout: string; stderr: string }) => void) =>
    cb(null, { stdout: MOCK_RESULT, stderr: '' })
  ),
}));

const mockShowToast = showToast as jest.Mock;

beforeEach(() => mockShowToast.mockClear());

test('analyzeRepo shows failure for invalid format', async () => {
  await analyzeRepo('not-a-valid-repo');
  expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({
    style: Toast.Style.Failure,
  }));
});

test('analyzeRepo starts with Animated toast for valid repo', async () => {
  await analyzeRepo('ashfordeOU/grasp');
  expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({
    style: Toast.Style.Animated,
    title: 'Analysing…',
  }));
});

test('analyzeRepo returns real summary for valid repo', async () => {
  const result = await analyzeRepo('owner/repo');
  expect(result).not.toBeNull();
  expect(result!.grade).toBe('A');
  expect(result!.score).toBe(95);
  expect(result!.fileCount).toBe(42);
});
