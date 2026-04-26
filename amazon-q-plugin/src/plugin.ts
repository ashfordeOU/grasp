import { fetchGraspResult } from '../../shared/grasp-cli';

export interface QInput {
  command: string;
  args?: string;
}

export interface QResponse {
  message: string;
  type?: 'text' | 'code' | 'error';
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
