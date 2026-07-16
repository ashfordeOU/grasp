import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function funcName(node: TreeSitter.SyntaxNode): string | null {
  const named = node.childForFieldName('name');
  if (named) return named.text;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'word') return c.text;
  }
  return null;
}

export function extractDefinitions(tree: TreeSitter.Tree, _source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'function_definition') {
      const name = funcName(node);
      if (name) {
        fns.push({
          name,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'function',
          isTopLevel: true,
          isExported: true, // bash functions are globally visible once sourced
          astBacked: true,
        });
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return fns;
}

export function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach((n) => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'command') {
      const nameNode = node.childForFieldName('name') ?? node.child(0);
      const name = nameNode?.type === 'command_name' ? nameNode.child(0)?.text : nameNode?.text;
      if (name && calls[name] !== undefined) calls[name]++;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return calls;
}

export function countBranches(tree: TreeSitter.Tree): number {
  if (!tree || !tree.rootNode) return 0;
  let count = 0;
  const BRANCH = new Set(['if_statement', 'elif_clause', 'for_statement', 'while_statement', 'case_statement', 'case_item']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('bash', extractor);
export default extractor;
