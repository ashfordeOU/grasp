// Syntax-check every inline <script> in the browser app pages, the way the browser will
// run them: text/babel blocks through Babel standalone (same version the pages load),
// classic blocks through V8. One syntax error blanks the whole app, so CI fails on it.
// Usage: node scripts/check-inline-scripts.mjs [files...]   (needs @babel/standalone)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Babel = require('@babel/standalone');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['index.html', 'team-dashboard.html'];
let failed = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1], body = m[2];
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    const line = html.slice(0, m.index).split('\n').length;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)/i) || [])[1] || 'text/javascript';
    try {
      if (type === 'text/babel') Babel.transform(body, { presets: ['env', 'react'], sourceType: 'script', code: false });
      else if (/^(text|application)\/javascript$/.test(type)) new vm.Script(body, { filename: `${file}:${line}` });
      else continue;
      n++;
    } catch (e) {
      failed++;
      console.error(`${file}: inline ${type} script starting at line ${line}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`${file}: ${n} inline scripts parsed`);
}
process.exit(failed ? 1 : 0);
