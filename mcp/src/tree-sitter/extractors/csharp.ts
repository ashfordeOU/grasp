import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function hasAccessModifier(node: TreeSitter.SyntaxNode, ...modifiers: string[]): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'modifier' && modifiers.includes(c.text)) return true;
  }
  return false;
}

function getEnclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'class_declaration' || p.type === 'interface_declaration' || p.type === 'struct_declaration') {
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
      if (node.type === 'class_declaration' || node.type === 'interface_declaration' || node.type === 'struct_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: node.type === 'interface_declaration' ? 'interface' : 'class',
            isTopLevel: node.parent?.type === 'compilation_unit' || node.parent?.type === 'namespace_declaration',
            isExported: hasAccessModifier(node, 'public', 'protected'),
            astBacked: true,
          });
          // Walk into class body for methods
          for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
          return;
        }
      }
      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'method',
            isTopLevel: false,
            isClassMethod: true,
            className: getEnclosingClass(node),
            isExported: hasAccessModifier(node, 'public', 'protected'),
            astBacked: true,
          });
          return;
        }
      }
      if (node.type === 'constructor_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'constructor',
            isTopLevel: false,
            isClassMethod: true,
            className: getEnclosingClass(node),
            isExported: hasAccessModifier(node, 'public', 'protected'),
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
      if (node.type === 'invocation_expression') {
        const fn = node.childForFieldName('function');
        if (fn) {
          if (fn.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
          if (fn.type === 'member_access_expression') {
            const name = fn.childForFieldName('name');
            if (name && calls[name.text] !== undefined) calls[name.text]++;
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
    }
    if (tree?.rootNode) walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('csharp', extractor);
export default extractor;
export { extractDefinitions, countCalls };
