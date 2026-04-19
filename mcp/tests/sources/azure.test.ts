import { AzureSource } from '../../src/sources/azure.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

test('getFileTree filters blobs only and strips leading slash', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      value: [
        { path: '/src/index.ts', gitObjectType: 'blob' },
        { path: '/src', gitObjectType: 'tree' },
        { path: '/package.json', gitObjectType: 'blob' },
      ],
    }),
  } as Response);

  const src = new AzureSource('myorg', 'myproject', 'myrepo', 'mytoken');
  const files = await src.getFileTree();
  expect(files).toHaveLength(2);
  expect(files[0].path).toBe('src/index.ts'); // no leading slash
  expect(files[0].name).toBe('index.ts');
  expect(files[0].folder).toBe('src');
  expect(files[1].path).toBe('package.json');
  expect(files[1].folder).toBe('/');
});

test('getFileTree throws on API error', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' } as Response);
  const src = new AzureSource('myorg', 'myproject', 'myrepo', 'badtoken');
  await expect(src.getFileTree()).rejects.toThrow('403');
});

test('getFileContent returns text', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, text: async () => 'const x = 1;' } as unknown as Response);
  const src = new AzureSource('myorg', 'myproject', 'myrepo', 'mytoken');
  const content = await src.getFileContent('src/index.ts');
  expect(content).toBe('const x = 1;');
});
