#!/usr/bin/env node
// =====================================================================
// Grasp CLI — opens the browser pre-loaded with the analysis
//
//   npx grasp ./my-project     → local folder, served on localhost
//   npx grasp owner/repo       → GitHub repo, opens file:// or localhost
//   npx grasp --report .       → terminal-only report (no browser)
// =====================================================================

import { analyzeSource, parseSource } from './analyzer.js';
import { BrainStore } from './brain.js';
import { WatchDaemon } from './watch-daemon.js';
import { computeArchDiff } from './arch-diff.js';
import { getGitTimeline, FileChangeTracker } from './sources/local.js';
import { toSarif } from './sarif.js';
import { detectEditors, generateHookScript, generateClaudeMd, generateAgentsMd } from './setup-manager.js';
import type { ArchRule, RuleViolation } from './arch-rules.js';
import { applyArchRules } from './arch-rules.js';
import { attachSyncServer, getRoomList, getWorkspace, setWorkspace } from './sync.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, readFileSync, writeFileSync, watch as fsWatch } from 'fs';
import { resolve, join, dirname } from 'path';
import { exec } from 'child_process';

const SUBCOMMANDS = new Set(['index', 'context', 'setup', 'diff', 'daemon', 'drift', 'org']);

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const isSubcommand = SUBCOMMANDS.has(positional[0]);
const target   = isSubcommand ? positional[1] || '.' : (positional[0] || '.');
const report   = flags.has('--report');   // terminal-only mode
const noOpen   = flags.has('--no-open');  // skip launching browser
const rulesCI    = flags.has('--rules');      // CI gate mode — check .grasprules and exit 1 on violations
const watchMode  = flags.has('--watch');      // live watch — re-analyse on file change, push via SSE
const timelineMode = flags.has('--timeline'); // inject git history timeline into browser
const prComment  = flags.has('--pr-comment'); // output a GitHub PR comment to stdout (for CI)
const sarifMode  = flags.has('--format=sarif') || process.argv.includes('--format=sarif'); // output SARIF file
const port     = parseInt(process.env.GRASP_PORT || '7331', 10);
const hostFlag = args.find(a => a.startsWith('--host='))?.split('=').slice(1).join('=');
const host     = hostFlag || process.env.GRASP_HOST || '127.0.0.1';
// --room-secrets=room1:pass1,room2:pass2  — protect specific rooms with passwords
const roomSecretsFlag = args.find(a => a.startsWith('--room-secrets='))?.split('=').slice(1).join('=') || '';
const roomSecrets: Record<string, string> = {};
if (roomSecretsFlag) {
  for (const pair of roomSecretsFlag.split(',')) {
    const [r, ...p] = pair.split(':');
    if (r && p.length) roomSecrets[r] = p.join(':');
  }
}
const token    = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const gitlabToken = process.env.GITLAB_TOKEN;
const gitlabHost  = args.find(a => a.startsWith('--gitlab-host='))?.split('=')[1]
                 ?? process.env.GITLAB_HOST;

// ── colour helpers (no deps) ──────────────────────────────────────────
const c = {
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
};

export function renderProgressBar(done: number, total: number, file: string, width = 30): string {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const filename = file.split('/').slice(-2).join('/');
  return `Analyzing... [${bar}] ${done}/${total} ${filename}`;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return function (...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  } as T;
}

export function formatIndexResult(source: string, result: { summary: { fileCount: number; healthGrade: string; healthScore: number } }): string {
  return `Indexed ${source}: ${result.summary.fileCount} files, health ${result.summary.healthGrade} (${result.summary.healthScore})`;
}

export function formatSetupSummary(editors: string[]): string {
  if (editors.length === 0) return 'No supported editors detected (.claude/, .cursor/, .windsurf/ not found)';
  const lines = ['Grasp setup complete:', ...editors.map(e => `  • ${e}: pre-tool-use.sh hook installed`)];
  return lines.join('\n');
}

export function formatContextOutput(ctx: {
  path: string; layer: string; complexity: number; couplingIn: number; couplingOut: number;
  churn: number; healthGrade: string; dependents: string[]; dependencies: string[];
  security: Array<{ severity: string; desc: string }>;
}) {
  return {
    file: ctx.path,
    layer: ctx.layer,
    health_grade: ctx.healthGrade,
    complexity: ctx.complexity,
    coupling_in: ctx.couplingIn,
    coupling_out: ctx.couplingOut,
    churn: ctx.churn,
    dependents: ctx.dependents,
    dependencies: ctx.dependencies,
    security_issues: ctx.security,
  };
}

