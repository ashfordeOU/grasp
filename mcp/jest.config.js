/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // tree-sitter re-evaluating index.js in a new module scope re-defines
  // Tree.prototype.rootNode getter in a way that breaks the closure — the
  // old captured `rootNode` fn now points at itself causing undefined.
  // Prevent this by not resetting modules between test files in a worker.
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
    '^.+\\.js$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        allowJs: true,
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit|before-after-hook|universal-user-agent|is-plain-object)/)',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Pre-load tree-sitter before each test file so Jest's module registry
  // already has it cached — prevents a second evaluation of index.js which
  // would clobber Tree.prototype.rootNode with a broken closure.
  setupFiles: ['<rootDir>/tests/setupTreeSitter.js'],
  // Each extractor test suite uses tree-sitter native bindings with global state.
  // Without enough workers, two suites share a worker and the second parse breaks.
  // 50 workers ensures every test file gets its own isolated process.
  maxWorkers: 50,
  // Safety net: force Jest to exit after all tests complete even if open handles remain.
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
  ],
};
