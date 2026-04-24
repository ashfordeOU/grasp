import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScalaGrammar = require('tree-sitter-scala');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/scala';

const GOLDEN = `
def greet(name: String): String = s"Hello, $name"

class DataProcessor(name: String) {
  def process(data: List[String]): List[String] = data.map(_.trim)
  def validate(input: String): Boolean = input.nonEmpty
}

object Config {
  def load(): Unit = ()
}

trait Serializable {
  def serialize(): String
  def deserialize(s: String): Unit
}
`;

describe('Scala extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(ScalaGrammar);
  });

  test('extracts top-level function definition', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const fn = fns.find(f => f.name === 'greet');
      expect(fn).toBeDefined();
      expect(fn!.type).toBe('function');
      expect(fn!.isTopLevel).toBe(true);
      expect(fn!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class definition', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const cls = fns.find(f => f.name === 'DataProcessor' && f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts object definition as class type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const obj = fns.find(f => f.name === 'Config');
      expect(obj).toBeDefined();
      expect(obj!.type).toBe('class');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts trait as interface type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const trait = fns.find(f => f.name === 'Serializable');
      expect(trait).toBeDefined();
      expect(trait!.type).toBe('interface');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts method inside class with correct className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const method = fns.find(f => f.name === 'process');
      expect(method).toBeDefined();
      expect(method!.type).toBe('method');
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('DataProcessor');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts abstract method in trait', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Main.scala');
      const method = fns.find(f => f.name === 'serialize');
      expect(method).toBeDefined();
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('Serializable');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts direct function calls', () => {
    const src = `
def main(): Unit = {
  greet("Alice")
  greet("Bob")
}
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet', 'unused']));
      expect(result['greet']).toBeGreaterThanOrEqual(1);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls does not count string content', () => {
    const src = `val msg = "call greet now"`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet']));
      expect(result['greet']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('handles empty input gracefully', () => {
    const result = extractDefinitions(null as any, '', 'empty.scala');
    expect(result).toEqual([]);
  });
});