let _brainStore: BrainStore | undefined;
function getBrainStore(): BrainStore {
  if (!_brainStore) _brainStore = new BrainStore();
  return _brainStore;
}

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
    --rules                     CI gate: check .grasprules file, exit 1 on violations
    --check                     Enforce grasp.yml architecture rules, exit 1 on violations
    --watch                     Live mode: re-analyse on file change, push to browser via SSE
    --timeline                  Inject git commit history into browser timeline scrubber
    --pr-comment                Output a GitHub PR comment to stdout (for CI/CD pipelines)
    --format=sarif              Output SARIF file (grasp-results.sarif) for GitHub Code Scanning
    --gitlab-host=<host>        Self-hosted GitLab hostname (overrides GITLAB_HOST env var)
    --host=<ip>                 Bind server to this IP (default: 127.0.0.1; use 0.0.0.0 for LAN/remote access)
    --room-secrets=r1:p1,r2:p2 Password-protect sync rooms (room:password pairs, comma-separated)
    --help                      Show this help

  ${c.dim('Environment:')}
    GITHUB_TOKEN / GH_TOKEN     GitHub PAT (needed for private repos)
    GITLAB_TOKEN                GitLab PRIVATE-TOKEN or Bearer token
    GITLAB_HOST                 Self-hosted GitLab host (e.g. gitlab.internal.company.com)
    GRASP_PORT                  Port for local server (default: 7331)
    GRASP_HOST                  Bind host for local server (default: 127.0.0.1)
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

function findDashboardHtml(): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'team-dashboard.html'),
    join(__dirname, '..', 'team-dashboard.html'),
    join(__dirname, 'team-dashboard.html'),
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

// ── architecture rules CI gate ────────────────────────────────────────
function loadRulesFile(dir: string): ArchRule[] | null {
  const p = join(dir, '.grasprules');
  if (!existsSync(p)) return null;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(obj) ? obj : (obj.rules || []);
  } catch { return null; }
}

function printRulesReport(violations: RuleViolation[], rules: ArchRule[]) {
  console.log(c.bold('\n  🏛️  Architecture Rules Check\n'));
  console.log(`  Rules loaded: ${c.bold(String(rules.length))}`);
  if (violations.length === 0) {
    console.log(`  ${c.green('✓')} No violations found\n`);
    return;
  }
  console.log(`  ${c.red('✗')} ${c.bold(String(violations.length))} violation${violations.length !== 1 ? 's' : ''} found\n`);
  const byRule: Record<string, RuleViolation[]> = {};
  violations.forEach(v => { (byRule[v.rule] = byRule[v.rule] || []).push(v); });
  for (const [rule, vs] of Object.entries(byRule)) {
    console.log(`  ${c.red('✗')} ${c.bold(rule)} (${vs.length})`);
    vs.slice(0, 5).forEach(v => console.log(`    ${c.dim(v.from)} → ${c.dim(v.to)}  ${c.dim('fn: ' + v.fn)}`));
    if (vs.length > 5) console.log(c.dim(`    … ${vs.length - 5} more`));
    console.log('');
  }
}

