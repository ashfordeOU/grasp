import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function getEnclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'class' || p.type === 'module') {
      const n = p.childForFieldName('name');
      if (n) return n.text;
    }
    p = p.parent;
  }
  return null;
}

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  const fns: FnDef[] = [];
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (node.type === 'class' || node.type === 'module') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: node.type,
            isTopLevel: !getEnclosingClass(node),
            isExported: !nameNode.text.startsWith('_'),
            astBacked: true,
          });
          for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
          return;
        }
      }
      if (node.type === 'method') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'method',
            isTopLevel: getEnclosingClass(node) === null,
            isClassMethod: getEnclosingClass(node) !== null,
            className: getEnclosingClass(node),
            isExported: !nameNode.text.startsWith('_'),
            astBacked: true,
          });
          return;
        }
      }
      if (node.type === 'singleton_method') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'singleton_method',
            isTopLevel: false,
            isClassMethod: true,
            className: getEnclosingClass(node),
            isExported: !nameNode.text.startsWith('_'),
            astBacked: true,
          });
          return;
        }
      }
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
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
      if (node.type === 'call') {
        const method = node.childForFieldName('method');
        if (method && calls[method.text] !== undefined) calls[method.text]++;
      }
      // identifier at the start of an expression statement = bare method call
      if (node.type === 'identifier' && node.parent?.type === 'program') {
        if (calls[node.text] !== undefined) calls[node.text]++;
      }
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
    }
    if (tree?.rootNode) walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('ruby', extractor);
export default extractor;
export { extractDefinitions, countCalls };
