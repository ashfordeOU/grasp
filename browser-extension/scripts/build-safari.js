#!/usr/bin/env node
// Assembles dist-safari/ from the webpack output + Safari manifest.
// Run after `npm run build`. The converter is then re-run against dist-safari/
// in CI; locally you can also run it manually for Xcode development.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dist = path.join(ROOT, 'dist');
const safariDist = path.join(ROOT, 'dist-safari');

if (fs.existsSync(safariDist)) fs.rmSync(safariDist, { recursive: true });
fs.mkdirSync(safariDist);

// Only copy the compiled JS files — not the entire dist tree (which may have extra dirs)
for (const f of fs.readdirSync(dist)) {
  if (!f.endsWith('.js') && !f.endsWith('.map')) continue;
  fs.copyFileSync(path.join(dist, f), path.join(safariDist, f));
}

// Copy icons and popup
fs.cpSync(path.join(ROOT, 'icons'), path.join(safariDist, 'icons'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'popup.html'), path.join(safariDist, 'popup.html'));
const license = path.join(ROOT, '..', 'LICENSE');
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(safariDist, 'LICENSE'));

// Safari manifest — already has paths without dist/ prefix
fs.copyFileSync(path.join(ROOT, 'manifest.safari.json'), path.join(safariDist, 'manifest.json'));

console.log('Safari staging dir ready in dist-safari/');
console.log('Run: xcrun safari-web-extension-converter dist-safari/ --project-location safari-extension --app-name Grasp --bundle-identifier org.ashforde.grasp --swift --macos-only --no-open --force');