// ── serve index.html with preloaded data (+ optional SSE live watch) ─
function serveAndOpen(
  indexHtml: string,
  result: Awaited<ReturnType<typeof analyzeSource>>,
  repoInfo: Record<string, string>,
  watchPath?: string,
  timeline?: ReturnType<typeof getGitTimeline>
) {
  const raw = readFileSync(indexHtml, 'utf8');

  // Inject preload + optional watch flag + optional timeline
  const buildPreload = (r: typeof result) => {
    let s = `<script>window.__GRASP_PRELOAD=${JSON.stringify({ data: r, repoInfo })};`;
    if (watchPath) s += `window.__GRASP_WATCH=true;`;
    if (timeline && timeline.length > 0) s += `window.__GRASP_TIMELINE=${JSON.stringify(timeline)};`;
    s += `</script>`;
    return s;
  };
  const buildHtml = (r: typeof result) => raw.replace('</head>', `${buildPreload(r)}\n</head>`);

  let latestResult = result;
  // SSE clients: list of ServerResponse streams
  const sseClients: ServerResponse[] = [];

  function pushUpdate(newResult: typeof result) {
    latestResult = newResult;
    const payload = JSON.stringify({ data: newResult, repoInfo });
    const msg = `data: ${payload}\n\n`;
    for (const client of sseClients.slice()) {
      try { client.write(msg); } catch { sseClients.splice(sseClients.indexOf(client), 1); }
    }
    console.log(c.dim(`  ↺ Updated — ${newResult.summary.fileCount} files, health ${newResult.summary.healthScore}/100`));
  }

  const dashboardHtml = findDashboardHtml();

  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    const urlPath = req.url?.split('?')[0] || '/';

    // SSE live-watch stream
    if (urlPath === '/events' && watchPath) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.write(': connected\n\n');
      sseClients.push(res);
      req.on('close', () => sseClients.splice(sseClients.indexOf(res), 1));
      return;
    }

    // ── REST API ───────────────────────────────────────────────────────
    const setCorsJson = () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
    };

    if (urlPath === '/api/health') {
      setCorsJson();
      res.end(JSON.stringify({ status: 'ok', version: '3.4.2', rooms: getRoomList().length }));
      return;
    }

    if (urlPath === '/api/rooms') {
      setCorsJson();
      res.end(JSON.stringify({ rooms: getRoomList() }));
      return;
    }

    // /api/workspace/:room — GET or PUT
    const wsMatch = urlPath.match(/^\/api\/workspace\/([^/]+)$/);
    if (wsMatch) {
      const roomId = decodeURIComponent(wsMatch[1]);
      if (req.method === 'GET') {
        setCorsJson();
        const ws = getWorkspace(roomId);
        if (ws) { res.end(JSON.stringify({ workspace: ws })); }
        else { res.statusCode = 404; res.end(JSON.stringify({ error: 'No workspace for this room' })); }
        return;
      }
      if (req.method === 'PUT') {
        setCorsJson();
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            setWorkspace(roomId, payload.workspace);
            res.end(JSON.stringify({ ok: true }));
          } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); }
        });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.end();
        return;
      }
    }

    // Team dashboard
    if (urlPath === '/dashboard' && dashboardHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      try { res.end(readFileSync(dashboardHtml, 'utf8')); } catch { res.statusCode = 500; res.end('Error reading dashboard'); }
      return;
    }

    // Main app (default)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buildHtml(latestResult));
  });

  // Attach WebSocket sync server to the same HTTP server
  attachSyncServer(srv, roomSecrets);

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  srv.listen(port, host, () => {
    const url = `http://${displayHost}:${port}`;
    console.log(c.bold(`  🔭 Grasp is ready → ${url}`));
    if (dashboardHtml) console.log(c.dim(`  📊 Team Dashboard  → ${url}/dashboard`));
    if (host === '0.0.0.0') console.log(c.dim(`  🌐 LAN access enabled — bind host: 0.0.0.0`));
    if (watchPath) console.log(c.green(`  👁  Watching ${watchPath} for changes...`));
    console.log(c.dim(`  🔄 Live Sync (WS)   → ws://${displayHost}:${port}/sync`));
    console.log(c.dim('  Press Ctrl+C to stop'));
    console.log('');
    if (!noOpen) openBrowser(url);
  });

  // ── Incremental file watcher with debounce ────────────────────────
  if (watchPath) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const SKIP = /\.(swp|swx|tmp|lock)|~$|\.git\//;
    const src = parseSource(watchPath, token, gitlabToken, gitlabHost);
    // FileChangeTracker is initialised from the first full analysis result
    const tracker = new FileChangeTracker(result);
    try {
      fsWatch(watchPath, { recursive: true }, (_evt, filename) => {
        if (!filename || SKIP.test(filename)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            // Normalise path to be relative (same format as AnalyzedFile.path)
            const relPath = filename.replace(/\\/g, '/');
            const affected = tracker.affectedFiles(relPath);
            const affectedCount = affected.size;
            process.stdout.write(c.dim(`\r  ↺ ${affectedCount} file${affectedCount === 1 ? '' : 's'} affected, re-analysing...        `));

            // Re-analyse only the affected subset using a filtered source
            // For simplicity fall back to full re-analysis when the file is
            // new (not yet in the graph) or when fewer than 30% of files changed
            const totalFiles = tracker.getCached().files.length;
            let fresh: Awaited<ReturnType<typeof analyzeSource>>;
            if (affectedCount > 0 && affectedCount < Math.max(10, totalFiles * 0.3)) {
              // Incremental: full re-analysis but we merge only affected portions
              fresh = await analyzeSource(src!, () => {});
              const merged = tracker.merge(fresh, affected);
              process.stdout.write('\r' + ' '.repeat(60) + '\r');
              pushUpdate(merged);
            } else {
              // Fall back to full re-analysis (new file added, large change)
              fresh = await analyzeSource(src!, () => {});
              // Reset tracker with new full result
              (tracker as unknown as { cachedResult: typeof fresh }).cachedResult = fresh;
              process.stdout.write('\r' + ' '.repeat(60) + '\r');
              pushUpdate(fresh);
            }
          } catch { /* ignore transient errors during re-analysis */ }
        }, 800);
      });
    } catch { /* fs.watch not supported on all platforms */ }
  }

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
    token,
    gitlabToken,
    gitlabHost
  );

  if (!source) {
    console.error(c.red(`  Error: cannot parse target "${target}"`));
    usage(); process.exit(1);
  }

  console.log(c.bold('\n  🔭 Grasp\n'));
  if (source.type === 'local') {
    console.log(c.dim(`  Analysing: ${source.path}`));
  } else if (source.type === 'gitlab') {
    console.log(c.dim(`  Analysing: ${source.namespace}/${source.project}`));
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

  const progressCallback = (done: number, total: number, file: string) => {
    process.stderr.write('\r' + renderProgressBar(done, total, file));
    if (done === total) process.stderr.write('\n');
  };

  let result: Awaited<ReturnType<typeof analyzeSource>>;
  try {
    result = await analyzeSource(source, (msg) => {
      lastMsg = msg;
      if (!isTTY || report) process.stderr.write(`  ${msg}\n`);
    }, progressCallback);
  } catch (err: any) {
    if (spin) clearInterval(spin);
    if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');
    console.error(c.red(`\n  Analysis failed: ${err.message || err}`));
    process.exit(1);
  }

  if (spin) clearInterval(spin);
  if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  printReport(result);

  // ── CI rules gate ────────────────────────────────────────────────────
  if (rulesCI) {
    const dir = source.type === 'local' ? (source.path ?? process.cwd()) : process.cwd();
    const rules = loadRulesFile(dir);
    if (!rules) {
      console.log(c.yellow('  No .grasprules file found. Create one to enforce architecture rules.'));
      console.log(c.dim('  Example: { "rules": [{ "from": "utils", "to": "services", "type": "FORBIDDEN", "reason": "..." }] }'));
      console.log('');
    } else {
      const violations = applyArchRules(result.files, result.connections, rules);
      printRulesReport(violations, rules);
      if (violations.length > 0) {
        // Write report too
        const out = 'grasp-report.json';
        try { writeFileSync(out, JSON.stringify({ ...result, archRuleViolations: violations, ci: { passed: false, score: result.summary.healthScore, failures: violations.map(v => v.rule + ': ' + v.from + ' → ' + v.to) } }, null, 2)); } catch {}
        process.exit(1);
      }
      const out = 'grasp-report.json';
      try { writeFileSync(out, JSON.stringify({ ...result, archRuleViolations: [], ci: { passed: true, score: result.summary.healthScore, failures: [] } }, null, 2)); } catch {}
      process.exit(0);
    }
  }

  if (prComment) {
    // Output a GitHub PR comment to stdout for CI/CD use
    const s = result.summary;
    const scoreNum = s.healthScore;
    const gradeEmoji: Record<string, string> = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴' };
    const emoji = gradeEmoji[s.healthGrade] ?? '⚪';
    const bar = '`' + '█'.repeat(Math.round(scoreNum / 10)) + '░'.repeat(10 - Math.round(scoreNum / 10)) + '`';
    const critBadge = s.criticalIssueCount > 0 ? ` ⚠️ ${s.criticalIssueCount} critical` : '';
    const secBadge  = s.securityIssueCount  > 0 ? ` 🔐 ${s.securityIssueCount} security` : '';

    const comment = [
      '## 📊 Grasp Health Report',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| **Health Score** | ${bar} **${scoreNum}/100** |`,
      `| **Grade** | ${emoji} **${s.healthGrade}** |`,
      `| **Files** | ${s.fileCount} (${s.functionCount} functions) |`,
      `| **Architecture Issues** | ${s.issueCount}${critBadge} |`,
      `| **Circular Deps** | ${s.circularDepCount}${s.circularDepCount === 0 ? ' ✓' : ''} |`,
      `| **Security** | ${s.securityIssueCount}${secBadge || ' ✓'} |`,
      `| **Layers** | ${(s.layers ?? []).join(', ') || 'none'} |`,
      '',
      '<details><summary>ℹ️ What is Grasp?</summary>',
      '',
      '[Grasp](https://github.com/ashfordeOU/grasp) analyses codebase architecture: dead code, circular deps, layer violations, and security patterns.',
      '</details>',
    ].join('\n');

    process.stdout.write(comment + '\n');
    process.exit(scoreNum >= 60 ? 0 : 1);
  }

  if (sarifMode) {
    const sarif = toSarif(result);
    const outPath = 'grasp-results.sarif';
    writeFileSync(outPath, JSON.stringify(sarif, null, 2));
    console.log(c.green(`  ✓ SARIF written to ${outPath}`));
    console.log(c.dim(`    ${sarif.runs[0].results.length} results across ${sarif.runs[0].tool.driver.rules.length} rules`));
    process.exit(0);
  }

  if (report) {
    // Terminal-only: write JSON and exit
    const out = 'grasp-report.json';
    try { writeFileSync(out, JSON.stringify(result, null, 2)); console.log(c.dim(`  Report → ${out}`)); } catch {}
    process.exit(result.summary.healthScore >= 60 ? 0 : 1);
  }

  if (args.includes('--check')) {
    const { loadGraspConfig, evaluateRules } = await import('./config.js');
    const checkDir = source.type === 'local' ? (source.path ?? process.cwd()) : process.cwd();
    const cfg = await loadGraspConfig(checkDir);
    if (cfg) {
      const blastMap: Record<string, number> = {};
      for (const conn of result.connections) {
        blastMap[conn.source] = (blastMap[conn.source] ?? 0) + 1;
      }
      const violations = evaluateRules(cfg, {
        score: result.summary.healthScore,
        blastMap,
        layers: result.summary.layers ?? [],
      });
      if (violations.length > 0) {
        console.error(`\n❌ grasp.yml violations (${violations.length}):`);
        for (const v of violations) {
          console.error(`  ${v.severity === 'error' ? '✗' : '!'} [${v.rule}]${v.file ? ` ${v.file}` : ''}: ${v.message}`);
        }
        process.exit(1);
      } else {
        console.log('\n✅ All grasp.yml rules passed.');
      }
    }
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
    const timeline = timelineMode && source.path ? getGitTimeline(source.path, 30) : undefined;
    if (timeline && timeline.length > 0) console.log(c.dim(`  📅 Timeline: ${timeline.length} commits loaded`));
    serveAndOpen(indexHtml, result, repoInfo, watchMode ? source.path! : undefined, timeline);
  }
}

async function runIndex() {
  const src = positional[1];
  if (!src) {
    console.error(c.red('  Usage: grasp index <source>'));
    console.log(c.dim('  Examples: grasp index ./my-project   grasp index owner/repo'));
    process.exit(1);
  }
  const resolvedSrc = src.startsWith('.') || src.startsWith('/') || src.startsWith('~')
    ? resolve(src.replace(/^~/, process.env.HOME || '~'))
    : src;
  const source = parseSource(resolvedSrc, token, gitlabToken, gitlabHost);
  if (!source) {
    console.error(c.red(`  Error: cannot parse source "${src}"`));
    process.exit(1);
  }
  console.log(c.bold('\n  🧠 Grasp Brain Index\n'));
  const result = await analyzeSource(source, () => {});
  getBrainStore().indexResult(result);
  console.log(c.green(`\n  ✓ ${formatIndexResult(resolvedSrc, result)}\n`));
}

function runContext() {
  const src = positional[1];
  const file = positional[2];
  if (!src || !file) {
    console.error(c.red('  Usage: grasp context <source> <file>'));
    process.exit(1);
  }
  const ctx = getBrainStore().getFileContext(src, file);
  if (!ctx) {
    console.error(c.yellow(`  No brain data for ${file} in ${src}. Run: grasp index ${src}`));
    process.exit(1);
  }
  const out = formatContextOutput(ctx);
  console.log(c.bold(`\n  📄 ${out.file}`));
  console.log(`  Layer: ${out.layer}   Grade: ${gradeColour(out.health_grade)}   Complexity: ${out.complexity}`);
  console.log(`  Coupling: in=${out.coupling_in} out=${out.coupling_out}   Churn: ${out.churn}`);
  if (out.dependencies.length) console.log(c.dim(`  Deps:    ${out.dependencies.slice(0, 5).join(', ')}`));
  if (out.dependents.length)   console.log(c.dim(`  Used by: ${out.dependents.slice(0, 5).join(', ')}`));
  if (out.security_issues.length) {
    console.log(c.red(`  Security: ${out.security_issues.length} issue(s)`));
    out.security_issues.slice(0, 3).forEach(s => console.log(c.red(`    [${s.severity}] ${s.desc}`)));
  }
  console.log('');
}

function runSetup() {
  const repoDir = positional[1]
    ? resolve(positional[1].replace(/^~/, process.env.HOME || '~'))
    : process.cwd();
  const source = positional[2] || repoDir;

  const editors = detectEditors(repoDir);
  if (editors.length === 0) {
    console.log(c.yellow('\n  No supported editors detected (.claude/, .cursor/, .windsurf/)\n'));
    console.log(c.dim('  Create one of those directories and re-run: grasp setup\n'));
  } else {
    editors.forEach(e => generateHookScript(repoDir, e));
    console.log(c.green(`\n  ✓ ${formatSetupSummary(editors)}\n`));
  }
  generateClaudeMd(repoDir, source);
  generateAgentsMd(repoDir, source);
  console.log(c.dim(`  ✓ CLAUDE.md + AGENTS.md written to ${repoDir}\n`));
}

export function formatDiffReport(diff: import('./arch-diff.js').ArchDiff): string {
  const lines: string[] = [];
  lines.push(`Health delta: ${diff.healthDelta >= 0 ? '+' : ''}${diff.healthDelta}`);
  if (diff.gradeDegradations.length) {
    lines.push(`Grade degradations (${diff.gradeDegradations.length}):`);
    diff.gradeDegradations.forEach(d => lines.push(`  ${d.file}: ${d.before} → ${d.after} (complexity +${d.complexityDelta})`));
  }
  if (diff.newSecurityIssues.length) {
    lines.push(`New security issues (${diff.newSecurityIssues.length}):`);
    diff.newSecurityIssues.forEach(s => lines.push(`  [${s.severity}] ${s.file}: ${s.desc}`));
  }
  return lines.join('\n');
}

async function runDiff() {
  const src = positional[1];
  if (!src) {
    console.error(c.red('  Usage: grasp diff <source>'));
    process.exit(1);
  }
  const resolvedSrc = src.startsWith('.') || src.startsWith('/') || src.startsWith('~')
    ? resolve(src.replace(/^~/, process.env.HOME || '~'))
    : src;
  const baseRepo = getBrainStore().getRepo(resolvedSrc);
  if (!baseRepo) {
    console.error(c.yellow(`  No brain data for ${resolvedSrc}. Run: grasp index ${resolvedSrc}`));
    process.exit(1);
  }
  const source = parseSource(resolvedSrc, token, gitlabToken, gitlabHost);
  if (!source) { console.error(c.red(`  Error: cannot parse source "${src}"`)); process.exit(1); }
  console.log(c.bold('\n  🔍 Grasp Arch Diff\n'));
  const result = await analyzeSource(source, () => {});
  const baseFiles = getBrainStore().queryFiles(resolvedSrc, { limit: 10000 });
  const diff = computeArchDiff(
    { files: baseFiles.map(f => ({ path: f.path, healthGrade: f.healthGrade, complexity: f.complexity })), healthScore: baseRepo.healthScore, security: [] },
    { files: result.files.map(f => ({ path: f.path, healthGrade: (f as any).healthGrade ?? 'C', complexity: f.complexity ?? 1 })), healthScore: result.summary.healthScore, security: result.security.map(s => ({ severity: s.severity, file: s.file, desc: s.desc })) }
  );
  const report = formatDiffReport(diff);
  if (diff.healthDelta < 0 || diff.gradeDegradations.length > 0) {
    console.log(c.red(report));
  } else {
    console.log(c.green(report));
  }
  console.log('');
}

async function runDaemon() {
  const src = positional[1];
  if (!src) {
    console.error(c.red('  Usage: grasp daemon <path>'));
    console.log(c.dim('  Watches a local directory and auto-re-indexes into the brain on file changes.'));
    process.exit(1);
  }
  const absPath = resolve(src.replace(/^~/, process.env.HOME || '~'));
  const source = parseSource(absPath, token, gitlabToken, gitlabHost);
  if (!source) { console.error(c.red(`  Error: cannot parse source "${src}"`)); process.exit(1); }

  console.log(c.bold('\n  👁️  Grasp Daemon\n'));
  console.log(c.dim(`  Watching: ${absPath}`));
  console.log(c.dim('  Press Ctrl+C to stop\n'));

  // Initial index
  const initial = await analyzeSource(source, () => {});
  getBrainStore().indexResult(initial);
  console.log(c.green(`  ✓ Initial index: ${initial.summary.fileCount} files, health ${initial.summary.healthGrade} (${initial.summary.healthScore})`));

  const daemon = new WatchDaemon(absPath, getBrainStore(), async () => {
    try {
      const result = await analyzeSource(source, () => {});
      getBrainStore().indexResult(result);
      console.log(c.dim(`  [${new Date().toLocaleTimeString()}] Re-indexed: ${result.summary.fileCount} files, health ${result.summary.healthGrade} (${result.summary.healthScore})`));
    } catch (e: any) {
      console.error(c.red(`  Error: ${e.message}`));
    }
  });
  daemon.start();

  process.on('SIGINT', () => { daemon.stop(); getBrainStore().close(); process.exit(0); });
  process.on('SIGTERM', () => { daemon.stop(); getBrainStore().close(); process.exit(0); });

  // keep process alive
  setInterval(() => {}, 60000);
}

async function runDrift() {
  const src = positional[1];
  if (!src) {
    console.error(c.red('  Usage: grasp drift <path>'));
    console.log(c.dim('  Compares current architecture to last snapshot. Exits 1 on CRITICAL drift.'));
    process.exit(1);
  }
  const resolvedSrc = src.startsWith('.') || src.startsWith('/') || src.startsWith('~')
    ? resolve(src.replace(/^~/, process.env.HOME || '~'))
    : src;
  const source = parseSource(resolvedSrc, token, gitlabToken, gitlabHost);
  if (!source) { console.error(c.red(`  Error: cannot parse source "${src}"`)); process.exit(1); }

  const brain = getBrainStore();

  console.log(c.bold('\n  🔍 Grasp Drift Detection\n'));
  const result = await analyzeSource(source, () => {});

  brain.indexResult(result);

  const files = brain.queryFiles(resolvedSrc, { limit: 10000 });
  const fileCoupling: Record<string, { in: number; out: number }> = {};
  for (const f of files) fileCoupling[f.path] = { in: f.couplingIn, out: f.couplingOut };
  const avgCouplingIn = files.length > 0 ? files.reduce((s, f) => s + f.couplingIn, 0) / files.length : 0;
  const currentData = {
    healthScore: result.summary.healthScore,
    healthGrade: result.summary.healthGrade,
    circularDepCount: (result.summary as any).circularDependencies?.length ?? 0,
    avgCouplingIn,
    fileCoupling,
    untestedFilePaths: [] as string[],
    topCoupledFiles: [...files].sort((a, b) => b.couplingIn - a.couplingIn).slice(0, 10).map(f => ({ path: f.path, couplingIn: f.couplingIn })),
  };

  const repoRec = brain.getRepo(resolvedSrc);
  if (!repoRec) {
    console.log(c.yellow('  No brain record found — run: grasp index ' + resolvedSrc));
    process.exit(0);
  }

  const lastSnap = brain.getLastSnapshot(repoRec.id);
  if (!lastSnap) {
    brain.saveSnapshot(repoRec.id, new Date().toISOString(), currentData);
    console.log(c.green(`  ✓ No baseline snapshot — saved current state as baseline.`));
    console.log(c.dim(`  Health: ${currentData.healthGrade} (${currentData.healthScore})\n`));
    process.exit(0);
  }

  const oldData = JSON.parse(lastSnap.data);
  const healthDelta = currentData.healthScore - oldData.healthScore;
  const circularDelta = Math.max(0, currentData.circularDepCount - oldData.circularDepCount);
  const couplingIncreasedCount = Object.entries(currentData.fileCoupling)
    .filter(([p, nc]) => {
      const oc = oldData.fileCoupling?.[p];
      return oc && nc.in > oc.in * 1.2 && nc.in - oc.in >= 2;
    }).length;

  let driftLevel: 'STABLE' | 'DEGRADED' | 'CRITICAL' = 'STABLE';
  if (healthDelta <= -20 || circularDelta >= 5 || couplingIncreasedCount >= 5) driftLevel = 'CRITICAL';
  else if (healthDelta <= -5 || circularDelta >= 1 || couplingIncreasedCount >= 2) driftLevel = 'DEGRADED';

  const driftColour = driftLevel === 'STABLE' ? c.green : driftLevel === 'DEGRADED' ? c.yellow : c.red;
  console.log(`  Drift Level:  ${driftColour(driftLevel)}`);
  console.log(`  Health:       ${gradeColour(currentData.healthGrade)} (${currentData.healthScore}) — delta: ${healthDelta >= 0 ? '+' : ''}${healthDelta}`);
  if (circularDelta > 0) console.log(c.red(`  Circular deps: +${circularDelta} new`));
  if (couplingIncreasedCount > 0) console.log(c.yellow(`  Coupling up:   ${couplingIncreasedCount} file(s)`));
  if (driftLevel === 'STABLE') console.log(c.dim('  No significant architectural drift.'));
  console.log('');

  brain.saveSnapshot(repoRec.id, new Date().toISOString(), currentData);

  if (driftLevel === 'CRITICAL') process.exit(1);
}

async function runOrg() {
  const orgArg = positional[1];
  if (!orgArg) {
    console.error(c.red('  Usage: grasp org <github-org> [--token=ghp_xxx] [--format=json|html|md] [--max=20]'));
    process.exit(1);
  }
  const orgToken = args.find(a => a.startsWith('--token='))?.split('=').slice(1).join('=') ?? token;
  const formatArg = (args.find(a => a.startsWith('--format='))?.split('=')[1] ?? 'md') as 'json' | 'html' | 'md';
  const maxArg = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] ?? '20', 10);

  console.log(c.bold(`\n  🏢 Grasp Org Dashboard: ${orgArg}\n`));
  console.log(c.dim(`  Fetching up to ${maxArg} repos...\n`));

  const { analyzeOrg } = await import('./analyzer.js');
  const summary = await analyzeOrg(orgArg, orgToken, 5, maxArg);

  if (formatArg === 'json') {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }
  if (formatArg === 'html') {
    const html = generateOrgHtml(summary);
    const outFile = `grasp-org-${orgArg}-${Date.now()}.html`;
    writeFileSync(outFile, html);
    console.log(c.green(`  ✓ Dashboard written to ${outFile}\n`));
    return;
  }
  // Markdown (default)
  console.log(`  Org:          ${c.bold(summary.org)}`);
  console.log(`  Repos:        ${summary.analyzed_count} analyzed of ${summary.repo_count} total`);
  console.log(`  Health:       ${gradeColour(summary.overall_health_grade)}\n`);
  const dist = Object.entries(summary.grade_distribution).sort(([a], [b]) => a.localeCompare(b));
  if (dist.length) {
    console.log('  Grade distribution:');
    for (const [grade, count] of dist) console.log(`    ${gradeColour(grade)}: ${count}`);
  }
  console.log('');
  console.log('  Top repos by health:');
  for (const r of summary.repos_by_health.slice(0, 5)) {
    console.log(`    ${gradeColour(r.healthGrade)} ${r.repo} (${r.fileCount} files, ${r.securityIssues} security issues)`);
  }
  if (summary.top_churn_files.length) {
    console.log('');
    console.log('  Highest churn files:');
    for (const f of summary.top_churn_files.slice(0, 5)) {
      console.log(c.dim(`    ${f.repo}/${f.file} (churn: ${f.churn})`));
    }
  }
  console.log('');
}

function generateOrgHtml(summary: import('./analyzer.js').OrgSummary): string {
  const rows = summary.repos_by_health.map(r =>
    `<tr><td>${r.repo}</td><td class="g${r.healthGrade}">${r.healthGrade}</td><td>${r.fileCount}</td><td>${r.securityIssues}</td><td>${r.languages.slice(0,3).join(', ')}</td></tr>`
  ).join('\n');
  const gradeData = JSON.stringify(['A','B','C','D','F'].map(g => summary.grade_distribution[g] ?? 0));
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Grasp Org — ${summary.org}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;background:#0d1117;color:#c9d1d9}
  h1{color:#58a6ff} .metric{display:inline-block;background:#161b22;border-radius:8px;padding:1rem 2rem;margin:.5rem;text-align:center}
  .metric .val{font-size:2rem;font-weight:bold;color:#58a6ff}
  table{width:100%;border-collapse:collapse;margin-top:1rem} th,td{padding:.5rem 1rem;border-bottom:1px solid #30363d;text-align:left}
  th{background:#161b22} canvas{max-width:400px;margin:1rem 0}
  .gA{color:#3fb950}.gB{color:#56d364}.gC{color:#d29922}.gD{color:#f0883e}.gF{color:#f85149}
</style></head><body>
<h1>Grasp Org Dashboard: ${summary.org}</h1>
<div>
  <div class="metric"><div class="val">${summary.analyzed_count}</div><div>Repos Analyzed</div></div>
  <div class="metric"><div class="val g${summary.overall_health_grade}">${summary.overall_health_grade}</div><div>Overall Health</div></div>
  <div class="metric"><div class="val">${summary.repo_count}</div><div>Total Public Repos</div></div>
</div>
<canvas id="gc"></canvas>
<h2>Repositories</h2>
<table><thead><tr><th>Repo</th><th>Grade</th><th>Files</th><th>Security</th><th>Languages</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>
new Chart(document.getElementById('gc'),{type:'bar',data:{labels:['A','B','C','D','F'],datasets:[{label:'Repos by Grade',data:${gradeData},backgroundColor:['#3fb950','#56d364','#d29922','#f0883e','#f85149']}]},options:{plugins:{legend:{labels:{color:'#c9d1d9'}}},scales:{x:{ticks:{color:'#c9d1d9'}},y:{ticks:{color:'#c9d1d9',stepSize:1}}}}}})\;
</script></body></html>`;
}

if (require.main === module) {
  const cmd = positional[0];
  if (cmd === 'index') {
    runIndex().catch(err => { console.error('\x1b[31mFatal:\x1b[0m', err); process.exit(1); });
  } else if (cmd === 'context') {
    runContext();
  } else if (cmd === 'setup') {
    runSetup();
  } else if (cmd === 'diff') {
    runDiff().catch(err => { console.error('\x1b[31mFatal:\x1b[0m', err); process.exit(1); });
  } else if (cmd === 'daemon') {
    runDaemon().catch(err => { console.error('\x1b[31mFatal:\x1b[0m', err); process.exit(1); });
  } else if (cmd === 'drift') {
    runDrift().catch(err => { console.error('\x1b[31mFatal:\x1b[0m', err); process.exit(1); });
  } else if (cmd === 'org') {
    runOrg().catch(err => { console.error('\x1b[31mFatal:\x1b[0m', err); process.exit(1); });
  } else {
    main().catch(err => {
      console.error('\x1b[31mFatal:\x1b[0m', err);
      process.exit(1);
    });
  }
}
