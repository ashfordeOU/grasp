import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

const CLASS_TYPES = new Set(['class_definition', 'object_definition', 'trait_definition']);

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

    if (node.type === 'class_definition' || node.type === 'object_definition') {
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

    if (node.type === 'trait_definition') {
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

    // function_definition = concrete def; function_declaration = abstract def (in traits)
    if (node.type === 'function_definition' || node.type === 'function_declaration') {
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
      const fn = node.childForFieldName('function');
      if (fn) {
        if (fn.type === 'identifier' && calls[fn.text] !== undefined) {
          calls[fn.text]++;
        } else if (fn.type === 'field_expression') {
          const field = fn.childForFieldName('field');
          if (field && calls[field.text] !== undefined) calls[field.text]++;
        }
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
  const BRANCH = new Set(['if_expression', 'for_expression', 'while_expression', 'case_clause']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (BRANCH.has(node.type)) count++;
    else if (node.type === 'infix_expression') {
      const op = node.childForFieldName('operator')?.text;
      if (op === '&&' || op === '||') count++;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('scala', extractor);
export default extractor;
