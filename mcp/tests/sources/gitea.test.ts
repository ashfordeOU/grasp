import { GiteaSource } from '../../src/sources/gitea.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

test('getFileTree filters blobs from tree', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      tree: [
        { path: 'src/index.ts', type: 'blob', size: 512 },
        { path: 'src', type: 'tree' },
        { path: 'README.md', type: 'blob', size: 1024 },
      ],
    }),
  } as Response);

  const src = new GiteaSource('http://localhost:3000', 'testuser', 'testrepo');
  const files = await src.getFileTree();
  expect(files).toHaveLength(2);
  expect(files.map(f => f.path)).toEqual(['src/index.ts', 'README.md']);
  expect(files[0].name).toBe('index.ts');
  expect(files[0].folder).toBe('src');
  expect(files[1].folder).toBe('/');
});

test('getFileTree uses token header when provided', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ tree: [] }) } as Response);
  const src = new GiteaSource('http://localhost:3000', 'user', 'repo', 'mytoken');
  await src.getFileTree();
  const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
  expect(headers.Authorization).toBe('token mytoken');
});

test('getFileTree no token means no auth header', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ tree: [] }) } as Response);
  const src = new GiteaSource('http://localhost:3000', 'user', 'repo');
  await src.getFileTree();
  const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
  expect(headers.Authorization).toBeUndefined();
});

test('getFileTree throws on error', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  const src = new GiteaSource('http://localhost:3000', 'user', 'repo');
  await expect(src.getFileTree()).rejects.toThrow('404');
});

// E2E test — skipped unless GITEA_URL env var is set
const GITEA_URL = process.env.GITEA_URL;
(GITEA_URL ? test : test.skip)('E2E: fetches file tree from live Gitea', async () => {
  const src = new GiteaSource(GITEA_URL!, 'testuser', 'testrepo');
  const files = await src.getFileTree();
  expect(files.length).toBeGreaterThan(0);
}, 10000);
