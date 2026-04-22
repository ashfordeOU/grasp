#!/usr/bin/env node
// Assembles dist-firefox/ from the webpack output + Firefox manifest.
// Run after `npm run build`. Load dist-firefox/ in Firefox via:
//   about:debugging → This Firefox → Load Temporary Add-on → select dist-firefox/manifest.json

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dist = path.join(ROOT, 'dist');
const ffDist = path.join(ROOT, 'dist-firefox');

if (fs.existsSync(ffDist)) fs.rmSync(ffDist, { recursive: true });
fs.mkdirSync(ffDist);

// Copy all compiled output from dist/
for (const entry of fs.readdirSync(dist)) {
  const src = path.join(dist, entry);
  const dst = path.join(ffDist, entry);
  fs.statSync(src).isDirectory()
    ? fs.cpSync(src, dst, { recursive: true })
    : fs.copyFileSync(src, dst);
}

// Swap manifest — strip dist/ prefix from JS paths since files sit at root of the zip
const raw = fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8');
const patched = raw
  .replace(/dist\/content\.js/g, 'content.js')
  .replace(/dist\/background\.js/g, 'background.js');
fs.writeFileSync(path.join(ffDist, 'manifest.json'), patched);

// Copy static assets not produced by webpack
fs.copyFileSync(path.join(ROOT, 'popup.html'), path.join(ffDist, 'popup.html'));
if (!fs.existsSync(path.join(ffDist, 'icons'))) {
  fs.cpSync(path.join(ROOT, 'icons'), path.join(ffDist, 'icons'), { recursive: true });
}
const license = path.join(ROOT, '..', 'LICENSE');
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(ffDist, 'LICENSE'));

console.log('Firefox build ready in dist-firefox/');
console.log('Load in Firefox: about:debugging → This Firefox → Load Temporary Add-on → select dist-firefox/manifest.json');
