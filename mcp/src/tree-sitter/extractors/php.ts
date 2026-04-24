import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

const CLASS_TYPES = new Set(['class_declaration', 'interface_declaration', 'trait_declaration']);

function enclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p: TreeSitter.SyntaxNode | null = node.parent;
  while (p) {
    if (CLASS_TYPES.has(p.type)) {
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

    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'function',
          isTopLevel: true,
          isExported: false,
          astBacked: true,
        });
        return;
      }
    }

    if (node.type === 'class_declaration' || node.type === 'trait_declaration') {
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

    if (node.type === 'interface_declaration') {
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

    if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const className = enclosingClass(node);
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'method',
          isTopLevel: false,
          isClassMethod: true,
          className: className ?? undefined,
          isExported: false,
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
    if (node.type === 'function_call_expression') {
      const fn = node.childForFieldName('function');
      if (fn && calls[fn.text] !== undefined) calls[fn.text]++;
    }
    if (node.type === 'member_call_expression') {
      const nm = node.childForFieldName('name');
      if (nm && calls[nm.text] !== undefined) calls[nm.text]++;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('php', extractor);
export default extractor;
