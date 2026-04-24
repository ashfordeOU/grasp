import TreeSitter from 'tree-sitter';
import { loadGrammar } from './grammar-loader/node';
import { EXT_TO_LANG, GRAMMAR_REGISTRY } from './grammar-registry';
import type { Extractor } from './types';
import * as path from 'path';

// Extractor registry — populated lazily as languages are added
const extractorRegistry: Record<string, Extractor> = {};

// Extractor modules self-register by calling registerExtractor() at import time.
// All extractor imports must happen before any tool handler calls getExtractor().
// The server's entry point (index.ts) imports all extractors at startup.
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
const parserInflight = new Map<string, Promise<void>>();

export async function preloadGrammars(filePaths: string[]): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const fp of filePaths) {
    const lang = detectLang(fp);
    if (!lang) continue;
    if (parserCache.has(lang)) continue;
    if (!parserInflight.has(lang)) {
      const p = loadGrammar(lang).then(grammar => {
        if (grammar) {
          try {
            const parser = new TreeSitter();
            parser.setLanguage(grammar);
            parserCache.set(lang, parser);
          } catch (err) {
            console.error(`[grasp] tree-sitter setLanguage failed for "${lang}":`, err);
          }
        }
      }).finally(() => parserInflight.delete(lang));
      parserInflight.set(lang, p);
    }
    promises.push(parserInflight.get(lang)!);
  }
  await Promise.all(promises);
}

export function getParser(langKey: string): TreeSitter | null {
  return parserCache.get(langKey) ?? null;
}

export { loadGrammar };
