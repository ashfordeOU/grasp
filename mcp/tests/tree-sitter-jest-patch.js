'use strict';
/**
 * Jest transform for tree-sitter/index.js.
 *
 * Problem: tree-sitter/index.js does `const {rootNode} = Tree.prototype` at
 * module-eval time, then replaces Tree.prototype.rootNode with a JS wrapper.
 * Tree is a native C++ class whose prototype is shared across all module
 * sandboxes in the same worker process. On the second eval (new Jest sandbox,
 * same process), the destructuring calls the JS wrapper as a getter on the
 * prototype object itself — which is not a Tree instance — so rootNode becomes
 * undefined, breaking every subsequent parse.
 *
 * Fix: inject code between the binding extraction and the destructuring to
 * save the native getter on the first eval, and restore it before subsequent
 * evals destructure it.
 */

const INJECTION = `
;(function __treeSitterRootNodeFix() {
  // tree-sitter/index.js does: const {rootNode} = Tree.prototype; then replaces
  // Tree.prototype.rootNode with a JS accessor. On re-evaluation in a new Jest
  // module sandbox (same worker process, different vm.Context), Tree.prototype.rootNode
  // is already the JS accessor, so the destructuring calls it as a getter on the
  // prototype object itself — not a Tree instance — returning undefined and breaking
  // all subsequent parses.
  //
  // Fix: save the native function before the first eval wraps it. Restore it before
  // subsequent evals so the destructuring gets the native function.
  //
  // Store on "binding" (the native addon object) which is cached at the C level and
  // is the SAME object across all vm.Context sandboxes in the same worker process.
  // Cannot use global (Jest sandboxes it) or process (Jest may sandbox it too).
  const __KEY = '__tsNativeRootNodeFn';
  const __desc = Object.getOwnPropertyDescriptor(Tree.prototype, 'rootNode');
  if (__desc && typeof __desc.value === 'function' && !binding[__KEY]) {
    // First eval: rootNode is the native value function — save it on the binding
    binding[__KEY] = __desc.value;
  } else if (binding[__KEY] && __desc && typeof __desc.get === 'function') {
    // Subsequent eval: rootNode is a JS accessor — restore native fn before destructuring
    Object.defineProperty(Tree.prototype, 'rootNode', {
      value: binding[__KEY],
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
})();
`;

// The exact line we inject after (in tree-sitter/index.js v0.22.x)
const ANCHOR = "const {Query, Parser, NodeMethods, Tree, TreeCursor, LookaheadIterator} = binding;";

module.exports = {
  process(sourceCode, filePath) {
    const idx = sourceCode.indexOf(ANCHOR);
    if (idx === -1) {
      // Anchor not found: tree-sitter version changed — skip patch, log warning
      process.stderr.write('[tree-sitter-jest-patch] anchor not found, skipping patch\n');
      return { code: sourceCode };
    }
    const insertAt = idx + ANCHOR.length;
    const patched = sourceCode.slice(0, insertAt) + INJECTION + sourceCode.slice(insertAt);
    return { code: patched };
  },
};
