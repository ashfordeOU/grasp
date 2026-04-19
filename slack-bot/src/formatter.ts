/**
 * Message formatters for Slack and Microsoft Teams.
 * Both use webhook-based delivery with different payload shapes.
 *
 * Slack:  https://api.slack.com/messaging/webhooks (JSON with "blocks")
 * Teams:  Adaptive Cards via Incoming Webhook (JSON with "type": "AdaptiveCard")
 */

export interface HealthSnapshot {
  repo: string;
  healthScore: number;
  healthGrade: string;
  fileCount: number;
  issueCount: number;
  circularCount: number;
  securityCount: number;
  analyzedAt: string;
  reportUrl?: string;
}

export interface AlertThresholds {
  criticalScore: number;   // score below this → critical alert (default: 40)
  warnScore: number;       // score below this → warning (default: 60)
  newSecurityIssue: boolean; // alert on any new security issue (default: true)
  newCircularDep: boolean;   // alert on new circular dep (default: true)
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  criticalScore: 40,
  warnScore: 60,
  newSecurityIssue: true,
  newCircularDep: true,
};

type AlertLevel = 'ok' | 'warn' | 'critical';

function alertLevel(snapshot: HealthSnapshot, thresholds: AlertThresholds): AlertLevel {
  if (snapshot.healthScore < thresholds.criticalScore) return 'critical';
  if (snapshot.healthScore < thresholds.warnScore) return 'warn';
  return 'ok';
}

function gradeEmoji(grade: string): string {
  return { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '💀' }[grade] ?? '⬡';
}

function levelColor(level: AlertLevel): string {
  return { ok: '#22c55e', warn: '#f59e0b', critical: '#ef4444' }[level];
}

// ── Slack ────────────────────────────────────────────────────────────────────

/**
 * Build a Slack Block Kit payload for a health alert.
 */
export function buildSlackAlert(
  snapshot: HealthSnapshot,
  thresholds: Partial<AlertThresholds> = {},
): Record<string, unknown> {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const level = alertLevel(snapshot, t);
  const emoji = gradeEmoji(snapshot.healthGrade);
  const levelLabel = level === 'critical' ? '🚨 Critical' : level === 'warn' ? '⚠️  Warning' : '✅ Healthy';

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${levelLabel} — ${snapshot.repo}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Health Score*\n${emoji} ${snapshot.healthScore}/100 (${snapshot.healthGrade})` },
        { type: 'mrkdwn', text: `*Issues*\n${snapshot.issueCount} total` },
        { type: 'mrkdwn', text: `*Circular Deps*\n${snapshot.circularCount > 0 ? '🔄 ' : ''}${snapshot.circularCount}` },
        { type: 'mrkdwn', text: `*Security Issues*\n${snapshot.securityCount > 0 ? '🔐 ' : ''}${snapshot.securityCount}` },
        { type: 'mrkdwn', text: `*Files*\n${snapshot.fileCount}` },
        { type: 'mrkdwn', text: `*Analyzed*\n${new Date(snapshot.analyzedAt).toUTCString()}` },
      ],
    },
  ];

  if (snapshot.reportUrl) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '📊 View Report' },
        url: snapshot.reportUrl,
        style: level === 'critical' ? 'danger' : 'primary',
      }],
    });
  }

  return { attachments: [{ color: levelColor(level), blocks }] };
}

/**
 * Build a Slack Block Kit payload for a weekly digest (multiple repos).
 */
export function buildSlackDigest(
  snapshots: HealthSnapshot[],
  weekOf: string,
): Record<string, unknown> {
  const sorted = [...snapshots].sort((a, b) => a.healthScore - b.healthScore);
  const avg = Math.round(snapshots.reduce((s, r) => s + r.healthScore, 0) / snapshots.length);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];

  const rows = sorted.map(s =>
    `${gradeEmoji(s.healthGrade)} *${s.repo}*  ${s.healthScore}/100 (${s.healthGrade})  ` +
    `${s.issueCount} issues  ${s.securityCount > 0 ? `🔐${s.securityCount}` : ''}`
  ).join('\n');

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📋 Weekly Grasp Digest — ${weekOf}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Repos*\n${snapshots.length}` },
          { type: 'mrkdwn', text: `*Avg Score*\n${avg}/100` },
          { type: 'mrkdwn', text: `*Best*\n${gradeEmoji(best.healthGrade)} ${best.repo} (${best.healthScore})` },
          { type: 'mrkdwn', text: `*Needs Attention*\n${gradeEmoji(worst.healthGrade)} ${worst.repo} (${worst.healthScore})` },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: rows } },
    ],
  };
}

/**
 * Build a Slack Block Kit interactive digest with per-repo action buttons.
 */
