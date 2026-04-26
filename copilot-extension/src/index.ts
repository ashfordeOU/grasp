import { fetchGraspResult } from '../../shared/grasp-cli';

export interface CopilotMessage {
  content: string;
}

export interface CopilotResponse {
  content: string;
}

export async function handleCopilotMessage(msg: CopilotMessage): Promise<CopilotResponse> {
  const content = msg.content.trim();
  const analyzeMatch = content.match(/@grasp\s+(?:analyze\s+)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);

  if (analyzeMatch) {
    const repo = analyzeMatch[1];
    try {
      const r = await fetchGraspResult(repo);
      const emoji = r.grade === 'A' ? '✅' : r.grade <= 'C' ? '⚠️' : '❌';
      const issueLines = r.issues.length > 0
        ? '\n\n**Top issues:**\n' + r.issues.map(i => `- ${i}`).join('\n')
        : '\n\n_No issues found._';
      return {
        content: [
          `## ${emoji} Grasp Health Report for \`${repo}\``,
          '',
          `**Grade:** ${r.grade} · **Score:** ${r.score}/100 · **Files:** ${r.fileCount}`,
          issueLines,
          '',
          `[View interactive report](https://ashfordeou.github.io/grasp?repo=${encodeURIComponent(repo)})`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        content: `❌ Grasp analysis failed for \`${repo}\`: ${String(err)}\n\nMake sure \`grasp-mcp-server\` is installed: \`npm install -g grasp-mcp-server\``,
      };
    }
  }

  if (content.includes('@grasp')) {
    return {
      content: [
        '**Grasp** — Code Architecture Visualizer',
        '',
        'Usage: `@grasp analyze owner/repo`',
        '',
        'Commands:',
        '- `@grasp analyze owner/repo` — Run architecture analysis (grade, score, issues)',
        '- `@grasp help` — Show this help',
      ].join('\n'),
    };
  }

  return { content: 'Usage: `@grasp analyze owner/repo`' };
}
