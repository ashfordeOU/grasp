export interface RepoResult {
  repo: string;
  grade: string;
  score: number;
  delta: number;
}

export interface DigestResult {
  repos: RepoResult[];
  summary: string;
  alerts: RepoResult[];
  timestamp: string;
}

export function buildDigest(repos: RepoResult[]): DigestResult {
  const alerts = repos.filter((r) => ['D', 'F'].includes(r.grade));
  return {
    repos,
    summary: `${repos.length} repo${repos.length === 1 ? '' : 's'} analysed · ${alerts.length} need${alerts.length === 1 ? 's' : ''} attention`,
    alerts,
    timestamp: new Date().toISOString(),
  };
}

export function formatScoreDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '±0';
}
