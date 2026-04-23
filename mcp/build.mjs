// Build script using esbuild — bundles the MCP server + CLI into dist/
// This avoids tsc type-checker OOM issues with the large parser.js file.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, chmodSync } from 'fs';

mkdirSync('dist', { recursive: true });

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
  external: ['./parser.js', 'better-sqlite3'],
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
  external: ['./parser.js', 'ws', 'bufferutil', 'utf-8-validate'],
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
  external: ['./parser.js'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Copy parser.js alongside the bundle
copyFileSync('src/parser.js', 'dist/parser.js');

// Make CLI executable (shebang already present from source file)
try { chmodSync('dist/cli.js', '755'); } catch(e) {}

console.log('Build complete: dist/index.js + dist/cli.js + dist/analyzer.js + dist/parser.js');
