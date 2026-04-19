import { normalizeGitLabUrl, isGitLabSource } from '../../src/sources/gitlab.js';

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
