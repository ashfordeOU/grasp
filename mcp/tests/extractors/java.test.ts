import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JavaGrammar = require('tree-sitter-java');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/java';

const GOLDEN = `
public class UserService {
    private String name;

    public UserService(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }

    private void validate() {}

    protected static UserService create(String name) {
        return new UserService(name);
    }
}

interface Processor {
    void process(String input);
}
`;

describe('Java extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(JavaGrammar); });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.java');
      const cls = fns.find(f => f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('UserService');
      expect(cls!.isExported).toBe(true);
      expect(cls!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts public method with className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.java');
      const method = fns.find(f => f.name === 'getName');
      expect(method).toBeDefined();
      expect(method!.isExported).toBe(true);
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('UserService');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks private method as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.java');
      const priv = fns.find(f => f.name === 'validate');
      expect(priv).toBeDefined();
      expect(priv!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts constructor', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.java');
      const ctor = fns.find(f => f.name === 'UserService' && f.type === 'constructor');
      expect(ctor).toBeDefined();
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts return type from method declaration', () => {
    const src = `
public class UserService {
  public User getById(int id) {
    return null;
  }
  public void delete(int id) {}
  public List<String> listNames() { return null; }
}
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'UserService.java');
      const getById = fns.find(f => f.name === 'getById');
      expect(getById?.returnType).toBe('User');
      const del = fns.find(f => f.name === 'delete');
      expect(del?.returnType).toBe('void');
      const listNames = fns.find(f => f.name === 'listNames');
      expect(listNames?.returnType).toBe('List<String>');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts method calls', () => {
    const src = `class Test { void run() { getName(); getName(); validate(); } }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['getName', 'validate', 'missing']));
      expect(result['getName']).toBe(2);
      expect(result['validate']).toBe(1);
      expect(result['missing']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
