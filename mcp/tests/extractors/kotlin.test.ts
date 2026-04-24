import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KotlinGrammar = require('tree-sitter-kotlin');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/kotlin';

const GOLDEN = `
class DataProcessor(val name: String) {
    fun process(data: List<String>): Int {
        return data.size
    }

    private fun validate(input: String): Boolean {
        return input.isNotEmpty()
    }
}

fun topLevelHelper(x: Int): Int = x * 2

internal fun internalHelper(): Unit {}
`;

describe('Kotlin extractor', () => {
  let parser: TreeSitter;
  beforeAll(() => { parser = new TreeSitter(); parser.setLanguage(KotlinGrammar); });

  test('extracts class declaration', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Processor.kt');
      const cls = fns.find(f => f.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('DataProcessor');
      expect(cls!.astBacked).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts public method inside class', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Processor.kt');
      const fn = fns.find(f => f.name === 'process');
      expect(fn).toBeDefined();
      expect(fn!.isExported).toBe(true);
      expect(fn!.isClassMethod).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks private function as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Processor.kt');
      const fn = fns.find(f => f.name === 'validate');
      expect(fn).toBeDefined();
      expect(fn!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('extracts top-level function', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Processor.kt');
      const fn = fns.find(f => f.name === 'topLevelHelper');
      expect(fn).toBeDefined();
      expect(fn!.isTopLevel).toBe(true);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('marks internal function as not exported', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Processor.kt');
      const fn = fns.find(f => f.name === 'internalHelper');
      expect(fn).toBeDefined();
      expect(fn!.isExported).toBe(false);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });

  test('countCalls counts calls', () => {
    const src = `fun test() { topLevelHelper(1); topLevelHelper(2); }`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['topLevelHelper', 'validate']));
      expect(result['topLevelHelper']).toBe(2);
      expect(result['validate']).toBe(0);
    } finally { if ((tree as any).delete) (tree as any).delete(); }
  });
});
