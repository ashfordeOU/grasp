import { SearchIndex } from '../src/search.js';

test('indexes and searches across multiple repos', () => {
  const idx = new SearchIndex();
  idx.index('acme/backend', [{ path: 'src/auth.ts', functions: ['login', 'logout'] }]);
  idx.index('acme/frontend', [{ path: 'src/api.ts', functions: ['fetchUser', 'authGuard'] }]);
  const results = idx.search('auth');
  expect(results.length).toBeGreaterThan(0);
  expect(results.some(r => r.repo === 'acme/backend')).toBe(true);
});

test('search deduplicates results for same file', () => {
  const idx = new SearchIndex();
  idx.index('acme/backend', [{ path: 'src/auth.ts', functions: ['authLogin', 'authLogout'] }]);
  // 'auth' matches both the path and both function names
  const results = idx.search('auth');
  const deduped = results.filter(r => r.file === 'src/auth.ts');
  expect(deduped).toHaveLength(1);
});
