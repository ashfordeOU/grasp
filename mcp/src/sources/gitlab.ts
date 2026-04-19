export interface GitLabSource { host: string; namespace: string; project: string; token?: string }

export function isGitLabSource(input: string): boolean {
  return /gitlab\./i.test(input);
}

export function normalizeGitLabUrl(input: string): GitLabSource | null {
  const m = input.match(/(?:https?:\/\/)?([^/]*gitlab[^/]*)\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!m) return null;
  return { host: m[1], namespace: m[2], project: m[3] };
}

export async function fetchGitLabTree(src: GitLabSource): Promise<Array<{ path: string; content: string }>> {
  const base = `https://${src.host}/api/v4`;
  const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
  const headers: Record<string, string> = src.token ? { 'PRIVATE-TOKEN': src.token } : {};
  let tree: Array<{ id: string; name: string; path: string; type: string }> = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetch(`${base}/projects/${encodedPath}/repository/tree?recursive=true&per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitLab API error: ${res.status}`);
    const batch = await res.json() as Array<{ id: string; name: string; path: string; type: string }>;
    tree = tree.concat(batch);
    if (batch.length < 100) break; // no more pages
  }
  const files = tree.filter(f => f.type === 'blob' && /\.(ts|js|py|go|rs|java|rb|php|cs|lua)$/.test(f.name));
  const results: Array<{ path: string; content: string }> = [];
  for (const file of files.slice(0, 200)) {
    try {
      const r = await fetch(`${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(file.path)}/raw?ref=HEAD`, { headers });
      if (r.ok) results.push({ path: file.path, content: await r.text() });
    } catch { /* skip */ }
  }
  return results;
}
