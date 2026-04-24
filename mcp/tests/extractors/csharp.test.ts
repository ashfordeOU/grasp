import TreeSitter from 'tree-sitter';
const CSharpGrammar = require('tree-sitter-c-sharp');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/csharp';

const GOLDEN = `
using System;

public class UserService {
    private string _name;

    public UserService(string name) {
        _name = name;
    }

    public string GetName() {
        return _name;
    }

    private void Validate() {}

    protected static UserService Create(string name) {
        return new UserService(name);
    }
}

public interface IProcessor {
    void Process(string input);
}
`;

describe('C# extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(CSharpGrammar); });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.cs');
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
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.cs');
      const method = fns.find(f => f.name === 'GetName');
      expect(method).toBeDefined();
      expect(method!.isExported).toBe(true);
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('UserService');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks private method as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.cs');
      const priv = fns.find(f => f.name === 'Validate');
      expect(priv).toBeDefined();
      expect(priv!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts constructor', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'UserService.cs');
      const ctor = fns.find(f => f.type === 'constructor');
      expect(ctor).toBeDefined();
      expect(ctor!.name).toBe('UserService');
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts method invocations', () => {
    const src = `class Test { void Run() { GetName(); GetName(); Validate(); } }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['GetName', 'Validate', 'Missing']));
      expect(result['GetName']).toBe(2);
      expect(result['Validate']).toBe(1);
      expect(result['Missing']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts return type from method declaration', () => {
    const src = `
public class UserService {
  public User GetById(int id) { return null; }
  public async Task<string> FetchAsync(string url) { return ""; }
  public void Delete(int id) {}
}
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'UserService.cs');
      const getById = fns.find(f => f.name === 'GetById');
      expect(getById?.returnType).toBe('User');
      const fetchAsync = fns.find(f => f.name === 'FetchAsync');
      expect(fetchAsync?.returnType).toBe('Task<string>');
      const del = fns.find(f => f.name === 'Delete');
      expect(del?.returnType).toBe('void');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
