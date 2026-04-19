/**
 * Grasp GitHub App — webhook server
 *
 * Listens for pull_request events and automatically posts a Grasp health
 * report as a PR comment. Install on any org or individual repo.
 *
 * Environment variables (see .env.example):
 *   GITHUB_APP_ID           — numeric App ID from GitHub App settings
 *   GITHUB_PRIVATE_KEY_BASE64 — base64-encoded PEM private key
 *   GITHUB_WEBHOOK_SECRET   — webhook HMAC secret
 *   PORT                    — HTTP port (default 3000)
 *   GRASP_UI_URL            — base URL of the Grasp UI (optional)
 */

import http from 'node:http';
import { verifySignature, type PullRequestPayload } from './webhook.js';
import { getInstallationToken } from './auth.js';
import { buildComment, upsertComment } from './comment.js';

// ── Config ───────────────────────────────────────────────────────────────────

const APP_ID            = process.env.GITHUB_APP_ID ?? '';
const WEBHOOK_SECRET    = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const GRASP_UI_URL      = process.env.GRASP_UI_URL ?? 'https://ashforde.github.io/grasp/';
const PORT              = parseInt(process.env.PORT ?? '3000', 10);

function getPrivateKey(): string {
  const b64 = process.env.GITHUB_PRIVATE_KEY_BASE64 ?? '';
  if (!b64) throw new Error('GITHUB_PRIVATE_KEY_BASE64 is not set');
  return Buffer.from(b64, 'base64').toString('utf-8');
}

// ── Lightweight analysis using GitHub API ────────────────────────────────────

interface FileTreeEntry { path: string; type: string }

async function getFileCount(owner: string, repo: string, sha: string, token: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
    );
    if (!res.ok) return 0;
    const data = await res.json() as { tree: FileTreeEntry[]; truncated: boolean };
    return data.tree.filter(f => f.type === 'blob').length;
  } catch { return 0; }
}

/** Minimal health analysis using only publicly-available GitHub API data. */
async function analyzeRepo(owner: string, repo: string, sha: string, token: string) {
  // Use the Grasp MCP server to do a full analysis via GitHub source
  // Fallback to lightweight metrics if the full analysis takes too long
  try {
    const { analyzeSource } = await import('grasp-mcp-server/src/analyzer.js');
    const result = await analyzeSource(
      { type: 'github', owner, repo, token },
      () => undefined
    );
    return result.summary;
  } catch {
    // Lightweight fallback: just count files and return a placeholder
    const fileCount = await getFileCount(owner, repo, sha, token);
    return {
      fileCount,
      functionCount: 0,
      issueCount: 0,
      criticalIssueCount: 0,
      circularDepCount: 0,
      securityIssueCount: 0,
      healthScore: 0,
      healthGrade: '?',
      layers: [] as string[],
    };
  }
}

// ── PR event handler ──────────────────────────────────────────────────────────

