export interface CopilotMessage {
  content: string;
}

export interface CopilotResponse {
  content: string;
}

export async function handleCopilotMessage(
  msg: CopilotMessage
): Promise<CopilotResponse> {
  const content = msg.content.trim();

  // Match: @grasp analyze owner/repo or @grasp owner/repo
  const analyzeMatch = content.match(/@grasp\s+(?:analyze\s+)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
  if (analyzeMatch) {
    const repo = analyzeMatch[1];
    return {
      content: [
        `## Grasp Health Report for \`${repo}\``,
        '',
        'Run the Grasp analysis using the MCP server:',
        '```',
        `npx grasp-mcp-server analyze ${repo}`,
        '```',
        '',
        'Or view the interactive report at: https://ashfordeOU.github.io/grasp',
      ].join('\n'),
    };
  }

  // Help message
  if (content.includes('@grasp')) {
    return {
      content: [
        '**Grasp** — Code Architecture Visualizer',
        '',
        'Usage: `@grasp analyze owner/repo`',
        '',
        'Commands:',
        '- `@grasp analyze owner/repo` — Run architecture analysis',
        '- `@grasp help` — Show this help',
      ].join('\n'),
    };
  }

  return { content: 'Usage: `@grasp analyze owner/repo`' };
}
