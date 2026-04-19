import { analyzeRepo } from '../analyze-repo';
import { showToast, Toast } from '@raycast/api';

const mockShowToast = showToast as jest.Mock;

beforeEach(() => mockShowToast.mockReset());

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
    title: 'Analysing...',
  }));
});

test('analyzeRepo shows success for valid repo', async () => {
  await analyzeRepo('owner/repo');
  const calls = mockShowToast.mock.calls;
  expect(calls.some(c => c[0].style === Toast.Style.Success)).toBe(true);
});
