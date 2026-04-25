// Build script using esbuild — bundles the MCP server + CLI into dist/
// This avoids tsc type-checker OOM issues with the large parser.js file.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, chmodSync } from 'fs';

mkdirSync('dist', { recursive: true });

// Shared externals for all builds that may pull in tree-sitter extractors
const treeSitterExternals = [
  'tree-sitter',
  'tree-sitter-python',
  'tree-sitter-go',
  'tree-sitter-java',
  'tree-sitter-kotlin',
  'tree-sitter-rust',
  'tree-sitter-c',
  'tree-sitter-cpp',
  'tree-sitter-c-sharp',
  'tree-sitter-ruby',
  'tree-sitter-javascript',
  'tree-sitter-typescript',
  'tree-sitter-swift',
  'tree-sitter-php',
  'tree-sitter-scala',
  'tree-sitter-zig',
  'node-gyp-build',
];

// MCP server
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  format: 'cjs',
  // Keep parser.js as an external require so it stays a separate file
  // (it's too large to inline and doesn't need bundling)
  external: ['./parser.js', 'better-sqlite3', 'kuzu', '@xenova/transformers', 'sharp', ...treeSitterExternals],
  loader: { '.node': 'file' },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// CLI tool
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/cli.js',
  format: 'cjs',
  external: ['./parser.js', 'ws', 'bufferutil', 'utf-8-validate', '@xenova/transformers', 'sharp', ...treeSitterExternals],
  loader: { '.node': 'file' },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Analyzer module — exported API for VS Code extension and other consumers
await build({
  entryPoints: ['src/analyzer.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/analyzer.js',
  format: 'cjs',
  external: ['./parser.js', 'better-sqlite3', 'kuzu', '@xenova/transformers', 'sharp', ...treeSitterExternals],
  loader: { '.node': 'file' },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Tree-sitter bundle — compiled separately so parser.js (CommonJS) can require it
await build({
  entryPoints: ['src/tree-sitter/bundle.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/tree-sitter/bundle.js',
  format: 'cjs',
  external: [
    'tree-sitter',
    'tree-sitter-python',
    'tree-sitter-go',
    'tree-sitter-java',
    'tree-sitter-kotlin',
    'tree-sitter-rust',
    'tree-sitter-c',
    'tree-sitter-cpp',
    'tree-sitter-c-sharp',
    'tree-sitter-ruby',
    'tree-sitter-javascript',
    'tree-sitter-typescript',
    'node-gyp-build',
  ],
  // Native .node addon files cannot be bundled — treat as external file references
  loader: { '.node': 'file' },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Copy parser.js alongside the bundle
copyFileSync('src/parser.js', 'dist/parser.js');

// Make CLI executable (shebang already present from source file)
try { chmodSync('dist/cli.js', '755'); } catch(e) {}

console.log('Build complete: dist/index.js + dist/cli.js + dist/analyzer.js + dist/parser.js + dist/tree-sitter/bundle.js');
