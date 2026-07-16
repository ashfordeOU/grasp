import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ElixirGrammar = require('tree-sitter-elixir');
import { extractDefinitions, countCalls, countBranches } from '../../src/tree-sitter/extractors/elixir';

const GOLDEN = `defmodule MyApp.Server do
  def start(opts) do
    if opts[:ready] do
      init(opts)
    else
      :error
    end
  end

  defp init(opts) do
    opts
  end
end
`;

describe('Elixir extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(ElixirGrammar); });

  test('extracts module, def, and defp', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'server.ex');
      const mod = fns.find((f) => f.name === 'MyApp.Server');
      expect(mod?.type).toBe('module');
      const start = fns.find((f) => f.name === 'start');
      expect(start?.type).toBe('function');
      expect(start?.isExported).toBe(true);
      const init = fns.find((f) => f.name === 'init');
      expect(init?.isExported).toBe(false); // defp is private
      expect(fns.every((f) => f.astBacked)).toBe(true);
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });

  test('counts calls and branches', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const calls = countCalls(tree, new Set(['init']));
      expect(calls.init).toBeGreaterThanOrEqual(1);
      expect(countBranches(tree)).toBeGreaterThanOrEqual(1); // the `if`
    } finally { if (typeof (tree as any).delete === "function") (tree as any).delete(); }
  });
});
