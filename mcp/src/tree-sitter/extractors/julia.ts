import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

/** First *direct* named identifier child (does not descend into bodies). */
function firstIdentifier(node: TreeSitter.SyntaxNode): string | null {
  if (node.type === 'identifier') return node.text;
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c?.type === 'identifier') return c.text;
  }
  return null;
}

/**
 * Name of a `function foo(...)` / short def. Julia nests the name as
 * function_definition → signature → call_expression → identifier.
 */
function signatureName(node: TreeSitter.SyntaxNode): string | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'signature') {
      const inner = c.namedChild(0);
      if (inner?.type === 'call_expression') return firstIdentifier(inner);
      return firstIdentifier(c);
    }
    if (c.type === 'call_expression') return firstIdentifier(c);
    if (c.type === 'identifier') return c.text; // zero-arg `function foo end`
  }
  return null;
}

/** Name of a `struct`/`module`: nested as type_head → identifier, or a direct identifier. */
function typeHeadName(node: TreeSitter.SyntaxNode): string | null {
  const named = node.childForFieldName('name');
  if (named) return named.text;
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'type_head') return firstIdentifier(c);
    if (c.type === 'identifier') return c.text;
  }
  return null;
}

export function extractDefinitions(tree: TreeSitter.Tree, _source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];
  const push = (name: string | null, node: TreeSitter.SyntaxNode, type: string) => {
    if (name) fns.push({ name, file: filename, line: node.startPosition.row + 1, type, isTopLevel: true, isExported: true, astBacked: true });
  };

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    switch (node.type) {
      case 'function_definition':
      case 'macro_definition':
        push(signatureName(node), node, node.type === 'macro_definition' ? 'macro' : 'function');
        break;
      case 'short_function_definition':
        push(signatureName(node), node, 'function');
        break;
      case 'assignment': {
        // `foo(x) = expr` — short function form only (LHS is a call_expression).
        const lhs = node.namedChild(0);
        if (lhs && lhs.type === 'call_expression') push(firstIdentifier(lhs), node, 'function');
        break;
      }
      case 'struct_definition':
        push(typeHeadName(node), node, 'struct');
        break;
      case 'module_definition':
        push(typeHeadName(node), node, 'module');
        break;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  try { walk(tree.rootNode); } catch { /* ignore */ }
  return fns;
}

export function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach((n) => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call_expression') {
      const head = node.child(0);
      if (head) {
        const name = head.type === 'identifier' ? head.text : head.type === 'field_expression' ? firstIdentifier(head) : null;
        if (name && calls[name] !== undefined) calls[name]++;
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
  const BRANCH = new Set(['if_statement', 'elseif_clause', 'for_statement', 'while_statement', 'try_statement', 'catch_clause', 'ternary_expression']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('julia', extractor);
export default extractor;
