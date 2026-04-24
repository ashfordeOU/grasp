import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function getSimpleIdentifier(node: TreeSitter.SyntaxNode): TreeSitter.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'simple_identifier') return c;
  }
  return null;
}

function getTypeIdentifier(node: TreeSitter.SyntaxNode): TreeSitter.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'type_identifier') return c;
  }
  return null;
}

function isKotlinPrivate(node: TreeSitter.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.type === 'modifiers') {
      for (let j = 0; j < c.childCount; j++) {
        const m = c.child(j);
        if (m?.type === 'visibility_modifier' && (m.text === 'private' || m.text === 'internal')) return true;
      }
    }
    if (c?.type === 'visibility_modifier' && (c.text === 'private' || c.text === 'internal')) return true;
  }
  return false;
}

function getEnclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'class_declaration' || p.type === 'object_declaration') {
      const nameNode = getTypeIdentifier(p) ?? getSimpleIdentifier(p);
      if (nameNode) return nameNode.text;
    }
    p = p.parent;
  }
  return null;
}

function extractDefinitions(tree: TreeSitter.Tree, source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (!node) return;

      if (node.type === 'class_declaration') {
        const nameNode = getTypeIdentifier(node);
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'class',
            isTopLevel: node.parent?.type === 'source_file',
            isClassMethod: false,
            isExported: !isKotlinPrivate(node),
            astBacked: true,
          });
        }
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }

      if (node.type === 'object_declaration') {
        const nameNode = getSimpleIdentifier(node);
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'object',
            isTopLevel: node.parent?.type === 'source_file',
            isClassMethod: false,
            isExported: !isKotlinPrivate(node),
            astBacked: true,
          });
        }
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }

      if (node.type === 'function_declaration') {
        const nameNode = getSimpleIdentifier(node);
        if (nameNode) {
          const className = getEnclosingClass(node);
          const isTopLevel = node.parent?.type === 'source_file' ||
            node.parent?.type === 'statements' && node.parent?.parent?.type === 'source_file';
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: className ? 'method' : 'function',
            isTopLevel: isTopLevel && !className,
            isClassMethod: className !== null,
            className,
            isExported: !isKotlinPrivate(node),
            astBacked: true,
          });
        }
        return; // don't walk into function bodies
      }

      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
    }

    walk(tree.rootNode);
  } catch { /* ignore — return whatever was collected */ }
  return fns;
}

function countCalls(tree: TreeSitter.Tree, fnNames: Set<string>): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => { calls[n] = 0; });
  if (!tree || !tree.rootNode) return calls;
  try {
    function walk(node: TreeSitter.SyntaxNode): void {
      if (!node) return;
      if (node.type === 'call_expression') {
        const first = node.child(0);
        if (first) {
          if (first.type === 'simple_identifier' && calls[first.text] !== undefined) {
            calls[first.text]++;
          } else if (first.type === 'navigation_expression') {
            // Last simple_identifier in navigation_expression is the method name
            // e.g. obj.validate → navigation_suffix contains the method name
            let lastName: string | null = null;
            for (let i = 0; i < first.childCount; i++) {
              const c = first.child(i);
              if (c?.type === 'navigation_suffix') {
                for (let j = 0; j < c.childCount; j++) {
                  const m = c.child(j);
                  if (m?.type === 'simple_identifier') lastName = m.text;
                }
              }
            }
            if (lastName && calls[lastName] !== undefined) calls[lastName]++;
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
    }
    walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

const extractor: Extractor = { extractDefinitions, countCalls };
registerExtractor('kotlin', extractor);
export default extractor;
export { extractDefinitions, countCalls };
