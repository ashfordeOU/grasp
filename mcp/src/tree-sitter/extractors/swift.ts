import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

// In tree-sitter-swift, class/struct/enum/extension all parse as `class_declaration`.
// Protocol is `protocol_declaration`. Methods inside any of these are `function_declaration`.
const CONTAINER_TYPES = new Set(['class_declaration', 'protocol_declaration']);

function enclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p: TreeSitter.SyntaxNode | null = node.parent;
  while (p) {
    if (CONTAINER_TYPES.has(p.type)) {
      const nm = p.childForFieldName('name');
      if (nm) return nm.text;
    }
    p = p.parent;
  }
  return null;
}

export function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;

    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'class',
          isTopLevel: true,
          isExported: false,
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }
    }

    if (node.type === 'protocol_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'interface',
          isTopLevel: true,
          isExported: false,
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }
    }

    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const className = enclosingClass(node);
        if (className !== null) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'method',
            isTopLevel: false,
            isClassMethod: true,
            className,
            isExported: false,
            astBacked: true,
          });
        } else {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'function',
            isTopLevel: true,
            isExported: false,
            astBacked: true,
          });
        }
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
      // First child is the function (no field name in Swift grammar)
      const fn = node.child(0);
      if (fn) {
        if (fn.type === 'simple_identifier' && calls[fn.text] !== undefined) {
          calls[fn.text]++;
        } else if (fn.type === 'navigation_expression') {
          // suffix field → navigation_suffix → suffix field → simple_identifier
          const suffix = fn.childForFieldName('suffix');
          const methodName = suffix?.childForFieldName('suffix');
          if (methodName && calls[methodName.text] !== undefined) calls[methodName.text]++;
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('swift', extractor);
export default extractor;
