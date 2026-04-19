export interface GraspResult {
  repo: string;
  grade: string;
  score: number;
  issues?: string[];
}

export function formatMrComment(result: GraspResult): string {
  const emoji = result.grade === 'A' ? '✅' : ['B', 'C'].includes(result.grade) ? '⚠️' : '❌';
  const issueLines =
    result.issues && result.issues.length > 0
      ? '\n\n**Issues:**\n' + result.issues.map((i) => `- ${i}`).join('\n')
      : '';
  return [
    `## ${emoji} Grasp Health Report`,
    '',
    `**Repo:** \`${result.repo}\``,
    `Grade: **${result.grade}** · Score: ${result.score}/100`,
    issueLines,
  ]
    .join('\n')
    .trim();
}
