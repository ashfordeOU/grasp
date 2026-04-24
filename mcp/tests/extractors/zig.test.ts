// Zig grammar (tree-sitter-zig) native binding is ABI-incompatible with the
// current tree-sitter runtime (0.22.4). Tests here only verify the extractor's
// graceful-fallback path. Full parsing tests will be enabled when the npm
// package ships a compatible prebuild.

import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/zig';

describe('Zig extractor', () => {
  test('handles null tree gracefully', () => {
    const result = extractDefinitions(null as any, '', 'main.zig');
    expect(result).toEqual([]);
  });

  test('handles null rootNode gracefully', () => {
    const result = extractDefinitions({ rootNode: null } as any, '', 'main.zig');
    expect(result).toEqual([]);
  });

  test('countCalls handles null tree gracefully', () => {
    const result = countCalls(null as any, new Set(['add', 'mul']));
    expect(result['add']).toBe(0);
    expect(result['mul']).toBe(0);
  });

  test('countCalls initialises all requested names to zero', () => {
    const result = countCalls(null as any, new Set(['a', 'b', 'c']));
    expect(Object.keys(result)).toHaveLength(3);
    Object.values(result).forEach(v => expect(v).toBe(0));
  });

  test('extractDefinitions returns array', () => {
    expect(Array.isArray(extractDefinitions(null as any, '', 'x.zig'))).toBe(true);
  });
});
