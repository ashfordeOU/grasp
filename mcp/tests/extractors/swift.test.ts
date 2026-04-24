import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SwiftGrammar = require('tree-sitter-swift');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/swift';

const GOLDEN = `
import Foundation

func greet(name: String) -> String {
    return "Hello, \\(name)"
}

class DataService {
    func fetchData(url: String) -> String? { return nil }
    func processData(_ data: String) -> String { return "" }
}

struct Point {
    var x: Double
    func distance() -> Double { return 0.0 }
}

protocol Drawable {
    func draw()
}

enum Direction {
    case north, south
    func opposite() -> Direction { return .north }
}

extension DataService {
    func reload() { }
}
`;

describe('Swift extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(SwiftGrammar);
  });

  test('extracts top-level function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const fn = fns.find(f => f.name === 'greet' && f.type === 'function');
      expect(fn).toBeDefined();
      expect(fn!.isTopLevel).toBe(true);
      expect(fn!.astBacked).toBe(true);
      expect(fn!.isExported).toBe(false);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const cls = fns.find(f => f.name === 'DataService' && f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts struct as class type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const s = fns.find(f => f.name === 'Point');
      expect(s).toBeDefined();
      expect(s!.type).toBe('class');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts protocol as interface type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const p = fns.find(f => f.name === 'Drawable');
      expect(p).toBeDefined();
      expect(p!.type).toBe('interface');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts enum as class type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const e = fns.find(f => f.name === 'Direction');
      expect(e).toBeDefined();
      expect(e!.type).toBe('class');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts methods inside class with correct className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const method = fns.find(f => f.name === 'fetchData');
      expect(method).toBeDefined();
      expect(method!.type).toBe('method');
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('DataService');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts direct function calls', () => {
    const src = `
func main() {
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

  test('extracts method inside struct with correct className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const method = fns.find(f => f.name === 'distance');
      expect(method).toBeDefined();
      expect(method!.type).toBe('method');
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('Point');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('top-level functions do not have isClassMethod set', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.swift');
      const fn = fns.find(f => f.name === 'greet');
      expect(fn!.isClassMethod).toBeUndefined();
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts method calls via navigation expression', () => {
    const src = `
func main() {
    let svc = DataService()
    svc.fetchData(url: "x")
    svc.fetchData(url: "y")
}
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['fetchData', 'unused']));
      expect(result['fetchData']).toBe(2);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls does not count string contents', () => {
    const src = `let msg = "call greet now"`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet']));
      expect(result['greet']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('handles empty input gracefully', () => {
    const result = extractDefinitions(null as any, '', 'empty.swift');
    expect(result).toEqual([]);
  });

  test('extracts return type from func declaration', () => {
    const src = `
func getUser(id: Int) -> User? {
  return nil
}
func process(data: String) -> Void {}
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'repo.swift');
      const getUser = fns.find(f => f.name === 'getUser');
      expect(getUser?.returnType).toBe('User?');
      const process = fns.find(f => f.name === 'process');
      expect(process?.returnType).toBe('Void');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
