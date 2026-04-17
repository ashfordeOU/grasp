#!/usr/bin/env node
// =====================================================================
// Grasp CLI — npx grasp <path>  OR  npx grasp owner/repo
// =====================================================================

import { analyzeSource, parseSource } from './analyzer.js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const target = positional[0] || '.';
const outputJson = flags.has('--json');
const outputFile = flags.has('--out') ? positional[positional.indexOf('--out') + 1] : null;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

function usage() {
  console.log(`
  Grasp — codebase architecture analyser

  Usage:
    npx grasp [path]           Analyse a local directory (default: .)
    npx grasp owner/repo       Analyse a GitHub repo
    npx grasp <url>            Analyse a GitHub URL

  Options:
    --json                     Print full JSON report to stdout
    --out <file>               Write JSON report to file (default: grasp-report.json)
    --help                     Show this help

  Environment:
    GITHUB_TOKEN / GH_TOKEN    GitHub PAT for private repos and higher rate limits
`);
}

if (flags.has('--help') || flags.has('-h')) { usage(); process.exit(0); }

// Colour helpers (no external deps)
const c = {
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
  blue:  (s: string) => `\x1b[34m${s}\x1b[0m`,
  reset: (s: string) => `\x1b[0m${s}\x1b[0m`,
};

function gradeColour(grade: string): string {
  if (grade === 'A') return c.green(grade);
  if (grade === 'B') return c.green(grade);
  if (grade === 'C') return c.yellow(grade);
  if (grade === 'D') return c.yellow(grade);
  return c.red(grade);
}

