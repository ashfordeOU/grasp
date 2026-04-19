import { GraspContextProvider } from '../GraspContextProvider';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

test('provider returns dep graph as context item', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      dependencies: { 'src/index.ts': ['src/utils.ts'] },
      healthGrade: 'A',
      healthScore: 95,
    }),
  } as Response);

  const provider = new GraspContextProvider({ graspServerUrl: 'http://localhost:3000' });
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[0].name).toBe('Grasp Dependency Graph');
  expect(items[0].content).toContain('dependencies');
});

test('provider returns health score item', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ healthGrade: 'B', healthScore: 78 }),
  } as Response);

  const provider = new GraspContextProvider();
  const items = await provider.getContextItems('src/app.ts', {});
  expect(items[1].name).toBe('Grasp Health Score');
  expect(items[1].content).toContain('B');
});

test('provider falls back when server is unavailable', async () => {
  mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

  const provider = new GraspContextProvider({ graspServerUrl: 'http://localhost:9999' });
  const items = await provider.getContextItems('src/index.ts', {});
  expect(items[0].name).toContain('offline');
});

test('provider uses default server URL', () => {
  const provider = new GraspContextProvider();
  expect((provider as unknown as { serverUrl: string }).serverUrl).toBe('http://localhost:3000');
});
