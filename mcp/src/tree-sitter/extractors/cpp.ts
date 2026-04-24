import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function getEnclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'class_specifier') {
      const n = p.childForFieldName('name');
      if (n) return n.text;
    }
    p = p.parent;
  }
  return null;
}

function getFunctionInfo(node: TreeSitter.SyntaxNode): { name: string; className: string | null } | null {
  const decl = node.childForFieldName('declarator');
  if (!decl) return null;

  let nameNode: TreeSitter.SyntaxNode | null = null;
  let qualClass: string | null = null;

  if (decl.type === 'function_declarator') {
    const inner = decl.childForFieldName('declarator');
    if (!inner) return null;

    if (inner.type === 'identifier') {
      nameNode = inner;
    } else if (inner.type === 'qualified_identifier') {
      // e.g. Server::start — name field = 'start', scope field = 'Server'
      const namePart = inner.childForFieldName('name');
      const scopePart = inner.childForFieldName('scope');
      if (namePart?.type === 'identifier') {
        nameNode = namePart;
        qualClass = scopePart?.text ?? null;
      }
    } else if (inner.type === 'destructor_name') {
      nameNode = inner;
    } else if (inner.type === 'pointer_declarator') {
      const id = inner.childForFieldName('declarator');
      if (id?.type === 'identifier') nameNode = id;
    }
  } else if (decl.type === 'reference_declarator' || decl.type === 'pointer_declarator') {
    const inner = decl.childForFieldName('declarator');
    if (inner?.type === 'function_declarator') {
      const name = inner.childForFieldName('declarator');
      if (name?.type === 'identifier') nameNode = name;
    }
  }

  if (!nameNode) return null;
  return { name: nameNode.text, className: qualClass };
}

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  const fns: FnDef[] = [];
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (node.type === 'function_definition') {
        const info = getFunctionInfo(node);
        if (info) {
          // If out-of-line definition has qualified class, use it; otherwise check inline enclosing class
          const className = info.className ?? getEnclosingClass(node);
          fns.push({
            name: info.name,
            file: filename,
            line: node.startPosition.row + 1,
            type: className ? 'method' : 'function',
            isTopLevel: className === null,
            isClassMethod: className !== null,
            className,
            isExported: true,
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
        if (fn) {
          if (fn.type === 'identifier' && calls[fn.text] !== undefined) calls[fn.text]++;
          if (fn.type === 'field_expression') {
            const field = fn.childForFieldName('field');
            if (field && calls[field.text] !== undefined) calls[field.text]++;
          }
          if (fn.type === 'qualified_identifier') {
            const name = fn.childForFieldName('name');
            if (name?.type === 'identifier' && calls[name.text] !== undefined) calls[name.text]++;
          }
        }
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

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('cpp', extractor);
export default extractor;
export { extractDefinitions, countCalls };
