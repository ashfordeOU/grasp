import { BitbucketSource } from '../../src/sources/bitbucket.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

test('getFileTree returns files from Bitbucket API', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      values: [
        { path: 'src/index.ts', size: 1024, type: 'commit_file' },
        { path: 'package.json', size: 512, type: 'commit_file' },
      ],
    }),
  } as Response);

  const src = new BitbucketSource('testuser', 'testrepo', 'testuser', 'apppassword');
  const files = await src.getFileTree();
  expect(files).toHaveLength(2);
  expect(files[0].path).toBe('src/index.ts');
  expect(files[0].name).toBe('index.ts');
  expect(files[0].folder).toBe('src');
  expect(files[1].path).toBe('package.json');
  expect(files[1].folder).toBe('/');
});

test('getFileTree throws on API error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  } as Response);

  const src = new BitbucketSource('testuser', 'testrepo', 'testuser', 'bad-password');
  await expect(src.getFileTree()).rejects.toThrow('401');
});

test('getFileContent returns file text', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: async () => 'export const foo = 1;',
  } as unknown as Response);

  const src = new BitbucketSource('testuser', 'testrepo', 'testuser', 'apppassword');
  const content = await src.getFileContent('src/index.ts');
  expect(content).toBe('export const foo = 1;');
});

test('authHeader is base64 Basic auth', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ values: [] }),
  } as Response);

  const src = new BitbucketSource('ws', 'repo', 'user', 'pass');
  await src.getFileTree();
  const call = mockFetch.mock.calls[0];
  const headers = call[1]?.headers as Record<string, string>;
  expect(headers.Authorization).toMatch(/^Basic /);
});
