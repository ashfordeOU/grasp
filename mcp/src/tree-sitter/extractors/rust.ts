import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function getEnclosingImpl(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'impl_item') {
      for (let i = 0; i < p.childCount; i++) {
        const c = p.child(i);
        if (c?.type === 'type_identifier') return c.text;
      }
    }
    p = p.parent;
  }
  return null;
}

function isPub(node: TreeSitter.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'visibility_modifier') return true;
  }
  return false;
}

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  const fns: FnDef[] = [];
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (node.type === 'function_item') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = getEnclosingImpl(node);
          const retNode = node.childForFieldName('return_type');
          // Rust return_type node text is "-> Option<User>" — strip the leading arrow
          const returnType = retNode?.text?.replace(/^->\s*/, '').trim() || undefined;
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: className ? 'method' : 'function',
            isTopLevel: className === null,
            isClassMethod: className !== null,
            className,
            isExported: isPub(node),
            returnType,
            astBacked: true,
          });
          return;
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    }
    if (tree?.rootNode) walk(tree.rootNode);
  } catch { /* ignore */ }
  return fns;
}

function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => { calls[n] = 0; });
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn) {
          if (fn.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
          if (fn.type === 'field_expression') {
            const field = fn.childForFieldName('field');
            if (field && calls[field.text] !== undefined) calls[field.text]++;
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    }
    if (tree?.rootNode) walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

export function countBranches(tree: TreeSitter.Tree): number {
  if (!tree || !tree.rootNode) return 0;
  let count = 0;
  const BRANCH = new Set(['if_expression', 'for_expression', 'while_expression', 'loop_expression', 'match_arm']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    else if (node.type === 'binary_expression') {
      const op = node.child(1)?.text;
      if (op === '&&' || op === '||') count++;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('rust', extractor);
export default extractor;
export { extractDefinitions, countCalls };
