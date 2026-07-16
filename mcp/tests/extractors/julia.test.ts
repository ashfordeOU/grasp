import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JuliaGrammar = require('tree-sitter-julia');
import { extractDefinitions, countCalls, countBranches } from '../../src/tree-sitter/extractors/julia';

const GOLDEN = `module Geometry

function compute(x)
  for i in 1:x
    println(i)
  end
end

square(y) = y^2

struct Vec3
  x::Float64
  y::Float64
end

end
`;

describe('Julia extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(JuliaGrammar); });

  test('extracts function, short function, struct, and module', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'geom.jl');
      const byName = (n: string) => fns.find((f) => f.name === n);
      expect(byName('compute')?.type).toBe('function');
      expect(byName('square')?.type).toBe('function');
      expect(byName('Vec3')?.type).toBe('struct');
      expect(byName('Geometry')?.type).toBe('module');
      expect(fns.every((f) => f.astBacked)).toBe(true);
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });

  test('counts calls and branches', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const calls = countCalls(tree, new Set(['println']));
      expect(calls.println).toBeGreaterThanOrEqual(1);
      expect(countBranches(tree)).toBeGreaterThanOrEqual(1); // the `for`
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });
});
