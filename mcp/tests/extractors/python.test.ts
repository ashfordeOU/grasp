import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PythonGrammar = require('tree-sitter-python');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/python';

const GOLDEN = `
class MyService:
    @staticmethod
    def create(name: str) -> 'MyService':
        return MyService()

    async def process(self, data: dict) -> None:
        pass

def top_level_func(x: int) -> int:
    return x * 2

def _private_func():
    pass
`;

describe('Python extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(PythonGrammar);
  });

  test('extracts class definition', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'test.py');
      const cls = fns.find(f => f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('MyService');
      expect(cls!.isExported).toBe(true);
      expect(cls!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts decorated static method', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'test.py');
      const create = fns.find(f => f.name === 'create');
      expect(create).toBeDefined();
      expect(create!.isClassMethod).toBe(true);
      expect(create!.className).toBe('MyService');
      expect(create!.decorators).toContain('staticmethod');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts async method', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'test.py');
      const proc = fns.find(f => f.name === 'process');
      expect(proc).toBeDefined();
      expect(proc!.type).toBe('async_function');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts top-level function with correct isTopLevel', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'test.py');
      const fn = fns.find(f => f.name === 'top_level_func');
      expect(fn).toBeDefined();
      expect(fn!.isTopLevel).toBe(true);
      expect(fn!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('marks private functions as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'test.py');
      const priv = fns.find(f => f.name === '_private_func');
      expect(priv).toBeDefined();
      expect(priv!.isExported).toBe(false);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts function calls correctly', () => {
    const src = `
result = top_level_func(10)
obj = MyService()
obj.process({'key': 'val'})
top_level_func(20)
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['top_level_func', 'process', 'MyService']));
      expect(result['top_level_func']).toBe(2);
      expect(result['process']).toBe(1);
      expect(result['MyService']).toBe(1);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts return type annotation', () => {
    const src = `
def get_user(user_id: int) -> User:
    return User()

def process(data: dict) -> None:
    pass

def no_annotation(x):
    return x
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'service.py');
      const getUser = fns.find(f => f.name === 'get_user');
      expect(getUser?.returnType).toBe('User');
      const process = fns.find(f => f.name === 'process');
      expect(process?.returnType).toBe('None');
      const noAnnotation = fns.find(f => f.name === 'no_annotation');
      expect(noAnnotation?.returnType).toBeUndefined();
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls does not count string mentions', () => {
    const src = `x = "top_level_func is cool"`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['top_level_func']));
      expect(result['top_level_func']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
