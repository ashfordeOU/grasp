/**
 * Formats and posts a Grasp health report as a GitHub PR comment.
 * Uses the same markdown format as the CLI --pr-comment flag.
 */

export interface HealthSummary {
  score: number;
  grade: string;
  fileCount: number;
  functionCount: number;
  issueCount: number;
  criticalIssueCount: number;
  circularDepCount: number;
  securityIssueCount: number;
  layers: string[];
}

const COMMENT_MARKER = '<!-- grasp-health-report -->';

export function buildComment(summary: HealthSummary, repoFullName: string, prTitle: string, graspUrl: string): string {
  const { score, grade } = summary;
  const gradeEmoji: Record<string, string> = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴' };
  const emoji = gradeEmoji[grade] ?? '⚪';
  const bar = '`' + '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10)) + '`';
  const critBadge = summary.criticalIssueCount > 0 ? ` ⚠️ ${summary.criticalIssueCount} critical` : '';
  const secBadge  = summary.securityIssueCount  > 0 ? ` 🔐 ${summary.securityIssueCount} security` : '';
  const layerStr  = summary.layers.length > 0 ? summary.layers.join(', ') : 'none';

  return [
    COMMENT_MARKER,
    `## 📊 Grasp Health Report — ${prTitle}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| **Health Score** | ${bar} **${score}/100** |`,
    `| **Grade** | ${emoji} **${grade}** |`,
    `| **Files** | ${summary.fileCount} (${summary.functionCount} functions) |`,
    `| **Architecture Issues** | ${summary.issueCount}${critBadge} |`,
    `| **Circular Deps** | ${summary.circularDepCount}${summary.circularDepCount === 0 ? ' ✓' : ''} |`,
    `| **Security** | ${summary.securityIssueCount}${secBadge || ' ✓'} |`,
    `| **Layers** | ${layerStr} |`,
    '',
    `[🔍 Explore in Grasp →](${graspUrl}?repo=${repoFullName})`,
    '',
    '<details><summary>ℹ️ What is Grasp?</summary>',
    '',
    '[Grasp](https://github.com/ashfordeOU/grasp) analyses codebase architecture: dead code, circular deps, layer violations, and security patterns.',
    '</details>',
  ].join('\n');
}

/**
 * Find the ID of an existing Grasp bot comment in a PR, if any.
 * Returns null if not found.
 */
export async function findExistingComment(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string,
): Promise<number | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (!res.ok) return null;
  const comments = await res.json() as Array<{ id: number; body: string }>;
  const existing = comments.find(c => c.body.includes(COMMENT_MARKER));
  return existing?.id ?? null;
}

/**
 * Create or update the Grasp PR comment.
 * Updates in place if a previous comment exists, otherwise creates a new one.
 */
export async function upsertComment(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string,
  body: string,
): Promise<void> {
  const existingId = await findExistingComment(owner, repo, pullNumber, token);
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;
  const url = existingId ? `${baseUrl}/comments/${existingId}` : `${baseUrl}/${pullNumber}/comments`;
  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to ${existingId ? 'update' : 'create'} PR comment (${res.status}): ${text}`);
  }
}
