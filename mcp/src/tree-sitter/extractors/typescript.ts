import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function isExported(node: TreeSitter.SyntaxNode): boolean {
  return node.parent?.type === 'export_statement';
}

function enclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p: TreeSitter.SyntaxNode | null = node.parent;
  while (p) {
    if (
      p.type === 'class_declaration' ||
      p.type === 'abstract_class_declaration' ||
      p.type === 'class' ||
      p.type === 'interface_declaration'
    ) {
      const nm = p.childForFieldName('name');
      if (nm) return nm.text;
    }
    p = p.parent;
  }
  return null;
}

function extractReturnType(node: TreeSitter.SyntaxNode): string | undefined {
  const rt = node.childForFieldName('return_type');
  if (!rt) return undefined;
  // return_type node text is ": Promise<User>" — strip leading colon and whitespace
  const text = rt.text.replace(/^:\s*/, '').trim();
  return text || undefined;
}

// Collect local names from `export { foo, bar as baz }` clauses so that
// functions defined normally but re-exported can still be marked isExported.
function collectNamedExports(rootNode: TreeSitter.SyntaxNode): Set<string> {
  const exported = new Set<string>();
  function walk(node: TreeSitter.SyntaxNode): void {
    if (node.type === 'export_clause') {
      for (let i = 0; i < node.childCount; i++) {
        const spec = node.child(i);
        if (spec?.type === 'export_specifier') {
          const nm = spec.childForFieldName('name');
          if (nm) exported.add(nm.text);
        }
      }
      return;
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  walk(rootNode);
  return exported;
}

export function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const namedExports = collectNamedExports(tree.rootNode);
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;

    if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'function',
          isTopLevel: true,
          isExported: isExported(node),
          returnType: extractReturnType(node),
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }
    }

    if (node.type === 'class_declaration' || node.type === 'abstract_class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'class',
          isTopLevel: true,
          isExported: isExported(node),
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }
    }

    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const cls = enclosingClass(node);
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'method',
          isTopLevel: false,
          isClassMethod: true,
          className: cls,
          isExported: false,
          returnType: extractReturnType(node),
          astBacked: true,
        });
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
          isExported: isExported(node),
          astBacked: true,
        });
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }
    }

    if (node.type === 'type_alias_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'type',
          isTopLevel: true,
          isExported: isExported(node),
          astBacked: true,
        });
        return;
      }
    }

    if (node.type === 'method_signature') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const cls = enclosingClass(node);
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'method',
          isTopLevel: false,
          isClassMethod: true,
          className: cls,
          isExported: false,
          returnType: extractReturnType(node),
          astBacked: true,
        });
        return;
      }
    }

    if (node.type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
        const declList = node.parent; // variable_declaration
        const declParent = declList?.parent;
        const isTopLevelDecl = declParent?.type === 'program' || declParent?.type === 'export_statement';
        if (isTopLevelDecl) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'function',
            isTopLevel: true,
            isExported: declParent?.type === 'export_statement',
            returnType: extractReturnType(valueNode),
            astBacked: true,
          });
        }
        for (let i = 0; i < valueNode.childCount; i++) { const c = valueNode.child(i); if (c) walk(c); }
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  walk(tree.rootNode);
  fns.forEach(fn => { if (namedExports.has(fn.name)) fn.isExported = true; });
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
        } else if (fn.type === 'member_expression') {
          const prop = fn.childForFieldName('property');
          if (prop && calls[prop.text] !== undefined) calls[prop.text]++;
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
  const BRANCH = new Set(['if_statement', 'for_statement', 'for_in_statement', 'while_statement', 'do_statement', 'switch_case', 'catch_clause', 'ternary_expression']);
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
registerExtractor('typescript', extractor);
export default extractor;
