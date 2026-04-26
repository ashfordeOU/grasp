import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface QInput {
  command: string;
  args?: string;
}

export interface QResponse {
  message: string;
  type?: 'text' | 'code' | 'error';
}

async function fetchGraspResult(repo: string): Promise<{
  grade: string;
  score: number;
  fileCount: number;
  issues: string[];
}> {
  const { stdout } = await execFileAsync(
    'npx',
    ['grasp-mcp-server', 'analyze', repo, '--format', 'json'],
    { timeout: 120_000 },
  );
  const r = JSON.parse(stdout) as {
    summary?: { healthGrade?: string; healthScore?: number; fileCount?: number };
    issues?: Array<{ description?: string }>;
  };
  return {
    grade: r.summary?.healthGrade ?? 'F',
    score: r.summary?.healthScore ?? 0,
    fileCount: r.summary?.fileCount ?? 0,
    issues: r.issues?.slice(0, 5).map(i => i.description ?? '').filter(Boolean) ?? [],
  };
}

export async function handleQCommand(input: QInput): Promise<QResponse> {
  if (input.command !== '/grasp') {
    return { message: `Unknown command: ${input.command}. Try /grasp <owner/repo>`, type: 'error' };
  }

  if (!input.args || !input.args.includes('/')) {
    return {
      message: [
        '**Grasp** — Code Architecture Visualizer',
        '',
        'Usage: `/grasp <owner/repo>`',
        '',
        'Example: `/grasp ashfordeOU/grasp`',
      ].join('\n'),
      type: 'text',
    };
  }

  const repo = input.args.trim();
  try {
    const r = await fetchGraspResult(repo);
    const emoji = r.grade === 'A' ? '✅' : r.grade <= 'C' ? '⚠️' : '❌';
    const issueLines = r.issues.length > 0
      ? '\n\n' + r.issues.map(i => `- ${i}`).join('\n')
      : '\n\n_No issues found._';
    return {
      message: [
        `## ${emoji} Grasp Health Report for \`${repo}\``,
        '',
        `**Grade:** ${r.grade} · **Score:** ${r.score}/100 · **Files:** ${r.fileCount}`,
        issueLines,
        '',
        `[View interactive report](https://ashfordeou.github.io/grasp?repo=${encodeURIComponent(repo)})`,
      ].join('\n'),
      type: 'text',
    };
  } catch (err) {
    return { message: `Analysis failed for \`${repo}\`: ${String(err)}`, type: 'error' };
  }
}
