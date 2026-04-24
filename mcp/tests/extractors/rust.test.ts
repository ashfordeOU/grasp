import TreeSitter from 'tree-sitter';
const RustGrammar = require('tree-sitter-rust');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/rust';

const GOLDEN = `
pub fn greet(name: &str) -> String {
    format!("Hello, {}", name)
}

fn private_helper() -> i32 {
    42
}

impl Server {
    pub fn handle(&self, req: i32) -> i32 {
        private_helper()
    }

    fn internal_method(&self) {}
}
`;

describe('Rust extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(RustGrammar); });

  test('extracts pub fn', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'lib.rs');
      const fn1 = fns.find(f => f.name === 'greet');
      expect(fn1).toBeDefined();
      expect(fn1!.isExported).toBe(true);
      expect(fn1!.isTopLevel).toBe(true);
      expect(fn1!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks private fn as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'lib.rs');
      const fn1 = fns.find(f => f.name === 'private_helper');
      expect(fn1).toBeDefined();
      expect(fn1!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts impl method with className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'lib.rs');
      const method = fns.find(f => f.name === 'handle');
      expect(method).toBeDefined();
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('Server');
      expect(method!.isExported).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts private impl method', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'lib.rs');
      const method = fns.find(f => f.name === 'internal_method');
      expect(method).toBeDefined();
      expect(method!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts function calls', () => {
    const src = `fn test() { greet("a"); greet("b"); private_helper(); }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['greet', 'private_helper', 'missing']));
      expect(result['greet']).toBe(2);
      expect(result['private_helper']).toBe(1);
      expect(result['missing']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
