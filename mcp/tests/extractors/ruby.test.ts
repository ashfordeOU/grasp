import TreeSitter from 'tree-sitter';
const RubyGrammar = require('tree-sitter-ruby');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/ruby';

const GOLDEN = `
class DataProcessor
  def initialize(name)
    @name = name
  end

  def process(data)
    data.map { |x| transform(x) }
  end

  def self.create(name)
    new(name)
  end

  private

  def _validate(input)
    !input.nil?
  end
end

module Helpers
  def format(str)
    str.upcase
  end
end
`;

describe('Ruby extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(RubyGrammar); });

  test('extracts class', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'processor.rb');
      const cls = fns.find(f => f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('DataProcessor');
      expect(cls!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts method inside class', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'processor.rb');
      const fn = fns.find(f => f.name === 'process');
      expect(fn).toBeDefined();
      expect(fn!.isClassMethod).toBe(true);
      expect(fn!.className).toBe('DataProcessor');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts module', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'processor.rb');
      const mod = fns.find(f => f.type === 'module');
      expect(mod).toBeDefined();
      expect(mod!.name).toBe('Helpers');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks underscore-prefixed method as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'processor.rb');
      const fn = fns.find(f => f.name === '_validate');
      expect(fn).toBeDefined();
      expect(fn!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts method calls', () => {
    const src = `process("data"); process("more"); format("x")`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['process', 'format', 'missing']));
      expect(result['process']).toBeGreaterThanOrEqual(1);
      expect(result['missing']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
