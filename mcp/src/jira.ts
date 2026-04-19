export interface JiraIssue { key: string; summary: string; description: string; status: string }
export type IssueFileMap = Record<string, JiraIssue[]>;

export function parseJiraIssues(issues: JiraIssue[], files: string[]): IssueFileMap {
  const map: IssueFileMap = {};
  for (const issue of issues) {
    const text = `${issue.summary} ${issue.description}`.toLowerCase();
    for (const file of files) {
      const base = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
      if (base && text.includes(base.toLowerCase())) {
        (map[file] ??= []).push(issue);
      }
    }
  }
  return map;
}

export async function fetchJiraIssues(baseUrl: string, email: string, token: string, projectKey: string): Promise<JiraIssue[]> {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await fetch(
    `${baseUrl}/rest/api/3/search?jql=project=${projectKey}+ORDER+BY+updated+DESC&maxResults=100&fields=summary,description,status`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Jira API error: ${res.status}`);
  const data = await res.json() as { issues: Array<{ key: string; fields: any }> };
  return data.issues.map(i => ({
    key: i.key,
    summary: i.fields.summary ?? '',
    description: i.fields.description?.content?.[0]?.content?.[0]?.text ?? '',
    status: i.fields.status?.name ?? 'Unknown',
  }));
}