async function handlePR(payload: PullRequestPayload): Promise<void> {
  const { repository, pull_request: pr, installation } = payload;
  const owner = repository.owner.login;
  const repo  = repository.name;
  const sha   = pr.head.sha;

  log(`PR #${payload.number}: ${owner}/${repo} — ${pr.title}`);

  const token = await getInstallationToken(APP_ID, installation.id, getPrivateKey());
  const summary = await analyzeRepo(owner, repo, sha, token);

  const score = summary.healthScore;
  const grade = summary.healthGrade ?? (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');

  const comment = buildComment(
    {
      score,
      grade,
      fileCount: summary.fileCount,
      functionCount: summary.functionCount,
      issueCount: summary.issueCount,
      criticalIssueCount: summary.criticalIssueCount,
      circularDepCount: summary.circularDepCount,
      securityIssueCount: summary.securityIssueCount,
      layers: summary.layers ?? [],
    },
    repository.full_name,
    pr.title,
    GRASP_UI_URL
  );

  await upsertComment(owner, repo, payload.number, token, comment);
  log(`  ✓ Comment posted on PR #${payload.number} (score ${score}/100, grade ${grade})`);

  // Auto-upload SARIF (non-fatal if Code Scanning not enabled)
  try {
    const { buildSarifPayload, uploadSarif } = await import('./comment.js');
    const sarifPayload = buildSarifPayload(
      (summary as any).securityIssues?.map((i: any) => ({
        file: i.file ?? 'unknown', message: i.message, severity: 'error' as const, line: i.line ?? 1,
      })) ?? []
    );
    await uploadSarif(owner, repo, sha, `refs/pull/${payload.number}/head`, token, sarifPayload);
  } catch { /* non-fatal */ }

  // Post inline review comments for high-risk files
  try {
    const changedFiles: string[] = []; // will be filled from PR files API if available
    const { buildReviewComments, postReview } = await import('./comment.js');
    const reviewComments = buildReviewComments(changedFiles, {
      blastMap: (summary as any).blastMap ?? {},
      securityFiles: (summary as any).securityFiles ?? [],
      complexMap: (summary as any).complexMap ?? {},
    });
    await postReview(owner, repo, payload.number, sha, token, reviewComments);
  } catch { /* non-fatal */ }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function log(msg: string) { process.stdout.write(`[grasp-app] ${msg}\n`); }

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app: 'grasp-github-app' }));
    return;
  }

  if (req.url !== '/webhook' || req.method !== 'POST') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const body = await readBody(req);
  const sig  = req.headers['x-hub-signature-256'] as string | undefined;
  const event = req.headers['x-github-event'] as string | undefined;

  if (!verifySignature(body, sig, WEBHOOK_SECRET)) {
    log(`  ✗ Invalid webhook signature`);
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  res.writeHead(202);
  res.end('Accepted');

  // Handle asynchronously so we respond to GitHub immediately
  if (event === 'issue_comment') {
    let commentPayload: Record<string, unknown>;
    try { commentPayload = JSON.parse(body.toString()) as Record<string, unknown>; } catch { return; }
    if (commentPayload.action !== 'created') return;
    const commentBody: string = (commentPayload.comment as Record<string, unknown>)?.body as string ?? '';
    if (!commentBody.toLowerCase().includes('@grasp-bot analyze')) return;
    const owner: string = ((commentPayload.repository as Record<string, unknown>).owner as Record<string, unknown>).login as string;
    const repo: string  = (commentPayload.repository as Record<string, unknown>).name as string;
    const issueNumber: number = (commentPayload.issue as Record<string, unknown>).number as number;
    const installId: number | undefined = (commentPayload.installation as Record<string, unknown> | undefined)?.id as number | undefined;
    if (!installId) return;
    (async () => {
      try {
        const token = await getInstallationToken(APP_ID, installId, getPrivateKey());
        // Post eyes reaction to acknowledge
        const commentId = ((commentPayload.comment as Record<string, unknown>).id as number);
        await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'eyes' }),
        });
        // Run lightweight analysis and post comment
        const sha = (commentPayload.issue as Record<string, unknown>).pull_request
          ? ((commentPayload.pull_request as Record<string, unknown> | undefined)?.head as Record<string, unknown> | undefined)?.sha as string ?? 'HEAD'
          : 'HEAD';
        const summary = await analyzeRepo(owner, repo, sha, token);
        const score = summary.healthScore ?? 0;
        const grade = summary.healthGrade ?? (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
        const commentBody2 = buildComment(
          {
            score,
            grade,
            fileCount: summary.fileCount ?? 0,
            functionCount: summary.functionCount ?? 0,
            issueCount: summary.issueCount ?? 0,
            criticalIssueCount: summary.criticalIssueCount ?? 0,
            circularDepCount: summary.circularDepCount ?? 0,
            securityIssueCount: summary.securityIssueCount ?? 0,
            layers: summary.layers ?? [],
          },
          `${owner}/${repo}`,
          'Analysis requested by @grasp-bot',
          GRASP_UI_URL
        );
        await upsertComment(owner, repo, issueNumber, token, commentBody2);
        log(`  ✓ @grasp-bot analysis posted on issue/PR #${issueNumber} (score ${score}/100, grade ${grade})`);
      } catch (err) {
        log(`  ✗ Error handling @grasp-bot comment: ${(err as Error).message}`);
      }
    })();
    return;
  }

  if (event !== 'pull_request') return;

  let payload: PullRequestPayload;
  try { payload = JSON.parse(body.toString()) as PullRequestPayload; } catch { return; }

  // Only act on opened/synchronize/reopened
  if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) return;

  handlePR(payload).catch(err => log(`  ✗ Error handling PR: ${err.message}`));
});

// ── Startup ───────────────────────────────────────────────────────────────────

if (!APP_ID || !WEBHOOK_SECRET) {
  process.stderr.write('[grasp-app] ERROR: GITHUB_APP_ID and GITHUB_WEBHOOK_SECRET must be set\n');
  process.exit(1);
}

server.listen(PORT, () => {
  log(`Webhook server listening on port ${PORT}`);
  log(`  POST /webhook  — GitHub webhook endpoint`);
  log(`  GET  /health   — health check`);
});

export { handlePR, server };
