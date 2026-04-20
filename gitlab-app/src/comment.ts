const COMMENT_MARKER = '<!-- grasp-health-report -->';

export interface HealthSummary {
  score: number; grade: string; fileCount: number; functionCount: number;
  issueCount: number; criticalIssueCount: number;
  circularDepCount: number; securityIssueCount: number; layers: string[];
}

export function buildMrComment(
  summary: HealthSummary,
  projectPath: string,
  mrTitle: string
): string {
  const { score, grade } = summary;
  const emoji: Record<string, string> = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴' };
  const bar = '`' + '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10)) + '`';
  return [
    COMMENT_MARKER,
    `## 📊 Grasp Health Report — ${mrTitle}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| **Health Score** | ${bar} **${score}/100** |`,
    `| **Grade** | ${emoji[grade] ?? '⚪'} **${grade}** |`,
    `| **Files** | ${summary.fileCount} (${summary.functionCount} functions) |`,
    `| **Architecture Issues** | ${summary.issueCount}${summary.criticalIssueCount > 0 ? ` ⚠️ ${summary.criticalIssueCount} critical` : ''} |`,
    `| **Circular Deps** | ${summary.circularDepCount}${summary.circularDepCount === 0 ? ' ✓' : ''} |`,
    `| **Security** | ${summary.securityIssueCount}${summary.securityIssueCount === 0 ? ' ✓' : ` 🔐 ${summary.securityIssueCount}`} |`,
    `| **Layers** | ${summary.layers.join(', ') || 'none'} |`,
  ].join('\n');
}

export async function postMrComment(
  gitlabHost: string,
  token: string,
  projectPath: string,
  mrIid: number,
  body: string
): Promise<void> {
  const headers = buildHeaders(token);
  const encodedPath = encodeURIComponent(projectPath);
  await fetch(
    `https://${gitlabHost}/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/notes`,
    { method: 'POST', headers, body: JSON.stringify({ body }) }
  );
}

export async function postCommitStatus(
  gitlabHost: string,
  token: string,
  projectPath: string,
  sha: string,
  state: 'pending' | 'running' | 'success' | 'failed',
  score: number
): Promise<void> {
  const headers = buildHeaders(token);
  const encodedPath = encodeURIComponent(projectPath);
  await fetch(
    `https://${gitlabHost}/api/v4/projects/${encodedPath}/statuses/${sha}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state,
        name: 'grasp/health',
        description: `Health score: ${score}/100`,
        target_url: `https://ashfordeOU.github.io/grasp?repo=${encodeURIComponent(projectPath)}`,
      })
    }
  );
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token.startsWith('glpat-') || token.startsWith('gloas-')) {
    headers['PRIVATE-TOKEN'] = token;
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
