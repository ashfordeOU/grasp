import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { typescript: TSGrammar } = require('tree-sitter-typescript');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/typescript';

const GOLDEN = `
// Plain function
function fetchData(url: string): Promise<string> {
  return fetch(url).then(r => r.text());
}

// Exported async arrow
export const parseJSON = async (raw: string): Promise<unknown> => {
  return JSON.parse(raw);
};

// Interface
export interface Repository {
  findById(id: number): Promise<unknown>;
  save(entity: unknown): Promise<void>;
}

// Type alias
export type UserId = string | number;

// Abstract class
export abstract class BaseService {
  abstract execute(): void;
  protected log(msg: string): void {
    console.log(msg);
  }
}

// Concrete class
class UserService extends BaseService {
  execute(): void {
    fetchData('/api/users');
  }
}
`;

describe('TypeScript extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(TSGrammar);
  });

  test('extracts plain function declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const fn = fns.find(f => f.name === 'fetchData');
      expect(fn).toBeDefined();
      expect(fn!.type).toBe('function');
      expect(fn!.isExported).toBe(false);
      expect(fn!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts exported async arrow function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const fn = fns.find(f => f.name === 'parseJSON');
      expect(fn).toBeDefined();
      expect(fn!.type).toBe('function');
      expect(fn!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts exported interface', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const iface = fns.find(f => f.name === 'Repository');
      expect(iface).toBeDefined();
      expect(iface!.type).toBe('interface');
      expect(iface!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts interface method signatures with correct className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const sig = fns.find(f => f.name === 'findById');
      expect(sig).toBeDefined();
      expect(sig!.type).toBe('method');
      expect(sig!.isClassMethod).toBe(true);
      expect(sig!.className).toBe('Repository');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts type alias', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const t = fns.find(f => f.name === 'UserId');
      expect(t).toBeDefined();
      expect(t!.type).toBe('type');
      expect(t!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts abstract class', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const cls = fns.find(f => f.name === 'BaseService');
      expect(cls).toBeDefined();
      expect(cls!.type).toBe('class');
      expect(cls!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class methods', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.ts');
      const method = fns.find(f => f.name === 'log');
      expect(method).toBeDefined();
      expect(method!.type).toBe('method');
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('BaseService');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts calls correctly', () => {
    const src = `
function main() {
  fetchData('/api');
  fetchData('/users');
  parseJSON('{}');
}
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['fetchData', 'parseJSON', 'unused']));
      expect(result['fetchData']).toBe(2);
      expect(result['parseJSON']).toBe(1);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts method calls by property name', () => {
    const src = `service.fetchData('/api');`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['fetchData']));
      expect(result['fetchData']).toBe(1);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('detects named re-export as exported', () => {
    const src = `
async function fetchData(url: string): Promise<string> {
  return fetch(url).then(r => r.text());
}
export { fetchData };
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'api.ts');
      const fn = fns.find(f => f.name === 'fetchData');
      expect(fn).toBeDefined();
      expect(fn!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('does not extract nested arrow functions as top-level', () => {
    const src = `
function outer(): void {
  const inner = () => 42;
}
`;
    const tree = parser.parse(src);
    try {
      const fns = extractDefinitions(tree, src, 'util.ts');
      expect(fns.find(f => f.name === 'inner')).toBeUndefined();
      expect(fns.find(f => f.name === 'outer')).toBeDefined();
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
