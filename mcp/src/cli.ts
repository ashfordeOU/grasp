#!/usr/bin/env node
// =====================================================================
// Grasp CLI — opens the browser pre-loaded with the analysis
//
//   npx grasp ./my-project     → local folder, served on localhost
//   npx grasp owner/repo       → GitHub repo, opens file:// or localhost
//   npx grasp --report .       → terminal-only report (no browser)
// =====================================================================

import { analyzeSource, parseSource } from './analyzer.js';
import { getGitTimeline, FileChangeTracker } from './sources/local.js';
import { toSarif } from './sarif.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, readFileSync, writeFileSync, watch as fsWatch } from 'fs';
import { resolve, join, dirname } from 'path';
import { exec } from 'child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const target   = positional[0] || '.';
const report   = flags.has('--report');   // terminal-only mode
const noOpen   = flags.has('--no-open');  // skip launching browser
const rulesCI    = flags.has('--rules');      // CI gate mode — check .grasprules and exit 1 on violations
const watchMode  = flags.has('--watch');      // live watch — re-analyse on file change, push via SSE
const timelineMode = flags.has('--timeline'); // inject git history timeline into browser
const prComment  = flags.has('--pr-comment'); // output a GitHub PR comment to stdout (for CI)
const sarifMode  = flags.has('--format=sarif') || process.argv.includes('--format=sarif'); // output SARIF file
const port     = parseInt(process.env.GRASP_PORT || '7331', 10);
const token    = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const gitlabToken = process.env.GITLAB_TOKEN;
const gitlabHost  = process.argv.find(a => a.startsWith('--gitlab-host='))?.split('=')[1]
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
    --help                      Show this help

  ${c.dim('Environment:')}
    GITHUB_TOKEN / GH_TOKEN     GitHub PAT (needed for private repos)
    GITLAB_TOKEN                GitLab PRIVATE-TOKEN or Bearer token
    GITLAB_HOST                 Self-hosted GitLab host (e.g. gitlab.internal.company.com)
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

// ── architecture rules CI gate ────────────────────────────────────────
interface ArchRule { from: string; to: string; type: 'FORBIDDEN'; reason?: string; }
interface RuleViolation { rule: string; from: string; fromLayer: string; to: string; toLayer: string; fn: string; reason: string; }

function loadRulesFile(dir: string): ArchRule[] | null {
  const p = join(dir, '.grasprules');
  if (!existsSync(p)) return null;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(obj) ? obj : (obj.rules || []);
  } catch { return null; }
}

function applyArchRules(
  files: Array<{ path: string; layer: string }>,
  connections: Array<{ source: string; target: string; fn: string }>,
  rules: ArchRule[]
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const layerMap: Record<string, string> = {};
  files.forEach(f => { layerMap[f.path] = f.layer; });
  rules.filter(r => r.type === 'FORBIDDEN').forEach(rule => {
    connections.forEach(conn => {
      const srcLayer = layerMap[conn.source];
      const tgtLayer = layerMap[conn.target];
      if (!srcLayer || !tgtLayer) return;
      const fromMatch = rule.from === '*' || rule.from === srcLayer;
      const toMatch   = rule.to   === '*' || rule.to   === tgtLayer;
      if (fromMatch && toMatch) {
        violations.push({ rule: `${rule.from} → ${rule.to}`, from: conn.source, fromLayer: srcLayer, to: conn.target, toLayer: tgtLayer, fn: conn.fn, reason: rule.reason || 'FORBIDDEN' });
      }
    });
  });
  return violations;
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

  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/events' && watchPath) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.write(': connected\n\n');
      sseClients.push(res);
      req.on('close', () => sseClients.splice(sseClients.indexOf(res), 1));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buildHtml(latestResult));
  });

  srv.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(c.bold(`  🔭 Grasp is ready → ${url}`));
    if (watchPath) console.log(c.green(`  👁  Watching ${watchPath} for changes...`));
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

if (require.main === module) {
  main().catch(err => {
    console.error('\x1b[31mFatal:\x1b[0m', err);
    process.exit(1);
  });
}
