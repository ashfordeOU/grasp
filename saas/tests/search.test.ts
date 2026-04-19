import { SearchIndex } from '../src/search.js';

test('indexes and searches across multiple repos', () => {
  const idx = new SearchIndex();
  idx.index('acme/backend', [{ path: 'src/auth.ts', functions: ['login', 'logout'] }]);
  idx.index('acme/frontend', [{ path: 'src/api.ts', functions: ['fetchUser', 'authGuard'] }]);
  const results = idx.search('auth');
  expect(results.length).toBeGreaterThan(0);
  expect(results.some(r => r.repo === 'acme/backend')).toBe(true);
});
