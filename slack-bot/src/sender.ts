/**
 * Webhook sender for Slack and Teams.
 * Uses native fetch (Node 18+) — no extra dependencies needed.
 */

export interface SendResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Post a JSON payload to a webhook URL (Slack or Teams).
 * Both platforms accept application/json POST to a webhook URL.
 */
export async function sendWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/**
 * Configuration for the Grasp notification bot.
 */
export interface BotConfig {
  /** Slack Incoming Webhook URL (optional) */
  slackWebhookUrl?: string;
  /** Teams Incoming Webhook URL (optional) */
  teamsWebhookUrl?: string;
  /** Repos to watch: array of "owner/repo" strings */
  repos: string[];
  /** Cron schedule for weekly digest (default: Mondays at 9am UTC) */
  digestCron?: string;
  /** Alert thresholds */
  thresholds?: {
    criticalScore?: number;
    warnScore?: number;
  };
}

export function loadConfigFromEnv(): BotConfig {
  return {
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
    repos: (process.env.GRASP_REPOS ?? '').split(',').map(r => r.trim()).filter(Boolean),
    digestCron: process.env.DIGEST_CRON ?? '0 9 * * 1',
    thresholds: {
      criticalScore: process.env.THRESHOLD_CRITICAL ? parseInt(process.env.THRESHOLD_CRITICAL, 10) : 40,
      warnScore: process.env.THRESHOLD_WARN ? parseInt(process.env.THRESHOLD_WARN, 10) : 60,
    },
  };
}
