import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function getFunctionName(node: TreeSitter.SyntaxNode): string | null {
  // function_definition → declarator (function_declarator) → declarator (identifier)
  const decl = node.childForFieldName('declarator');
  if (!decl) return null;
  if (decl.type === 'function_declarator') {
    const inner = decl.childForFieldName('declarator');
    if (inner?.type === 'identifier') return inner.text;
    if (inner?.type === 'pointer_declarator') {
      const id = inner.childForFieldName('declarator');
      if (id?.type === 'identifier') return id.text;
    }
  }
  if (decl.type === 'pointer_declarator') {
    const inner = decl.childForFieldName('declarator');
    if (inner?.type === 'function_declarator') {
      const name = inner.childForFieldName('declarator');
      if (name?.type === 'identifier') return name.text;
    }
  }
  return null;
}

function isStatic(node: TreeSitter.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'storage_class_specifier' && c.text === 'static') return true;
  }
  return false;
}

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  const fns: FnDef[] = [];
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (node.type === 'function_definition') {
        const name = getFunctionName(node);
        if (name) {
          fns.push({
            name,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'function',
            isTopLevel: true,
            isExported: !isStatic(node),
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
        if (fn?.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
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
  const BRANCH = new Set(['if_statement', 'for_statement', 'while_statement', 'do_statement', 'case_statement', 'conditional_expression']);
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
registerExtractor('c', extractor);
export default extractor;
export { extractDefinitions, countCalls, getFunctionName };
