import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

function hasModifier(node: TreeSitter.SyntaxNode, ...modifiers: string[]): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'modifiers') {
      for (let j = 0; j < child.childCount; j++) {
        const m = child.child(j);
        if (m && modifiers.includes(m.type)) return true;
      }
    }
  }
  return false;
}

function getEnclosingClass(node: TreeSitter.SyntaxNode): string | null {
  let p = node.parent;
  while (p) {
    if (p.type === 'class_declaration' || p.type === 'interface_declaration' || p.type === 'enum_declaration') {
      const n = p.childForFieldName('name');
      if (n) return n.text;
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
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'class',
            isTopLevel: node.parent?.type === 'program',
            isClassMethod: false,
            isExported: hasModifier(node, 'public', 'protected'),
            astBacked: true,
          });
        }
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }

      if (node.type === 'interface_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'interface',
            isTopLevel: node.parent?.type === 'program',
            isClassMethod: false,
            isExported: !hasModifier(node, 'private'),
            astBacked: true,
          });
        }
        for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
        return;
      }

      if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = getEnclosingClass(node);
          const typeNode = node.childForFieldName('type');
          const returnType = typeNode?.text?.trim() || undefined;
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'method',
            isTopLevel: false,
            isClassMethod: true,
            className,
            isExported: hasModifier(node, 'public', 'protected'),
            returnType,
            astBacked: true,
          });
        }
        return; // don't walk into method bodies
      }

      if (node.type === 'constructor_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = getEnclosingClass(node);
          fns.push({
            name: nameNode.text,
            file: filename,
            line: node.startPosition.row + 1,
            type: 'constructor',
            isTopLevel: false,
            isClassMethod: true,
            className,
            isExported: hasModifier(node, 'public', 'protected'),
            astBacked: true,
          });
        }
        return;
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
      if (node.type === 'method_invocation') {
        // Direct call: method() → first identifier child is the method name
        // Object call: obj.method() → 'name' field gives method name
        const nameNode = node.childForFieldName('name');
        if (nameNode && calls[nameNode.text] !== undefined) {
          calls[nameNode.text]++;
        } else {
          // fallback: first identifier child
          for (let i = 0; i < node.childCount; i++) {
            const c = node.child(i);
            if (c?.type === 'identifier' && calls[c.text] !== undefined) {
              calls[c.text]++;
              break;
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
    }
    walk(tree.rootNode);
  } catch { /* ignore */ }
  return calls;
}

export function countBranches(tree: TreeSitter.Tree): number {
  if (!tree || !tree.rootNode) return 0;
  let count = 0;
  const BRANCH = new Set(['if_statement', 'for_statement', 'while_statement', 'do_statement', 'switch_block_statement_group', 'catch_clause', 'ternary_expression']);
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
registerExtractor('java', extractor);
export default extractor;
export { extractDefinitions, countCalls };
