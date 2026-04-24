import TreeSitter from 'tree-sitter';
import { GRAMMAR_REGISTRY } from '../grammar-registry';

const cache = new Map<string, TreeSitter.Language>();

export async function loadGrammar(langKey: string): Promise<TreeSitter.Language | null> {
  if (cache.has(langKey)) return cache.get(langKey)!;
  const entry = GRAMMAR_REGISTRY[langKey];
  if (!entry) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(entry.nodeModule);
    // tree-sitter-typescript exports { typescript, tsx } rather than a single Language.
    // Pick the correct sub-export based on the requested langKey.
    // tree-sitter-typescript exports { typescript, tsx }
    // tree-sitter-php exports { php, php_only }
    const lang: TreeSitter.Language =
      langKey === 'tsx'        ? (mod.tsx ?? mod)             :
      langKey === 'typescript' ? (mod.typescript ?? mod)      :
      langKey === 'php'        ? (mod.php ?? mod.php_only ?? mod) :
      mod;
    if (!lang) {
      console.error(`[grasp] tree-sitter grammar "${entry.nodeModule}" resolved to undefined for key "${langKey}"`);
      return null;
    }
    cache.set(langKey, lang);
    return lang;
  } catch (err) {
    console.error(`[grasp] tree-sitter grammar "${entry.nodeModule}" failed to load:`, err);
    return null;
  }
}
