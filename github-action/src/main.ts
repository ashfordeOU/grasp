import * as core from '@actions/core';
import * as github from '@actions/github';

export function gradeAboveThreshold(grade: string, threshold: string): boolean {
  const order = ['A', 'B', 'C', 'D', 'F'];
  const gradeIdx = order.indexOf(grade);
  const thresholdIdx = order.indexOf(threshold);
  if (gradeIdx === -1 || thresholdIdx === -1) return true;
  return gradeIdx <= thresholdIdx;
}

export function formatComment(result: {
  grade: string;
  score: number;
  repo: string;
  issues: string[];
}): string {
  const emoji = result.grade === 'A' ? '✅' : result.grade <= 'C' ? '⚠️' : '❌';
  const issueLines =
    result.issues.length > 0
      ? '### Issues\n' + result.issues.map((i) => `- ${i}`).join('\n')
      : '_No issues found._';
  return [
    `## ${emoji} Grasp Health Report`,
    '',
    `**Repo:** \`${result.repo}\``,
    `Grade: **${result.grade}** · Score: ${result.score}/100`,
    '',
    issueLines,
  ].join('\n');
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', { required: true });
    const threshold = core.getInput('threshold') || 'D';
    const postComment = core.getInput('post-comment') !== 'false';

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // Run grasp CLI (use execFileSync to avoid shell injection)
    const { execFileSync } = await import('child_process');
    const outputStr = execFileSync(
      'npx',
      ['grasp-mcp-server', 'analyze', `${owner}/${repo}`, '--format', 'json'],
      { encoding: 'utf8' }
    );
    const result = JSON.parse(outputStr) as {
      grade: string;
      score: number;
      issues?: string[];
    };

    core.setOutput('health-grade', result.grade);
    core.setOutput('health-score', String(result.score));

    if (postComment && github.context.payload.pull_request) {
      const body = formatComment({
        grade: result.grade,
        score: result.score,
        repo: `${owner}/${repo}`,
        issues: result.issues ?? [],
      });
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: github.context.payload.pull_request.number as number,
        body,
      });
    }

    if (!gradeAboveThreshold(result.grade, threshold)) {
      core.setFailed(
        `Health grade ${result.grade} is below the required threshold ${threshold}`
      );
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Only execute when run directly by the Actions runner, not during tests
if (require.main === module) {
  run();
}
