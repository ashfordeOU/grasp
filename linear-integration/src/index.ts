export interface Violation {
  file: string;
  violation: string;
  grade: string;
}

export interface LinearIssueInput {
  title: string;
  description: string;
  teamId?: string;
}

export type CreateIssueFn = (input: LinearIssueInput) => Promise<{ issue: { id: string; identifier: string } }>;

export function formatIssueTitle(v: Violation): string {
  const violationLabels: Record<string, string> = {
    'circular-dep': 'Circular dependency',
    'security-issue': 'Security issue',
    'arch-violation': 'Architecture violation',
    'dead-code': 'Dead code detected',
  };
  const label = violationLabels[v.violation] ?? v.violation;
  return `[Grasp] ${label} in ${v.file} (Grade: ${v.grade})`;
}

export function formatIssueDescription(v: Violation): string {
  return [
    `## Grasp Architecture Issue`,
    '',
    `**File:** \`${v.file}\``,
    `**Type:** ${v.violation}`,
    `**Health Grade: ${v.grade}**`,
    '',
    'This issue was automatically created by Grasp architecture analysis.',
    'Run `grasp analyze` to see the full report.',
  ].join('\n');
}

export async function createLinearIssue(
  violation: Violation,
  createFn: CreateIssueFn
): Promise<{ issue: { id: string; identifier: string } }> {
  return createFn({
    title: formatIssueTitle(violation),
    description: formatIssueDescription(violation),
  });
}

// Production version using Linear SDK
// (Only called when LINEAR_API_KEY env var is set)
export async function createLinearIssueFromEnv(violation: Violation): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY environment variable not set');
  }
  // Dynamic import to avoid requiring @linear/sdk at test time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { LinearClient } = await import('@linear/sdk' as any);
  const client = new LinearClient({ apiKey });
  const teams = await client.teams();
  const team = teams.nodes[0];
  if (!team) throw new Error('No Linear teams found');
  await client.createIssue({
    teamId: team.id,
    title: formatIssueTitle(violation),
    description: formatIssueDescription(violation),
  });
}
