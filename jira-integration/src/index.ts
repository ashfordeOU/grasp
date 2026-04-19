export interface Violation {
  file: string;
  violation: string;
  grade: string;
}

export interface JiraTicket {
  summary: string;
  description: string;
  projectKey: string;
  issueType?: string;
}

export type HttpPostFn = (url: string, body: unknown, headers: Record<string, string>) => Promise<{ key: string; id: string }>;

export function formatTicketSummary(v: Violation): string {
  const violationLabels: Record<string, string> = {
    'circular-dep': 'Circular dependency',
    'security-issue': 'Security issue',
    'arch-violation': 'Architecture violation',
  };
  const label = violationLabels[v.violation] ?? v.violation;
  return `[Grasp] ${label} in ${v.file} — Grade: ${v.grade}`;
}

export function buildAtlassianDocDescription(text: string): object {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export async function createJiraTicket(
  ticket: JiraTicket,
  httpPost: HttpPostFn
): Promise<{ key: string; id: string }> {
  const baseUrl = process.env.JIRA_BASE_URL ?? 'https://your-domain.atlassian.net';
  const email = process.env.JIRA_EMAIL ?? '';
  const token = process.env.JIRA_TOKEN ?? '';
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  const body = {
    fields: {
      project: { key: ticket.projectKey },
      summary: ticket.summary,
      description: buildAtlassianDocDescription(ticket.description),
      issuetype: { name: ticket.issueType ?? 'Bug' },
    },
  };

  return httpPost(
    `${baseUrl}/rest/api/3/issue`,
    body,
    {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    }
  );
}
