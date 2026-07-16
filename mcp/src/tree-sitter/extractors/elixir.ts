import type TreeSitter from 'tree-sitter';
import type { FnDef, Extractor } from '../types';
import { registerExtractor } from '../index';

const DEF_FN = new Set(['def', 'defp', 'defmacro', 'defmacrop', 'defguard', 'defguardp', 'defdelegate']);
const DEF_MODULE = new Set(['defmodule', 'defprotocol', 'defimpl']);
const DEF_STRUCT = new Set(['defstruct', 'defexception']);

/** For a `def`/`defmodule` call node, find the defined name. */
function definedName(callNode: TreeSitter.SyntaxNode): string | null {
  // children: identifier(def), then the head (arguments / call / alias / identifier).
  for (let i = 1; i < callNode.namedChildCount; i++) {
    const arg = callNode.namedChild(i);
    if (!arg) continue;
    if (arg.type === 'arguments') {
      const inner = arg.namedChild(0);
      if (inner) return nameFromHead(inner);
      continue;
    }
    return nameFromHead(arg);
  }
  return null;
}

function nameFromHead(head: TreeSitter.SyntaxNode): string | null {
  if (head.type === 'call') {
    const id = head.namedChild(0);
    return id ? id.text : null;
  }
  if (head.type === 'binary_operator') {
    // e.g. `foo(x) when guard` — take the left side.
    const left = head.namedChild(0);
    return left ? nameFromHead(left) : null;
  }
  if (head.type === 'identifier' || head.type === 'alias' || head.type === 'atom') return head.text;
  return null;
}

export function extractDefinitions(tree: TreeSitter.Tree, _source: string, filename: string): FnDef[] {
  if (!tree || !tree.rootNode) return [];
  const fns: FnDef[] = [];

  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call') {
      const head = node.child(0);
      if (head && head.type === 'identifier') {
        const kw = head.text;
        if (DEF_FN.has(kw) || DEF_MODULE.has(kw) || DEF_STRUCT.has(kw)) {
          const name = DEF_STRUCT.has(kw) ? kw : definedName(node);
          if (name) {
            fns.push({
              name,
              file: filename,
              line: node.startPosition.row + 1,
              type: DEF_MODULE.has(kw) ? 'module' : DEF_STRUCT.has(kw) ? 'struct' : 'function',
              isTopLevel: DEF_MODULE.has(kw),
              isExported: kw === 'def' || kw === 'defmacro' || DEF_MODULE.has(kw),
              astBacked: true,
            });
          }
        }
      }
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
    if (node.type === 'call') {
      const head = node.child(0);
      if (head && (head.type === 'identifier' || head.type === 'dot')) {
        const name = head.type === 'dot' ? head.namedChild(head.namedChildCount - 1)?.text : head.text;
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
  const BRANCH_KW = new Set(['if', 'unless', 'case', 'cond', 'with', 'for', 'rescue', 'catch']);
  function walk(node: TreeSitter.SyntaxNode): void {
    if (!node) return;
    if (node.type === 'call') {
      const head = node.child(0);
      if (head && head.type === 'identifier' && BRANCH_KW.has(head.text)) count++;
    } else if (node.type === 'stab_clause') {
      count++; // each case/cond/fn clause is a decision point
    }
    for (let i = 0; i < node.childCount; i++) { const c = node.child(i); if (c) walk(c); }
  }
  try { walk(tree.rootNode); } catch { /* ignore */ }
  return count;
}

const extractor: Extractor = { extractDefinitions, countCalls, countBranches };
registerExtractor('elixir', extractor);
export default extractor;
