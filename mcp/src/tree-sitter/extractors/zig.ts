import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function isPub(node: TreeSitter.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && !c.isNamed && c.text === 'pub') return true;
  }
  return false;
}

export function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;

    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'function',
          isTopLevel: true,
          isExported: isPub(node),
          astBacked: true,
        });
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return fns;
}

export function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      if (fn) {
        if (fn.type === 'identifier' && calls[fn.text] !== undefined) {
          calls[fn.text]++;
        } else if (fn.type === 'field_access') {
          for (let i = fn.childCount - 1; i >= 0; i--) {
            const c = fn.child(i);
            if (c?.isNamed && fn.fieldNameForChild(i) === 'field' && calls[c.text] !== undefined) {
              calls[c.text]++;
              break;
            }
          }
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return calls;
}

export function countBranches(tree: TreeSitter.Tree): number {
  if (!tree || !tree.rootNode) return 0;
  let count = 0;
  const BRANCH = new Set(['if_statement', 'for_statement', 'while_statement', 'switch_expression', 'else_branch']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('zig', extractor);
export default extractor;
