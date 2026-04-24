import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GoGrammar = require('tree-sitter-go');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/go';

const GOLDEN = `
package main

import "fmt"

func Greet(name string) string {
    return "Hello, " + name
}

func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {
    fmt.Println("handling")
}

func privateHelper() {
    fmt.Println("private")
}
`;

describe('Go extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(GoGrammar);
  });

  test('extracts exported top-level function', () => {
    const tree = parser.parse(GOLDEN);
    const fns = extractDefinitions(tree, GOLDEN, 'main.go');
    const greet = fns.find(f => f.name === 'Greet');
    expect(greet).toBeDefined();
    expect(greet!.type).toBe('function');
    expect(greet!.isTopLevel).toBe(true);
    expect(greet!.isExported).toBe(true);
    expect(greet!.astBacked).toBe(true);
  });

  test('extracts method with receiver', () => {
    const tree = parser.parse(GOLDEN);
    const fns = extractDefinitions(tree, GOLDEN, 'main.go');
    const handler = fns.find(f => f.name === 'HandleRequest');
    expect(handler).toBeDefined();
    expect(handler!.type).toBe('method');
    expect(handler!.isClassMethod).toBe(true);
    expect(handler!.className).toContain('Server');
  });

  test('marks unexported function', () => {
    const tree = parser.parse(GOLDEN);
    const fns = extractDefinitions(tree, GOLDEN, 'main.go');
    const helper = fns.find(f => f.name === 'privateHelper');
    expect(helper).toBeDefined();
    expect(helper!.isExported).toBe(false);
  });

  test('countCalls counts function calls', () => {
    const src = `
package main
func main() {
    result := Greet("world")
    Greet("again")
    _ = result
}
`;
    const tree = parser.parse(src);
    const result = countCalls(tree, new Set(['Greet', 'privateHelper']));
    expect(result['Greet']).toBe(2);
    expect(result['privateHelper']).toBe(0);
  });

  test('countCalls does not count string content as calls', () => {
    const src = `package main
var msg = "call Greet now"
`;
    const tree = parser.parse(src);
    const result = countCalls(tree, new Set(['Greet']));
    expect(result['Greet']).toBe(0);
  });
});
