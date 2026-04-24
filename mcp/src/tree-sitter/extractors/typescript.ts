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
      p.type === 'class'
    ) {
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
          astBacked: true,
        });
        return;
      }
    }

    if (node.type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
        const declList = node.parent;
        const exported = declList?.parent?.type === 'export_statement';
        fns.push({
          name: nameNode.text,
          file: filename,
          line: node.startPosition.row + 1,
          type: 'function',
          isTopLevel: true,
          isExported: exported,
          astBacked: true,
        });
        for (let i = 0; i < valueNode.childCount; i++) { const c = valueNode.child(i); if (c) walk(c); }
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }

  walk(tree.rootNode);
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

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('typescript', extractor);
export default extractor;
