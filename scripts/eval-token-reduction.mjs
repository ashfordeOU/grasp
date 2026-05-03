#!/usr/bin/env node
// Eval harness — measure Grasp's structural-context token reduction vs naive full-file reads.
// Usage:
//   node scripts/eval-token-reduction.mjs            # all repos
//   node scripts/eval-token-reduction.mjs --only got # one repo by key

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(os.tmpdir(), 'grasp-eval');
const SERVER_BIN = path.join(REPO_ROOT, 'mcp', 'dist', 'index.js');

const REPOS = [
  { key: 'express', url: 'https://github.com/expressjs/express.git', ref: '4.19.2' },
  { key: 'flask',   url: 'https://github.com/pallets/flask.git',     ref: '2.3.0' },
  { key: 'gin',     url: 'https://github.com/gin-gonic/gin.git',     ref: 'v1.9.1' },
  { key: 'got',     url: 'https://github.com/sindresorhus/got.git',  ref: 'v14.0.0' },
  { key: 'lodash',  url: 'https://github.com/lodash/lodash.git',     ref: '4.17.21' },
  { key: 'axios',   url: 'https://github.com/axios/axios.git',       ref: 'v1.6.0' },
];

const CODE_EXT_RE = /\.(?:js|jsx|ts|tsx|mjs|cjs|py|go|rb|java|kt|rs|c|cc|cpp|h|hpp|cs|swift|php|scala|zig)$/;

function parseArgs(argv) {
  const args = { only: null, jsonOut: 'docs/benchmarks/token-reduction.json', mdOut: 'docs/benchmarks/token-reduction.md' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--only') { args.only = argv[++i]; }
    else if (argv[i] === '--json-out') { args.jsonOut = argv[++i]; }
    else if (argv[i] === '--md-out') { args.mdOut = argv[++i]; }
  }
  return args;
}

function ensureClone(repo) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, repo.key);
  if (fs.existsSync(path.join(dest, '.git'))) return dest;
  process.stderr.write(`[eval] cloning ${repo.url} @ ${repo.ref}\n`);
  execSync(`git clone --depth 1 --branch ${repo.ref} ${repo.url} ${dest}`, { stdio: 'inherit' });
  return dest;
}

function walkCodeFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.git')) continue;
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!CODE_EXT_RE.test(e.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function naiveTokenCost(files) {
  let chars = 0;
  let lines = 0;
  for (const f of files) {
    try {
      const buf = fs.readFileSync(f, 'utf8');
      chars += buf.length;
      lines += buf.split('\n').length;
    } catch { /* skip */ }
  }
  return { chars, lines, files: files.length, tokens: Math.ceil(chars / 4) };
}

function nextResponse(rl, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const onLine = (line) => {
      if (done) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined || msg.method === undefined) {
          done = true;
          rl.off('line', onLine);
          resolve(msg);
        }
      } catch { /* skip non-JSON */ }
    };
    rl.on('line', onLine);
    setTimeout(() => {
      if (!done) { done = true; rl.off('line', onLine); reject(new Error('timeout')); }
    }, timeoutMs);
  });
}

async function graspMinimalContext(source) {
  if (!fs.existsSync(SERVER_BIN)) {
    throw new Error(`MCP server not built. Run: cd mcp && node build.mjs`);
  }
  const proc = spawn('node', [SERVER_BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GRASP_DISABLE_EMBEDDINGS: '1' },
  });
  const rl = readline.createInterface({ input: proc.stdout });
  let id = 1;
  const send = (m) => proc.stdin.write(JSON.stringify(m) + '\n');
  try {
    send({ jsonrpc: '2.0', id: id++, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'eval', version: '1' } } });
    await nextResponse(rl, 30_000);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    send({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'grasp_analyze', arguments: { source } } });
    const analyze = await nextResponse(rl, 600_000);
    if (analyze.error) throw new Error(`grasp_analyze: ${JSON.stringify(analyze.error)}`);
    const text = analyze.result?.content?.[0]?.text ?? '';
    const sessionId = JSON.parse(text).session_id;

    send({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'grasp_minimal_context', arguments: { session_id: sessionId } } });
    const ctx = await nextResponse(rl, 60_000);
    if (ctx.error) throw new Error(`grasp_minimal_context: ${JSON.stringify(ctx.error)}`);
    const ctxText = ctx.result?.content?.[0]?.text ?? '';
    return { sessionId, text: ctxText, tokens: Math.ceil(ctxText.length / 4), chars: ctxText.length };
  } finally {
    proc.kill();
    rl.close();
  }
}

async function evalRepo(repo) {
  const start = Date.now();
  const dir = ensureClone(repo);
  const files = walkCodeFiles(dir);
  const naive = naiveTokenCost(files);
  const minimal = await graspMinimalContext(dir);
  const reduction = naive.tokens / Math.max(1, minimal.tokens);
  const elapsedMs = Date.now() - start;
  return {
    repo: repo.key, ref: repo.ref,
    files: naive.files, lines: naive.lines, chars: naive.chars,
    naive_tokens: naive.tokens,
    minimal_tokens: minimal.tokens, minimal_chars: minimal.chars,
    reduction_factor: Number(reduction.toFixed(2)),
    elapsed_ms: elapsedMs,
  };
}

function renderMarkdown(rows) {
  const lines = [];
  lines.push('# Grasp Token-Reduction Benchmark');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Naive baseline = total source-character count / 4 (approximate token cost of reading every file).');
  lines.push('Grasp minimal = `grasp_minimal_context` response length / 4.');
  lines.push('');
  lines.push('| Repo | Ref | Files | Lines | Naive tokens | Grasp tokens | Reduction |');
  lines.push('|------|-----|------:|------:|-------------:|-------------:|----------:|');
  let avg = 0;
  for (const r of rows) {
    lines.push(`| ${r.repo} | \`${r.ref}\` | ${r.files} | ${r.lines.toLocaleString()} | ${r.naive_tokens.toLocaleString()} | ${r.minimal_tokens.toLocaleString()} | ${r.reduction_factor}x |`);
    avg += r.reduction_factor;
  }
  if (rows.length) {
    lines.push(`| **Average** | | | | | | **${(avg / rows.length).toFixed(2)}x** |`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);
  const repos = args.only ? REPOS.filter(r => r.key === args.only) : REPOS;
  if (repos.length === 0) {
    process.stderr.write(`No repos selected. Available: ${REPOS.map(r => r.key).join(', ')}\n`);
    process.exit(1);
  }
  const rows = [];
  for (const repo of repos) {
    try {
      const row = await evalRepo(repo);
      rows.push(row);
      process.stderr.write(`[eval] ${repo.key}: ${row.naive_tokens.toLocaleString()} → ${row.minimal_tokens.toLocaleString()} tokens (${row.reduction_factor}x)\n`);
    } catch (err) {
      process.stderr.write(`[eval] ${repo.key} FAILED: ${err.message}\n`);
    }
  }
  const jsonPath = path.resolve(REPO_ROOT, args.jsonOut);
  const mdPath = path.resolve(REPO_ROOT, args.mdOut);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(rows));
  process.stderr.write(`[eval] wrote ${jsonPath}\n[eval] wrote ${mdPath}\n`);
}

main().catch((err) => { process.stderr.write(`[eval] fatal: ${err.stack || err.message}\n`); process.exit(1); });
