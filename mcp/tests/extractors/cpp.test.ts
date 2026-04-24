import TreeSitter from 'tree-sitter';
const CppGrammar = require('tree-sitter-cpp');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/cpp';

const GOLDEN = `
#include <string>

class Server {
public:
    void start(int port);
    std::string getStatus() const;
private:
    void cleanup();
};

void Server::start(int port) {
    cleanup();
}

std::string Server::getStatus() const {
    return "ok";
}

void Server::cleanup() {}

int freeFunction(int x) {
    return x + 1;
}
`;

describe('C++ extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(CppGrammar); });

  test('extracts free function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'server.cpp');
      const fn1 = fns.find(f => f.name === 'freeFunction');
      expect(fn1).toBeDefined();
      expect(fn1!.isTopLevel).toBe(true);
      expect(fn1!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts out-of-line method with className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'server.cpp');
      const fn1 = fns.find(f => f.name === 'start');
      expect(fn1).toBeDefined();
      expect(fn1!.isClassMethod).toBe(true);
      expect(fn1!.className).toBe('Server');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts all out-of-line methods', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'server.cpp');
      const names = fns.map(f => f.name);
      expect(names).toContain('getStatus');
      expect(names).toContain('cleanup');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts function calls', () => {
    const src = `int main() { freeFunction(1); freeFunction(2); }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['freeFunction', 'start']));
      expect(result['freeFunction']).toBe(2);
      expect(result['start']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
