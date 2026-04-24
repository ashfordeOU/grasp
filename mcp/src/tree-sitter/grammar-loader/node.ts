import TreeSitter from 'tree-sitter';
import { GRAMMAR_REGISTRY } from '../grammar-registry';

const cache = new Map<string, TreeSitter.Language>();

export async function loadGrammar(langKey: string): Promise<TreeSitter.Language | null> {
  if (cache.has(langKey)) return cache.get(langKey)!;
  const entry = GRAMMAR_REGISTRY[langKey];
  if (!entry) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lang = require(entry.nodeModule) as TreeSitter.Language;
    cache.set(langKey, lang);
    return lang;
  } catch {
    return null;
  }
}

export function clearCache(): void {
  cache.clear();
}
