import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSGrammar = require('tree-sitter-javascript');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/javascript';

const GOLDEN = `
// A plain function declaration
function greet(name) {
  return 'Hello, ' + name;
}

// Exported generator
export function* counter() {
  yield 1;
}

// Arrow function assigned to const
const addTwo = (a, b) => a + b;

// Exported arrow function
export const multiply = (a, b) => a * b;

// Class with methods
class Greeter {
  constructor(prefix) {
    this.prefix = prefix;
  }
  greet(name) {
    return this.prefix + greet(name);
  }
}

// Exported class
export class Logger {
  log(msg) { console.log(msg); }
}
`;

describe('JavaScript extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(JSGrammar);
  });

  test('extracts plain function declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const greet = fns.find(f => f.name === 'greet' && f.type === 'function');
      expect(greet).toBeDefined();
      expect(greet!.isTopLevel).toBe(true);
      expect(greet!.isExported).toBe(false);
      expect(greet!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('detects exported generator function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const counter = fns.find(f => f.name === 'counter');
      expect(counter).toBeDefined();
      expect(counter!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts arrow function assigned to const', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const addFn = fns.find(f => f.name === 'addTwo');
      expect(addFn).toBeDefined();
      expect(addFn!.type).toBe('function');
      expect(addFn!.isExported).toBe(false);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('detects exported arrow function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const mul = fns.find(f => f.name === 'multiply');
      expect(mul).toBeDefined();
      expect(mul!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const cls = fns.find(f => f.name === 'Greeter');
      expect(cls).toBeDefined();
      expect(cls!.type).toBe('class');
      expect(cls!.isExported).toBe(false);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class methods', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const method = fns.find(f => f.name === 'greet' && f.type === 'method');
      expect(method).toBeDefined();
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('Greeter');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('detects exported class', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'app.js');
      const logger = fns.find(f => f.name === 'Logger');
      expect(logger).toBeDefined();
      expect(logger!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts direct calls', () => {
    const src = `
function runTest() {
  greet('Alice');
  greet('Bob');
  addTwo(1, 2);
}
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet', 'addTwo', 'unused']));
      expect(result['greet']).toBe(2);
      expect(result['addTwo']).toBe(1);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts method calls by property name', () => {
    const src = `
obj.greet('Alice');
obj.greet('Bob');
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet']));
      expect(result['greet']).toBe(2);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls does not count string content as calls', () => {
    const src = `var msg = "call greet now";`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet']));
      expect(result['greet']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('detects named re-export as exported', () => {
    const src = `
function helper() { return 1; }
export { helper };
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'util.js');
      const h = fns.find(f => f.name === 'helper');
      expect(h).toBeDefined();
      expect(h!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('does not extract nested arrow functions as top-level', () => {
    const src = `
function outer() {
  const inner = () => 42;
  return inner;
}
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'util.js');
      expect(fns.find(f => f.name === 'inner')).toBeUndefined();
      expect(fns.find(f => f.name === 'outer')).toBeDefined();
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