export function buildSlackInteractiveDigest(snapshots: HealthSnapshot[]): Record<string, unknown> {
  const topRepos = [...snapshots].sort((a, b) => b.healthScore - a.healthScore).slice(0, 5);
  const worstRepos = [...snapshots].sort((a, b) => a.healthScore - b.healthScore).slice(0, 3);
  const avgScore = Math.round(snapshots.reduce((s, r) => s + r.healthScore, 0) / snapshots.length);

  const repoBlocks = topRepos.map(r => {
    const filled = Math.round(r.healthScore / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${r.repo}*\n\`${bar}\` ${r.healthScore} ${r.healthGrade}\n${r.issueCount} issues · ${r.circularCount} circular deps`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'View Report' },
        url: `https://grasp.ashforde.org?repo=${r.repo}`,
        action_id: `view_${r.repo}`,
      },
    };
  });

  const needsAttention = worstRepos
    .filter(r => r.healthScore < 70)
    .map(r => `• *${r.repo}*: ${r.healthScore} ${r.healthGrade} — needs attention`)
    .join('\n');

  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Grasp Weekly Digest' } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${snapshots.length} repos tracked · Avg score: ${avgScore}*` } },
      { type: 'divider' },
      ...repoBlocks,
      ...(needsAttention
        ? [
            { type: 'divider' },
            { type: 'section', text: { type: 'mrkdwn', text: `*⚠️ Needs Attention*\n${needsAttention}` } },
          ]
        : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Built by <https://grasp.ashforde.org|Grasp> · Built for engineers who actually ship.' }],
      },
    ],
  };
}

// ── Microsoft Teams ──────────────────────────────────────────────────────────

/**
 * Build a Teams Adaptive Card payload for a health alert.
 */
export function buildTeamsAlert(
  snapshot: HealthSnapshot,
  thresholds: Partial<AlertThresholds> = {},
): Record<string, unknown> {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const level = alertLevel(snapshot, t);
  const emoji = gradeEmoji(snapshot.healthGrade);
  const titleLabel = level === 'critical' ? '🚨 Critical' : level === 'warn' ? '⚠️ Warning' : '✅ Healthy';

  const facts = [
    { title: 'Health Score', value: `${emoji} ${snapshot.healthScore}/100 (${snapshot.healthGrade})` },
    { title: 'Issues', value: String(snapshot.issueCount) },
    { title: 'Circular Deps', value: String(snapshot.circularCount) },
    { title: 'Security Issues', value: String(snapshot.securityCount) },
    { title: 'Files', value: String(snapshot.fileCount) },
    { title: 'Analyzed', value: new Date(snapshot.analyzedAt).toUTCString() },
  ];

  const body: unknown[] = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `${titleLabel} — ${snapshot.repo}` },
    { type: 'FactSet', facts },
  ];

  if (snapshot.reportUrl) {
    body.push({
      type: 'ActionSet',
      actions: [{
        type: 'Action.OpenUrl',
        title: '📊 View Report',
        url: snapshot.reportUrl,
      }],
    });
  }

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body,
        msteams: { width: 'Full' },
      },
    }],
  };
}

/**
 * Build a Teams Adaptive Card payload for a weekly digest.
 */
export function buildTeamsDigest(
  snapshots: HealthSnapshot[],
  weekOf: string,
): Record<string, unknown> {
  const sorted = [...snapshots].sort((a, b) => a.healthScore - b.healthScore);
  const avg = Math.round(snapshots.reduce((s, r) => s + r.healthScore, 0) / snapshots.length);

  const rows = sorted.map(s => ({
    title: `${gradeEmoji(s.healthGrade)} ${s.repo}`,
    value: `${s.healthScore}/100 · ${s.issueCount} issues${s.securityCount > 0 ? ` · 🔐${s.securityCount}` : ''}`,
  }));

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `📋 Weekly Grasp Digest — ${weekOf}` },
          { type: 'TextBlock', text: `${snapshots.length} repos · avg score ${avg}/100` },
          { type: 'FactSet', facts: rows },
        ],
        msteams: { width: 'Full' },
      },
    }],
  };
}

// ── Threshold checking ───────────────────────────────────────────────────────

export interface AlertDecision {
  shouldAlert: boolean;
  reasons: string[];
  level: AlertLevel;
}

/**
 * Decide whether to send an alert for a given snapshot,
 * optionally comparing against a previous snapshot.
 */
export function shouldAlert(
  current: HealthSnapshot,
  previous: HealthSnapshot | null,
  thresholds: Partial<AlertThresholds> = {},
): AlertDecision {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons: string[] = [];
  const level = alertLevel(current, t);

  if (level !== 'ok') {
    reasons.push(`Health score ${current.healthScore}/100 (${current.healthGrade}) below threshold`);
  }

  if (previous) {
    if (t.newSecurityIssue && current.securityCount > previous.securityCount) {
      const diff = current.securityCount - previous.securityCount;
      reasons.push(`${diff} new security issue${diff !== 1 ? 's' : ''} detected`);
    }
    if (t.newCircularDep && current.circularCount > previous.circularCount) {
      const diff = current.circularCount - previous.circularCount;
      reasons.push(`${diff} new circular dependency${diff !== 1 ? 'ies' : ''} detected`);
    }
    // Score regression
    const scoreDrop = previous.healthScore - current.healthScore;
    if (scoreDrop >= 10) {
      reasons.push(`Health score dropped ${scoreDrop} points (${previous.healthScore} → ${current.healthScore})`);
    }
  }

  return { shouldAlert: reasons.length > 0, reasons, level };
}
