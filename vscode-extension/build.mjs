import { build, context } from 'esbuild';
import { mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });

const opts = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.js',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await build(opts);
  console.log('Build complete: dist/extension.js');
}
