import { normalizeGitLabUrl, isGitLabSource } from '../../src/sources/gitlab.js';

test('normalizeGitLabUrl parses gitlab.com URL', () => {
  const result = normalizeGitLabUrl('https://gitlab.com/inkscape/inkscape');
  expect(result).toEqual({ host: 'gitlab.com', namespace: 'inkscape', project: 'inkscape' });
});

test('isGitLabSource detects gitlab.com URLs', () => {
  expect(isGitLabSource('https://gitlab.com/foo/bar')).toBe(true);
  expect(isGitLabSource('https://github.com/foo/bar')).toBe(false);
});
