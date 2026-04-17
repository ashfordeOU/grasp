// Build script using esbuild — bundles the MCP server into a single dist/index.js
// This avoids tsc type-checker OOM issues with the large parser.js file.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  format: 'cjs',
  // Keep parser.js as an external require so it stays a separate file
  // (it's too large to inline and doesn't need bundling)
  external: ['./parser.js'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Copy parser.js alongside the bundle
copyFileSync('src/parser.js', 'dist/parser.js');

console.log('Build complete: dist/index.js + dist/parser.js');
