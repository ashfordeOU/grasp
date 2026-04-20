export interface GitLabSource {
  host: string;
  namespace: string;
  project: string;
  token?: string;
  maxPages?: number;
}

export function isGitLabSource(input: string): boolean {
  // Test only the hostname portion, not path components, to avoid
  // false-positives on GitHub repos named "gitlab.something"
  const m = input.match(/(?:https?:\/\/)?([^/?#]+)/);
  return m ? /gitlab\./i.test(m[1]) : /gitlab\./i.test(input);
}

export function normalizeGitLabUrl(input: string): GitLabSource | null {
  // Supports: gitlab.com/a/b, internal.gitlab.company.com/a/b/c, https://...
  const m = input.match(
    /(?:https?:\/\/)?([^/]*gitlab[^/]*)\/([^/]+\/(?:[^/]+\/)*[^/]+?)(?:\.git)?$/i
  );
  if (!m) return null;
  const parts = m[2].split('/');
  const project = parts.pop()!;
  const namespace = parts.join('/');
  if (!namespace) return null;  // guard against empty namespace
  return { host: m[1], namespace, project };
}

export function gitLabHeaders(token?: string): Record<string, string> {
  if (!token) return {};
  // Support both legacy PRIVATE-TOKEN and modern Bearer format
  if (token.startsWith('glpat-') || token.startsWith('gloas-')) {
    return { 'PRIVATE-TOKEN': token };
  }
  return { 'Authorization': `Bearer ${token}` };
}

export async function fetchGitLabTree(
  src: GitLabSource
): Promise<Array<{ path: string; content: string }>> {
  const base = `https://${src.host}/api/v4`;
  const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
  const headers = gitLabHeaders(src.token);
  const maxPages = src.maxPages ?? 5;
  let tree: Array<{ id: string; name: string; path: string; type: string }> = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `${base}/projects/${encodedPath}/repository/tree?recursive=true&per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitLab API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
    }
    const batch = await res.json() as Array<{ id: string; name: string; path: string; type: string }>;
    tree = tree.concat(batch);
    if (batch.length < 100) break;
  }
  const CODE_EXT = /\.(ts|js|tsx|jsx|py|go|rs|java|rb|php|cs|lua|kt|swift|cpp|c|h)$/;
  const files = tree.filter(f => f.type === 'blob' && CODE_EXT.test(f.name));
  const CONCURRENCY = 20;
  const filesToFetch = files.slice(0, 500);
  const results: Array<{ path: string; content: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < filesToFetch.length) {
      const i = cursor++;
      const file = filesToFetch[i];
      try {
        const r = await fetch(
          `${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(file.path)}/raw?ref=HEAD`,
          { headers }
        );
        if (r.ok) results.push({ path: file.path, content: await r.text() });
      } catch { /* skip */ }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

export async function fetchGitLabChurn(
  src: GitLabSource,
  filePath: string,
  limit = 10
): Promise<number> {
  try {
    const base = `https://${src.host}/api/v4`;
    const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
    const headers = gitLabHeaders(src.token);
    const res = await fetch(
      `${base}/projects/${encodedPath}/repository/commits?path=${encodeURIComponent(filePath)}&per_page=${limit}`,
      { headers }
    );
    if (!res.ok) return 0;
    const commits = await res.json() as unknown[];
    return commits.length;
  } catch {
    return 0;
  }
}

export interface GitLabOwner { email: string; name: string; lineCount: number }

export async function fetchGitLabOwnership(
  src: GitLabSource,
  filePath: string
): Promise<GitLabOwner[]> {
  try {
    const base = `https://${src.host}/api/v4`;
    const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
    const headers = gitLabHeaders(src.token);
    const res = await fetch(
      `${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(filePath)}/blame?ref=HEAD`,
      { headers }
    );
    if (!res.ok) return [];
    const blame = await res.json() as Array<{
      commit: { author_email: string; author_name: string }
    }>;
    const counts: Record<string, GitLabOwner> = {};
    for (const entry of blame) {
      const key = entry.commit.author_email;
      if (!counts[key]) {
        counts[key] = { email: key, name: entry.commit.author_name, lineCount: 0 };
      }
      counts[key].lineCount++;
    }
    return Object.values(counts).sort((a, b) => b.lineCount - a.lineCount);
  } catch {
    return [];
  }
}

export type GitLabCiStatus = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'unknown'

export async function fetchGitLabCiStatus(
  src: GitLabSource,
  ref = 'HEAD'
): Promise<GitLabCiStatus> {
  try {
    const base = `https://${src.host}/api/v4`;
    const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
    const headers = gitLabHeaders(src.token);
    const res = await fetch(
      `${base}/projects/${encodedPath}/pipelines?ref=${encodeURIComponent(ref)}&per_page=1`,
      { headers }
    );
    if (!res.ok) return 'unknown';
    const pipelines = await res.json() as Array<{ status: string }>;
    if (!pipelines.length) return 'unknown';
    const s = pipelines[0].status;
    if (['success','failed','running','pending','canceled'].includes(s)) {
      return s as GitLabCiStatus;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface GitLabIssue { id: number; iid: number; title: string; state: string; web_url: string }

export async function fetchGitLabIssues(
  src: GitLabSource,
  limit = 100
): Promise<GitLabIssue[]> {
  try {
    const base = `https://${src.host}/api/v4`;
    const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
    const headers = gitLabHeaders(src.token);
    const res = await fetch(
      `${base}/projects/${encodedPath}/issues?state=opened&per_page=${limit}`,
      { headers }
    );
    if (!res.ok) return [];
    return await res.json() as GitLabIssue[];
  } catch {
    return [];
  }
}
