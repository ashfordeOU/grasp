import { normalizeGitLabUrl, isGitLabSource, fetchGitLabChurn, fetchGitLabOwnership, fetchGitLabCiStatus, fetchGitLabIssues } from '../../src/sources/gitlab.js';

test('normalizeGitLabUrl parses gitlab.com URL', () => {
  const result = normalizeGitLabUrl('https://gitlab.com/inkscape/inkscape');
  expect(result).toEqual({ host: 'gitlab.com', namespace: 'inkscape', project: 'inkscape' });
});

test('isGitLabSource detects gitlab.com URLs', () => {
  expect(isGitLabSource('https://gitlab.com/foo/bar')).toBe(true);
  expect(isGitLabSource('https://github.com/foo/bar')).toBe(false);
});

test('normalizeGitLabUrl parses URL without protocol', () => {
  const result = normalizeGitLabUrl('gitlab.com/foo/bar');
  expect(result).toEqual({ host: 'gitlab.com', namespace: 'foo', project: 'bar' });
});

test('normalizeGitLabUrl parses self-hosted GitLab URL', () => {
  const result = normalizeGitLabUrl('https://gitlab.mycompany.com/ns/proj');
  expect(result).toEqual({ host: 'gitlab.mycompany.com', namespace: 'ns', project: 'proj' });
});

test('normalizeGitLabUrl strips .git suffix', () => {
  const result = normalizeGitLabUrl('https://gitlab.com/foo/bar.git');
  expect(result).toEqual({ host: 'gitlab.com', namespace: 'foo', project: 'bar' });
});

const mockSrc = { host: 'gitlab.example.com', namespace: 'org', project: 'repo', token: 'glpat-test' };

describe('fetchGitLabChurn', () => {
  it('returns commit count from API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{}, {}, {}],
    }) as any;
    const count = await fetchGitLabChurn(mockSrc, 'src/index.ts', 10);
    expect(count).toBe(3);
  });

  it('returns 0 on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const count = await fetchGitLabChurn(mockSrc, 'src/index.ts');
    expect(count).toBe(0);
  });
});

describe('fetchGitLabCiStatus', () => {
  it('returns mapped status from latest pipeline', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ status: 'success' }],
    }) as any;
    const status = await fetchGitLabCiStatus(mockSrc);
    expect(status).toBe('success');
  });

  it('returns unknown when no pipelines', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as any;
    const status = await fetchGitLabCiStatus(mockSrc);
    expect(status).toBe('unknown');
  });

  it('returns unknown on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const status = await fetchGitLabCiStatus(mockSrc);
    expect(status).toBe('unknown');
  });
});

describe('fetchGitLabOwnership', () => {
  it('aggregates blame entries by author and sorts by lineCount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { commit: { author_email: 'a@x.com', author_name: 'Alice' } },
        { commit: { author_email: 'b@x.com', author_name: 'Bob' } },
        { commit: { author_email: 'a@x.com', author_name: 'Alice' } },
      ],
    }) as any;
    const owners = await fetchGitLabOwnership(mockSrc, 'src/index.ts');
    expect(owners[0].email).toBe('a@x.com');
    expect(owners[0].lineCount).toBe(2);
    expect(owners[1].email).toBe('b@x.com');
    expect(owners[1].lineCount).toBe(1);
  });

  it('returns empty array on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const owners = await fetchGitLabOwnership(mockSrc, 'src/index.ts');
    expect(owners).toEqual([]);
  });
});

describe('fetchGitLabIssues', () => {
  it('returns issues from API', async () => {
    const mockIssues = [{ id: 1, iid: 1, title: 'Bug', state: 'opened', web_url: 'http://x' }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockIssues,
    }) as any;
    const issues = await fetchGitLabIssues(mockSrc);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('Bug');
  });

  it('returns empty array on API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const issues = await fetchGitLabIssues(mockSrc);
    expect(issues).toEqual([]);
  });
});
