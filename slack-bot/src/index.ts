/**
 * Grasp Slack/Teams Bot entry point.
 *
 * Environment variables:
 *   SLACK_WEBHOOK_URL   — Slack Incoming Webhook URL
 *   TEAMS_WEBHOOK_URL   — Teams Incoming Webhook URL
 *   GRASP_REPOS         — comma-separated list of "owner/repo" to watch
 *   DIGEST_CRON         — cron schedule for weekly digest (default: "0 9 * * 1")
 *   THRESHOLD_CRITICAL  — score below this → critical alert (default: 40)
 *   THRESHOLD_WARN      — score below this → warning (default: 60)
 *   GRASP_API_URL       — Grasp SaaS API base URL (default: http://localhost:3001)
 *   GITHUB_TOKEN        — GitHub PAT for analysis
 */

import 'dotenv/config';
import { GraspBot } from './scheduler.js';
import { loadConfigFromEnv } from './sender.js';
import type { HealthSnapshot } from './formatter.js';

const GRASP_API_URL = process.env.GRASP_API_URL ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Call the Grasp SaaS API to analyze a repo and return a HealthSnapshot.
 */
async function analyzeRepo(repo: string): Promise<HealthSnapshot | null> {
  // Submit the analysis
  const submitRes = await fetch(`${GRASP_API_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, token: process.env.GITHUB_TOKEN }),
  });

  if (!submitRes.ok) {
    console.warn(`[grasp-bot] Submit failed for ${repo}: ${submitRes.status}`);
    return null;
  }

  const job = await submitRes.json() as { id: string; state: string; result?: unknown };

  if (job.state === 'done' && job.result) {
    return extractSnapshot(repo, job.result);
  }

  // Poll until done or timeout
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${GRASP_API_URL}/api/result/${job.id}`);
    if (!pollRes.ok) continue;

    const polled = await pollRes.json() as { state: string; result?: unknown; error?: string };
    if (polled.state === 'done' && polled.result) {
      return extractSnapshot(repo, polled.result);
    }
    if (polled.state === 'error') {
      console.warn(`[grasp-bot] Analysis failed for ${repo}: ${polled.error}`);
      return null;
    }
  }

  console.warn(`[grasp-bot] Analysis timed out for ${repo}`);
  return null;
}

function extractSnapshot(repo: string, result: unknown): HealthSnapshot {
  const r = result as Record<string, unknown>;
  const summary = (r.summary as Record<string, unknown>) ?? {};
  return {
    repo,
    healthScore: (summary.healthScore as number) ?? 0,
    healthGrade: (summary.healthGrade as string) ?? '?',
    fileCount: (summary.fileCount as number) ?? 0,
    issueCount: (summary.issueCount as number) ?? 0,
    circularCount: (summary.circularDepCount as number) ?? 0,
    securityCount: (summary.securityIssueCount as number) ?? 0,
    analyzedAt: (r.analyzedAt as string) ?? new Date().toISOString(),
  };
}

// ── Start ────────────────────────────────────────────────────────────────────

const config = loadConfigFromEnv();

if (!config.slackWebhookUrl && !config.teamsWebhookUrl) {
  console.error('[grasp-bot] No SLACK_WEBHOOK_URL or TEAMS_WEBHOOK_URL configured. Exiting.');
  process.exit(1);
}

if (config.repos.length === 0) {
  console.error('[grasp-bot] No GRASP_REPOS configured. Exiting.');
  process.exit(1);
}

const bot = new GraspBot(config, analyzeRepo);
bot.start();
