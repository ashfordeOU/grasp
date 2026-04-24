import TreeSitter from 'tree-sitter';
const CGrammar = require('tree-sitter-c');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/c';

const GOLDEN = `
#include <stdio.h>

int add(int a, int b) {
    return a + b;
}

static int helper(int x) {
    return x * 2;
}

void print_result(int n) {
    printf("%d\\n", n);
}
`;

describe('C extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(CGrammar); });

  test('extracts exported function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.c');
      const fn1 = fns.find(f => f.name === 'add');
      expect(fn1).toBeDefined();
      expect(fn1!.isExported).toBe(true);
      expect(fn1!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks static function as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.c');
      const fn1 = fns.find(f => f.name === 'helper');
      expect(fn1).toBeDefined();
      expect(fn1!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts void function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'main.c');
      const fn1 = fns.find(f => f.name === 'print_result');
      expect(fn1).toBeDefined();
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts calls', () => {
    const src = `int main() { int x = add(1, 2); add(3, 4); helper(x); return 0; }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['add', 'helper', 'missing']));
      expect(result['add']).toBe(2);
      expect(result['helper']).toBe(1);
      expect(result['missing']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
