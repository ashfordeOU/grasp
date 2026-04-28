#!/usr/bin/env node
'use strict';

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const https = require('https');

const REPO_PATH = process.env.GRASP_WORKSPACE || process.cwd();
const BASE_REF = process.env.GRASP_BASE_REF || 'main';
const PR_NUMBER = process.env.GRASP_PR_NUMBER;
const REPO = process.env.GRASP_REPO;
const TOKEN = process.env.GITHUB_TOKEN;
const MIN_RISK = process.env.GRASP_MIN_RISK || 'LOW';
const FAIL_RISK = process.env.GRASP_FAIL_RISK || 'CRITICAL';
const RISK_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function riskAtLeast(level, threshold) {
  if (!threshold) return false;
  return RISK_ORDER.indexOf(level) >= RISK_ORDER.indexOf(threshold);
}

function startServer() {
  const proc = spawn('grasp-mcp-server', [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: proc.stdout });
  return { proc, lines };
}

let msgId = 1;
function send(proc, msg) { proc.stdin.write(JSON.stringify(msg) + '\n'); }

function nextResponse(lines, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server response timeout')), timeoutMs);
    const onLine = (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined || msg.method === undefined) {
          clearTimeout(timer); lines.off('line', onLine); resolve(msg);
        }
      } catch {}
    };
    lines.on('line', onLine);
  });
}

async function callTool(proc, lines, name, args) {
  const id = msgId++;
  send(proc, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  const resp = await nextResponse(lines);
  if (resp.error) throw new Error(`${name} error: ${JSON.stringify(resp.error)}`);
  const text = resp.result?.content?.[0]?.text ?? '{}';
  return JSON.parse(text);
}

function getBlameOwners(repoPath, filePath) {
  try {
    const out = execSync(
      `git -C "${repoPath}" log --follow -n 20 --format="%ae" -- "${filePath}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 10000 }
    );
    const emails = out.trim().split('\n').filter(Boolean);
    const counts = {};
    for (const e of emails) counts[e] = (counts[e] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([email]) => email);
  } catch { return []; }
}

function riskBadge(level) {
  return { LOW: '🟢 **LOW**', MEDIUM: '🟡 **MEDIUM**', HIGH: '🟠 **HIGH**', CRITICAL: '🔴 **CRITICAL**' }[level] || level;
}

function postComment(body) {
  return new Promise((resolve, reject) => {
    const [owner, repo] = REPO.split('/');
    const payload = JSON.stringify({ body });
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues/${PR_NUMBER}/comments`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'grasp-pr-impact-action',
        'Accept': 'application/vnd.github+json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

async function main() {
  const { proc, lines } = startServer();
  proc.stderr.on('data', () => {});

  try {
    send(proc, { jsonrpc: '2.0', id: msgId++, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'pr-impact', version: '1' } } });
    await nextResponse(lines);
    send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

    console.log(`Analyzing ${REPO_PATH}...`);
    const analysis = await callTool(proc, lines, 'grasp_analyze', { source: REPO_PATH });
    const sessionId = analysis.session_id;
    if (!sessionId) throw new Error('grasp_analyze did not return a session_id');

    console.log(`Detecting changes vs ${BASE_REF}...`);
    const changes = await callTool(proc, lines, 'grasp_detect_changes', {
      source: REPO_PATH, scope: 'compare', base_ref: BASE_REF,
    });

    const riskLevel = changes.risk_summary?.risk_level || 'LOW';
    console.log(`Risk: ${riskLevel}`);

    if (!riskAtLeast(riskLevel, MIN_RISK)) {
      console.log(`Risk ${riskLevel} is below min-risk-to-comment (${MIN_RISK}) — skipping PR comment.`);
      proc.kill(); process.exit(0);
    }

    const reviewerTally = {};
    for (const sym of (changes.affected_symbols || []).slice(0, 10)) {
      for (const email of getBlameOwners(REPO_PATH, sym.file)) {
        reviewerTally[email] = (reviewerTally[email] || 0) + 1;
      }
    }
    const suggestedReviewers = Object.entries(reviewerTally)
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);

    const symbolRows = (changes.affected_symbols || []).slice(0, 15)
      .map(s => `| \`${s.file.split('/').slice(-2).join('/')}\` | \`${s.fn}\` | ${s.line} | ${s.change_type || 'modified'} |`)
      .join('\n');
    const processRows = (changes.affected_processes || []).slice(0, 5)
      .map(p => `| \`${p.name}\` | \`${p.entry}\` | ${p.step_count} |`)
      .join('\n');

    const commentLines = [
      `## ${riskBadge(riskLevel)} Grasp Architecture Impact`,
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Changed files | ${changes.changed_files?.length ?? 0} |`,
      `| Affected symbols | ${changes.risk_summary?.total_symbols ?? 0} |`,
      `| Affected processes | ${changes.risk_summary?.total_processes ?? 0} |`,
    ];
    if (symbolRows) {
      commentLines.push('', '### Affected Symbols', '',
        '| File | Function | Line | Change |', '|------|----------|------|--------|', symbolRows);
    }
    if (processRows) {
      commentLines.push('', '### Affected Execution Processes', '',
        '| Process | Entry Point | Steps |', '|---------|-------------|-------|', processRows);
    }
    if (suggestedReviewers.length) {
      commentLines.push('', `### Suggested Reviewers`, '', `Based on git blame: ${suggestedReviewers.join(', ')}`);
    }
    commentLines.push('', `<sub>Generated by [Grasp](https://github.com/ashfordeOU/grasp)</sub>`);
    const body = commentLines.join('\n');

    if (PR_NUMBER && TOKEN) {
      await postComment(body);
      console.log(`Comment posted to PR #${PR_NUMBER}`);
    } else {
      console.log('--- PR Impact Comment (dry run) ---');
      console.log(body);
    }

    proc.kill();
    if (riskAtLeast(riskLevel, FAIL_RISK)) {
      console.error(`Exiting 1: risk ${riskLevel} meets fail-on-risk threshold (${FAIL_RISK})`);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Grasp PR Impact failed:', err.message);
    proc.kill(); process.exit(1);
  }
}

main();