function scoreBar(score: number, width = 30): string {
  const filled = Math.round((score / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  if (score >= 80) return c.green(bar);
  if (score >= 60) return c.yellow(bar);
  return c.red(bar);
}

function severityIcon(type: string): string {
  if (type === 'critical') return c.red('✗');
  if (type === 'warning')  return c.yellow('⚠');
  return c.blue('ℹ');
}

function indent(s: string, n = 2): string {
  return s.split('\n').map(l => ' '.repeat(n) + l).join('\n');
}

async function main() {
  // Resolve the source
  let resolvedTarget = target;
  let isLocal = true;

  // Check if it looks like a local path
  if (!target.includes('/') || target.startsWith('.') || target.startsWith('/') || target.startsWith('~')) {
    resolvedTarget = resolve(target.replace(/^~/, process.env.HOME || '~'));
  } else {
    // Could be owner/repo or a GitHub URL
    isLocal = false;
  }

  const source = parseSource(resolvedTarget, token);
  if (!source) {
    console.error(c.red(`Error: could not parse target "${target}"`));
    usage();
    process.exit(1);
  }

  const spinFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let spinIdx = 0;
  let lastMsg = '';
  const isTTY = process.stdout.isTTY;

  const spin = isTTY ? setInterval(() => {
    process.stdout.write(`\r${spinFrames[spinIdx++ % spinFrames.length]} ${lastMsg}          `);
  }, 80) : null;

  console.log(c.bold('\n  🔭 Grasp — codebase analysis\n'));
  if (source.type === 'local') {
    console.log(c.dim(`  Target: ${source.path}`));
  } else {
    console.log(c.dim(`  Target: ${source.owner}/${source.repo} (GitHub${token ? ' + token' : ''})`));
  }
  console.log('');

  let result;
  try {
    result = await analyzeSource(source, (msg) => {
      lastMsg = msg;
      if (!isTTY) process.stderr.write(`  ${msg}\n`);
    });
  } catch (err: any) {
    if (spin) clearInterval(spin);
    if (isTTY) process.stdout.write('\r');
    console.error(c.red(`\n  Analysis failed: ${err.message || err}`));
    process.exit(1);
  }

  if (spin) clearInterval(spin);
  if (isTTY) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  const s = result.summary;

  // ── Health banner ──────────────────────────────────────────────
  const grade = s.healthGrade;
  const score = s.healthScore;
  console.log('  ' + scoreBar(score) + c.bold(` ${score}/100  `) + gradeColour(grade));
  console.log('');

  // ── Stats row ──────────────────────────────────────────────────
  const stats = [
    ['Files',     s.fileCount.toString()],
    ['Functions', s.functionCount.toString()],
    ['Connections', s.connectionCount.toString()],
    ['Issues',    c.bold(s.issueCount.toString())],
    ['Cycles',    s.circularDepCount > 0 ? c.red(s.circularDepCount.toString()) : c.green('0')],
    ['Security',  s.securityIssueCount > 0 ? c.red(s.securityIssueCount.toString()) : c.green('0')],
  ];
  console.log('  ' + stats.map(([k,v]) => `${c.dim(k)}: ${v}`).join('  '));
  console.log('');

  // ── Layers ─────────────────────────────────────────────────────
  if (s.layers.length) {
    console.log(c.dim('  Layers: ') + s.layers.join(' › '));
    console.log('');
  }

  // ── Issues ─────────────────────────────────────────────────────
  if (result.issues.length) {
    console.log(c.bold('  Architecture Issues'));
    console.log(c.dim('  ' + '─'.repeat(50)));
    const sorted = [...result.issues].sort((a,b) => {
      const ord = {critical:0,warning:1,info:2};
      return (ord[a.type]??3) - (ord[b.type]??3);
    });
    for (const issue of sorted.slice(0, 12)) {
      const icon = severityIcon(issue.type);
      console.log(`  ${icon} ${c.bold(issue.title)}`);
      console.log(c.dim(`    ${issue.desc}`));
      if (issue.items.length) {
        const preview = issue.items.slice(0, 3).map(i => i.name || i.file || '').filter(Boolean);
        if (preview.length) console.log(c.dim('    → ') + preview.join(', ') + (issue.items.length > 3 ? c.dim(` +${issue.items.length-3} more`) : ''));
      }
    }
    if (result.issues.length > 12) {
      console.log(c.dim(`  … ${result.issues.length - 12} more issues (run with --json for full report)`));
    }
    console.log('');
  }

  // ── Security ──────────────────────────────────────────────────
  if (result.security.length) {
    console.log(c.bold('  Security'));
    console.log(c.dim('  ' + '─'.repeat(50)));
    const bySeverity = [...result.security].sort((a,b) => {
      const ord: Record<string,number> = {critical:0,high:1,medium:2,low:3};
      return (ord[a.severity]??4) - (ord[b.severity]??4);
    });
    for (const sec of bySeverity.slice(0, 8)) {
      const col = sec.severity === 'critical' || sec.severity === 'high' ? c.red : c.yellow;
      console.log(`  ${col(`[${sec.severity.toUpperCase()}]`)} ${sec.file}${sec.line ? ':'+sec.line : ''}`);
      console.log(c.dim(`    ${sec.desc}`));
    }
    if (result.security.length > 8) {
      console.log(c.dim(`  … ${result.security.length - 8} more (--json for full list)`));
    }
    console.log('');
  }

  // ── Patterns ──────────────────────────────────────────────────
  const antiPatterns = result.patterns.filter(p => p.isAnti);
  const goodPatterns = result.patterns.filter(p => !p.isAnti);
  if (goodPatterns.length) {
    console.log(c.green('  ✓ Patterns detected: ') + goodPatterns.map(p => `${p.icon} ${p.name}`).join('  '));
  }
  if (antiPatterns.length) {
    console.log(c.yellow('  ⚠ Anti-patterns: ') + antiPatterns.map(p => `${p.icon} ${p.name} (${p.files.length} files)`).join('  '));
  }
  if (result.patterns.length) console.log('');

  // ── Languages ─────────────────────────────────────────────────
  if (s.languages.length) {
    const top = s.languages.slice(0, 6).map(l => `${l.ext}(${l.count})`).join(' ');
    console.log(c.dim('  Languages: ') + top);
    console.log('');
  }

  // ── CI pass/fail ───────────────────────────────────────────────
  const passed = score >= 60 && s.criticalIssueCount === 0 && s.securityIssueCount === 0;
  if (passed) {
    console.log('  ' + c.green('✓ CI gate: PASSED'));
  } else {
    console.log('  ' + c.red('✗ CI gate: FAILED'));
    if (score < 60)             console.log(c.dim('    Score below 60'));
    if (s.criticalIssueCount)   console.log(c.dim(`    ${s.criticalIssueCount} critical issue(s)`));
    if (s.securityIssueCount)   console.log(c.dim(`    ${s.securityIssueCount} security issue(s)`));
  }
  console.log('');

  // ── JSON output ───────────────────────────────────────────────
  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  }

  const outFile = flags.has('--out')
    ? (positional[positional.indexOf('--out') + 1] || 'grasp-report.json')
    : (flags.has('--json') ? null : 'grasp-report.json');

  if (outFile) {
    try {
      writeFileSync(outFile, JSON.stringify(result, null, 2));
      console.log(c.dim(`  Report written to ${outFile}`));
    } catch (e: any) {
      console.error(c.red(`  Could not write ${outFile}: ${e.message}`));
    }
  }

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
