import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) fns.push({
        name: nameNode.text,
        file: filename,
        line: node.startPosition.row + 1,
        type: 'function',
        isTopLevel: true,
        isExported: /^[A-Z]/.test(nameNode.text),
        astBacked: true,
      });
      return;
    } else if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      const receiverNode = node.childForFieldName('receiver');
      if (nameNode) {
        // Extract receiver type name (the PascalCase identifier is the type)
        const receiverText = receiverNode?.text?.match(/\b([A-Z][A-Za-z0-9_]*)\b/)?.[1] ?? null;
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'method',
          isTopLevel: false,
          isClassMethod: true,
          className: receiverText,
          isExported: /^[A-Z]/.test(nameNode.text),
          astBacked: true,
        });
        return;
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  walk(tree.rootNode);
  return fns;
}

function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      if (fn) {
        if (fn.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
        if (fn.type === 'selector_expression') {
          const field = fn.childForFieldName('field');
          if (field && calls[field.text] !== undefined) calls[field.text]++;
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  walk(tree.rootNode);
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('go', extractor);
export default extractor;
export { extractDefinitions, countCalls };
