import TreeSitter from 'tree-sitter';
import { loadGrammar } from './grammar-loader/node';
import { EXT_TO_LANG, GRAMMAR_REGISTRY } from './grammar-registry';
import type { Extractor } from './types';
import * as path from 'path';

// Extractor registry — populated lazily as languages are added
const extractorRegistry: Record<string, Extractor> = {};

// Called by each extractor module to register itself
export function registerExtractor(langKey: string, extractor: Extractor): void {
  extractorRegistry[langKey] = extractor;
}

export function getExtractor(langKey: string): Extractor | null {
  return extractorRegistry[langKey] ?? null;
}

export function isAstBacked(langKey: string): boolean {
  return langKey in extractorRegistry && langKey in GRAMMAR_REGISTRY;
}

export function detectLang(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

// Pre-loaded parser instances (langKey → TreeSitter parser)
const parserCache = new Map<string, TreeSitter>();

export async function preloadGrammars(filePaths: string[]): Promise<void> {
  const langs = new Set<string>();
  for (const fp of filePaths) {
    const lang = detectLang(fp);
    if (lang && !parserCache.has(lang)) langs.add(lang);
  }
  await Promise.all([...langs].map(async (lang) => {
    const grammar = await loadGrammar(lang);
    if (grammar) {
      const parser = new TreeSitter();
      parser.setLanguage(grammar);
      parserCache.set(lang, parser);
    }
  }));
}

export function getParser(langKey: string): TreeSitter | null {
  return parserCache.get(langKey) ?? null;
}

export { loadGrammar };
