import { GraspContextProvider } from '../GraspContextProvider';

const MOCK_RESULT = JSON.stringify({
  summary: { healthGrade: 'A', healthScore: 95, fileCount: 42, issueCount: 1 },
  files: [
    { path: 'src/index.ts', complexity: 45, healthGrade: 'D' },
    { path: 'src/utils.ts', complexity: 10, healthGrade: 'A' },
  ],
  security: [{ file: 'src/index.ts', severity: 'HIGH', desc: 'eval() usage' }],
});

jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) => cb(null, { stdout: MOCK_RESULT, stderr: '' })),
}));

test('provider returns health summary as first context item', async () => {
  const provider = new GraspContextProvider();
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[0].name).toBe('Grasp Health Summary');
  expect(items[0].content).toContain('A');
  expect(items[0].content).toContain('95/100');
});

test('provider returns complexity hotspots as second item', async () => {
  const provider = new GraspContextProvider();
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[1].name).toBe('Grasp Complexity Hotspots');
  expect(items[1].content).toContain('src/index.ts');
});

test('provider returns security issues as third item', async () => {
  const provider = new GraspContextProvider();
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[2].name).toBe('Grasp Security Issues');
  expect(items[2].content).toContain('eval()');
});

test('provider falls back to offline when CLI and HTTP both fail', async () => {
  const { execFile } = require('child_process');
  execFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: object, cb: (err: Error) => void) =>
    cb(new Error('ENOENT'))
  );
  const mockFetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
  global.fetch = mockFetch;

  const provider = new GraspContextProvider({ graspServerUrl: 'http://localhost:9999' });
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[0].name).toContain('offline');
});
