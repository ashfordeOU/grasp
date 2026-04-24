import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  // rootNode is 'module' at depth=0; direct children are at depth=1 (top-level)
  function walk(node: TreeSitter.SyntaxNode, depth: number, currentClass: string | null): void {
    if (!node) return;
    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) {
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c, depth + 1, currentClass); }
        return;
      }

      // Collect decorators from parent decorated_definition
      const decorators: string[] = [];
      const parent = node.parent;
      if (parent?.type === 'decorated_definition') {
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child && child.type === 'decorator') {
            const inner = child.childCount > 1 ? child.child(1) : null;
            if (inner) decorators.push(inner.text);
          }
        }
      }

      // Detect async
      let isAsync = false;
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c?.type === 'async') { isAsync = true; break; }
      }

      // depth=1 means direct child of module → top-level
      fns.push({
        name: nameNode.text,
        file: filename,
        line: node.startPosition.row + 1,
        isTopLevel: depth === 1 && currentClass === null,
        isExported: !nameNode.text.startsWith('_'),
        isClassMethod: currentClass !== null,
        className: currentClass,
        type: isAsync ? 'async_function' : currentClass ? 'method' : 'function',
        decorators: decorators.length > 0 ? decorators : null,
        astBacked: true,
      });

      // Walk into function body for nested functions
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c, depth + 1, null); }  // null: nested defs are NOT class methods
      return;
    }

    if (node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          isTopLevel: depth === 1,
          isExported: !nameNode.text.startsWith('_'),
          isClassMethod: false,
          type: 'class',
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c, depth + 1, nameNode.text); }
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c, depth + 1, currentClass); }
  }

  walk(tree.rootNode, 0, null);
  return fns;
}

function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call') {
      const fn = node.childForFieldName('function');
      if (fn) {
        // Direct call: foo()
        if (fn.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
        // Method call: obj.foo() — attribute node has 'attribute' field
        if (fn.type === 'attribute') {
          const attr = fn.childForFieldName('attribute');
          if (attr && calls[attr.text] !== undefined) calls[attr.text]++;
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  walk(tree.rootNode);
  return calls;
}

export function countBranches(tree: TreeSitter.Tree): number {
  if (!tree || !tree.rootNode) return 0;
  let count = 0;
  const BRANCH = new Set(['if_statement', 'elif_clause', 'for_statement', 'while_statement', 'except_clause', 'with_statement', 'conditional_expression', 'boolean_operator']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('python', extractor);
export default extractor;
export { extractDefinitions, countCalls };
