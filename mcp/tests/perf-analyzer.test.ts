import { analyzePerfPatterns } from '../src/perf-analyzer';

test('detects N+1 ORM call in loop', () => {
  const files = [{ path: 'src/service.ts', content: `for (const id of ids) {\n  const user = await User.find(id);\n}`, layer: 'services' }];
  const result = analyzePerfPatterns(files);
  expect(result.findings.some(f => f.pattern === 'n+1')).toBe(true);
});

test('detects sync readFileSync in high-fanin file', () => {
  const files = [{ path: 'src/utils.ts', content: `const data = fs.readFileSync('config.json');`, layer: 'utils' }];
  const result = analyzePerfPatterns(files);
  expect(result.findings.some(f => f.pattern === 'sync-io')).toBe(true);
});

test('detects JSON.stringify in loop', () => {
  const files = [{ path: 'src/api.ts', content: `for (const item of items) {\n  const s = JSON.stringify(item);\n}`, layer: 'api' }];
  const result = analyzePerfPatterns(files);
  expect(result.findings.some(f => f.pattern === 'serialization-in-loop')).toBe(true);
});
