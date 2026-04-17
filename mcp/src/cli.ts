#!/usr/bin/env node
// =====================================================================
// Grasp CLI — opens the browser pre-loaded with the analysis
//
//   npx grasp ./my-project     → local folder, served on localhost
//   npx grasp owner/repo       → GitHub repo, opens file:// or localhost
//   npx grasp --report .       → terminal-only report (no browser)
// =====================================================================

import { analyzeSource, parseSource } from './analyzer.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { exec } from 'child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const target   = positional[0] || '.';
const report   = flags.has('--report');   // terminal-only mode
const noOpen   = flags.has('--no-open');  // skip launching browser
const port     = parseInt(process.env.GRASP_PORT || '7331', 10);
const token    = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// ── colour helpers (no deps) ──────────────────────────────────────────
const c = {
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function gradeColour(g: string) {
  if (g === 'A' || g === 'B') return c.green(g);
  if (g === 'C' || g === 'D') return c.yellow(g);
  return c.red(g);
}

function scoreBar(score: number, w = 28) {
  const f = Math.round((score / 100) * w);
  const bar = '█'.repeat(f) + '░'.repeat(w - f);
  return score >= 80 ? c.green(bar) : score >= 60 ? c.yellow(bar) : c.red(bar);
}

function usage() {
  console.log(`
  ${c.bold('Grasp')} — codebase architecture analyser

  ${c.dim('Usage:')}
    npx grasp [path]            Analyse local folder and open browser
    npx grasp owner/repo        Analyse GitHub repo and open browser
    npx grasp <github-url>      Same — accepts full GitHub URL

  ${c.dim('Options:')}
    --report                    Print terminal report only (no browser)
    --no-open                   Start server but don't open browser
    --help                      Show this help

  ${c.dim('Environment:')}
    GITHUB_TOKEN / GH_TOKEN     GitHub PAT (needed for private repos)
    GRASP_PORT                  Port for local server (default: 7331)
`);
}

if (flags.has('--help') || flags.has('-h')) { usage(); process.exit(0); }

// ── find index.html relative to this binary ───────────────────────────
function findIndexHtml(): string | null {
  // When cloned: mcp/dist/cli.js → ../../index.html
  const candidates = [
    join(__dirname, '..', '..', 'index.html'),
    join(__dirname, '..', 'index.html'),
    join(__dirname, 'index.html'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return resolve(c);
  }
  return null;
}

// ── open browser cross-platform ───────────────────────────────────────
function openBrowser(url: string) {
  const cmd =
    process.platform === 'darwin'  ? `open "${url}"` :
    process.platform === 'win32'   ? `start "" "${url}"` :
                                     `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error(c.yellow(`  Could not open browser: ${err.message}`));
  });
}

// ── minimal terminal report ───────────────────────────────────────────
function printReport(result: Awaited<ReturnType<typeof analyzeSource>>) {
  const s = result.summary;
  console.log('  ' + scoreBar(s.healthScore) + c.bold(` ${s.healthScore}/100  `) + gradeColour(s.healthGrade));
  console.log('');
  console.log('  ' + [
    c.dim('Files') + ': ' + s.fileCount,
    c.dim('Functions') + ': ' + s.functionCount,
    c.dim('Issues') + ': ' + c.bold(String(s.issueCount)),
    c.dim('Cycles') + ': ' + (s.circularDepCount ? c.red(String(s.circularDepCount)) : c.green('0')),
    c.dim('Security') + ': ' + (s.securityIssueCount ? c.red(String(s.securityIssueCount)) : c.green('0')),
  ].join('  '));
  console.log('');
  if (result.issues.length) {
    result.issues.slice(0, 6).forEach(i => {
      const icon = i.type === 'critical' ? c.red('✗') : c.yellow('⚠');
      console.log(`  ${icon} ${c.bold(i.title)}`);
    });
    if (result.issues.length > 6) console.log(c.dim(`  … ${result.issues.length - 6} more`));
    console.log('');
  }
}

// ── serve index.html with preloaded data ─────────────────────────────
function serveAndOpen(
  indexHtml: string,
  result: Awaited<ReturnType<typeof analyzeSource>>,
  repoInfo: Record<string, string>
) {
  const raw = readFileSync(indexHtml, 'utf8');

  // Inject window.__GRASP_PRELOAD before </head>
  const jsonPayload = JSON.stringify({ data: result, repoInfo });
  const injected = raw.replace(
    '</head>',
    `<script>window.__GRASP_PRELOAD=${jsonPayload};</script>\n</head>`
  );

  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(injected);
  });

  srv.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(c.bold(`  🔭 Grasp is ready → ${url}`));
    console.log(c.dim('  Press Ctrl+C to stop'));
    console.log('');
    if (!noOpen) openBrowser(url);
  });

  // Keep the process alive
  process.on('SIGINT', () => { srv.close(); process.exit(0); });
}

// ── open via file:// URL (GitHub repos, no server needed) ────────────
function openFileUrl(indexHtml: string, repoParam: string) {
  const fileUrl = `file://${indexHtml}?repo=${encodeURIComponent(repoParam)}`;
  console.log(c.bold(`  🔭 Opening Grasp → ${fileUrl}`));
  console.log('');
  if (!noOpen) openBrowser(fileUrl);
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  const source = parseSource(
    target.startsWith('.') || target.startsWith('/') || target.startsWith('~')
      ? resolve(target.replace(/^~/, process.env.HOME || '~'))
      : target,
    token
  );

  if (!source) {
    console.error(c.red(`  Error: cannot parse target "${target}"`));
    usage(); process.exit(1);
  }

  console.log(c.bold('\n  🔭 Grasp\n'));
  if (source.type === 'local') {
    console.log(c.dim(`  Analysing: ${source.path}`));
  } else {
    console.log(c.dim(`  Analysing: ${source.owner}/${source.repo}`));
  }
  console.log('');

  const isTTY = process.stdout.isTTY;
  const spinFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let spinIdx = 0, lastMsg = '';
  const spin = isTTY && !report
    ? setInterval(() => { process.stdout.write(`\r${spinFrames[spinIdx++ % 10]} ${lastMsg}        `); }, 80)
    : null;

  let result: Awaited<ReturnType<typeof analyzeSource>>;
  try {
    result = await analyzeSource(source, (msg) => {
      lastMsg = msg;
      if (!isTTY || report) process.stderr.write(`  ${msg}\n`);
    });
  } catch (err: any) {
    if (spin) clearInterval(spin);
    if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');
    console.error(c.red(`\n  Analysis failed: ${err.message || err}`));
    process.exit(1);
  }

  if (spin) clearInterval(spin);
  if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  printReport(result);

  if (report) {
    // Terminal-only: write JSON and exit
    const out = 'grasp-report.json';
    try { writeFileSync(out, JSON.stringify(result, null, 2)); console.log(c.dim(`  Report → ${out}`)); } catch {}
    process.exit(result.summary.healthScore >= 60 ? 0 : 1);
  }

  const indexHtml = findIndexHtml();
  if (!indexHtml) {
    console.log(c.yellow('  index.html not found next to the binary.'));
    console.log(c.dim('  Run: git clone https://github.com/ashfordeOU/grasp && open grasp/index.html'));
    process.exit(0);
  }

  if (source.type === 'github') {
    // GitHub repos: just pass ?repo= to the static file — no server needed
    openFileUrl(indexHtml, `${source.owner}/${source.repo}`);
    // Give browser 2 s to open then exit
    setTimeout(() => process.exit(0), 2000);
  } else {
    // Local path: serve with pre-injected data
    const repoInfo = { owner: 'local', repo: 'folder', name: source.path ?? 'Local' };
    serveAndOpen(indexHtml, result, repoInfo);
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
