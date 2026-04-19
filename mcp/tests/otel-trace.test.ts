import { parseOtelTrace, parseGraspTrace, parseAnyTrace } from '../src/trace-parser.js';

test('parseOtelTrace converts OTEL spans to call edges', () => {
  const otel = {
    resourceSpans: [{
      scopeSpans: [{
        spans: [{ name: 'auth.login', attributes: [{ key: 'code.filepath', value: { stringValue: 'src/auth.ts' } }] }]
      }]
    }]
  };
  const edges = parseOtelTrace(JSON.stringify(otel));
  expect(edges.length).toBeGreaterThan(0);
  expect(edges[0].file).toBe('src/auth.ts');
});

test('parseGraspTrace handles legacy array format', () => {
  const grasp = [{ file: 'src/utils.ts', count: 5 }];
  const edges = parseGraspTrace(JSON.stringify(grasp));
  expect(edges[0].file).toBe('src/utils.ts');
  expect(edges[0].calls).toBe(5);
});

test('parseAnyTrace auto-detects OTEL vs Grasp format', () => {
  const otel = { resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'x', attributes: [] }] }] }] };
  const edges = parseAnyTrace(JSON.stringify(otel));
  expect(Array.isArray(edges)).toBe(true);
});
