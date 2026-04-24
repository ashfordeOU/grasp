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
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: className ? 'method' : 'function',
            isTopLevel: className === null,
            isClassMethod: className !== null,
            className,
            isExported: isPub(node),
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
    walk(tree.rootNode);
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
    walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('rust', extractor);
export default extractor;
export { extractDefinitions, countCalls };
