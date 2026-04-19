import { buildHealthEmbed } from './embeds';
import { buildDigest } from '../../shared/digest-engine/index';

export { buildHealthEmbed, buildDigest };

export function parseAnalyzeCommand(content: string): string | null {
  const match = content.match(/^\/grasp\s+analyze\s+([^\s]+)/i);
  return match ? match[1] : null;
}

export async function handleSlashCommand(interaction: {
  commandName: string;
  options: { getString: (name: string) => string | null };
}): Promise<{ embeds: ReturnType<typeof buildHealthEmbed>[] }> {
  if (interaction.commandName !== 'grasp') {
    return { embeds: [] };
  }
  const repo = interaction.options.getString('repo') ?? 'unknown/repo';
  const embed = buildHealthEmbed({ repo, grade: 'B', score: 78 });
  return { embeds: [embed] };
}
