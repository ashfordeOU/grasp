import type { HealthSummary } from './comment.js';

const MCP_DIST = process.env.MCP_DIST_PATH ?? '../mcp/dist';

export async function analyzeGitLabRepo(
  projectPath: string,
  gitlabHost: string,
  token: string
): Promise<HealthSummary> {
  const { analyzeSource } = await import(`${MCP_DIST}/analyzer.js`);
  const parts = projectPath.split('/');
  const project = parts.pop() ?? '';
  const namespace = parts.join('/');
  const result = await analyzeSource(
    {
      type: 'gitlab' as const,
      host: gitlabHost,
      namespace,
      project,
      token,
    },
    () => {}
  );
  const s = result.summary;
  return {
    score: s.healthScore,
    grade: s.healthGrade,
    fileCount: s.fileCount,
    functionCount: s.functionCount,
    issueCount: s.issueCount,
    criticalIssueCount: s.criticalIssueCount ?? 0,
    circularDepCount: s.circularDepCount,
    securityIssueCount: s.securityIssueCount,
    layers: s.layers ?? [],
  };
}
