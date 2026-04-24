import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { php: PHPGrammar } = require('tree-sitter-php');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/php';

const GOLDEN = `<?php

function processOrder(array $order): bool {
    return true;
}

class OrderService {
    public function create(array $data): int { return 0; }
    protected function validate(array $data): bool { return true; }
}

interface PaymentGateway {
    public function charge(int $amount): bool;
}

trait Timestampable {
    public function touch(): void { }
}
`;

describe('PHP extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(PHPGrammar);
  });

  test('extracts top-level function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.php');
      const fn = fns.find(f => f.name === 'processOrder');
      expect(fn).toBeDefined();
      expect(fn!.type).toBe('function');
      expect(fn!.isTopLevel).toBe(true);
      expect(fn!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.php');
      const cls = fns.find(f => f.name === 'OrderService' && f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts interface declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.php');
      const iface = fns.find(f => f.name === 'PaymentGateway');
      expect(iface).toBeDefined();
      expect(iface!.type).toBe('interface');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts trait as class type', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.php');
      const trait = fns.find(f => f.name === 'Timestampable');
      expect(trait).toBeDefined();
      expect(trait!.type).toBe('class');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts method with correct className', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'service.php');
      const method = fns.find(f => f.name === 'create');
      expect(method).toBeDefined();
      expect(method!.type).toBe('method');
      expect(method!.isClassMethod).toBe(true);
      expect(method!.className).toBe('OrderService');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts direct function calls', () => {
    const src = `<?php processOrder([]); processOrder([]);`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['processOrder', 'unused']));
      expect(result['processOrder']).toBe(2);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts method calls', () => {
    const src = `<?php $svc->create([]); $svc->create([]);`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['create']));
      expect(result['create']).toBe(2);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls does not count string content', () => {
    const src = `<?php $msg = "call processOrder now";`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['processOrder']));
      expect(result['processOrder']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('handles empty input gracefully', () => {
    const result = extractDefinitions(null as any, '', 'empty.php');
    expect(result).toEqual([]);
  });
});
