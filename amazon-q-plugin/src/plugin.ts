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
    return {
      message: `Unknown command: ${input.command}. Try /grasp <owner/repo>`,
      type: 'error',
    };
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
  return {
    message: [
      `## Grasp Analysis for \`${repo}\``,
      '',
      'Run Grasp to get your architecture health report:',
      '```bash',
      `npx grasp-mcp-server analyze ${repo}`,
      '```',
      '',
      `[View interactive report](https://ashfordeOU.github.io/grasp?repo=${encodeURIComponent(repo)})`,
    ].join('\n'),
    type: 'code',
  };
}
