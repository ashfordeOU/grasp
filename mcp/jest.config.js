/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Don't clear module cache between individual tests within a file.
  resetModules: false,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        resolveJsonModule: true,
        allowSyntheticDefaultImports: true,
      },
    }],
    // Patch tree-sitter/index.js to fix Tree.prototype.rootNode on re-evaluation.
    // When Jest creates a new module sandbox for each test file within the same
    // worker process, tree-sitter/index.js is re-evaluated. It destructures
    // `rootNode` from `Tree.prototype`, but by this point Tree.prototype.rootNode
    // has been replaced by the first eval's JS accessor — so the destructuring
    // calls the accessor on the prototype itself (not a Tree instance), getting
    // undefined, and all subsequent parses return no rootNode.
    // The patch saves the native function on the first eval and restores it on
    // subsequent evals, using `binding` (native addon cached at C level) as the
    // cross-context storage.
    'node_modules/tree-sitter/index\\.js$': '<rootDir>/tests/tree-sitter-jest-patch.js',
    '^.+\\.js$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        allowJs: true,
      },
    }],
  },
  transformIgnorePatterns: [
    // Allow tree-sitter through so the patch transform can be applied.
    // Allow octokit-family packages through (they use ESM).
    'node_modules/(?!(tree-sitter|@octokit|before-after-hook|universal-user-agent|is-plain-object)/)',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/tests/setupTreeSitter.js'],
  maxWorkers: 4,
  // Safety net: force Jest to exit after all tests complete even if open handles remain.
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
  ],
};
