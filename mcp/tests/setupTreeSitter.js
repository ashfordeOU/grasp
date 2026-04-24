/**
 * Jest setupFiles: pre-load tree-sitter into Jest's module
 * registry to prevent the Tree.prototype.rootNode getter from being clobbered
 * by a second evaluation of tree-sitter/index.js.
 *
 * tree-sitter/index.js destructures Tree.prototype.rootNode at module-eval
 * time. On the first eval the native method is captured. On a second eval
 * (new Jest sandbox, same worker) the JS getter from the first eval is
 * destructured — yielding undefined as the stored native function — breaking
 * all subsequent parses.
 *
 * Solution: require tree-sitter once in this setup file (which also runs
 * through Jest's sandbox). Jest caches it in its module registry. Subsequent
 * requires in test files hit the cache and return the SAME module object
 * without re-evaluating index.js.
 */
'use strict';
require('tree-sitter');
require('tree-sitter-python');
require('tree-sitter-go');
require('tree-sitter-java');
require('tree-sitter-kotlin');
require('tree-sitter-rust');
require('tree-sitter-c');
require('tree-sitter-cpp');
require('tree-sitter-c-sharp');
require('tree-sitter-ruby');
