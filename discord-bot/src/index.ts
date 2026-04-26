import { buildHealthEmbed } from './embeds';
import { buildDigest } from '../../shared/digest-engine/index';
import { execFile } from 'child_process';
import { promisify } from 'util';

export { buildHealthEmbed, buildDigest };
const execFileAsync = promisify(execFile);

export function parseAnalyzeCommand(content: string): string | null {
  const match = content.match(/^\/grasp\s+analyze\s+([^\s]+)/i);
  return match ? match[1] : null;
}

async function fetchGraspResult(repo: string): Promise<{ grade: string; score: number; issues: string[] }> {
  const { stdout } = await execFileAsync(
    'npx',
    ['grasp-mcp-server', 'analyze', repo, '--format', 'json'],
    { timeout: 120_000 },
  );
  const r = JSON.parse(stdout) as {
    summary?: { healthGrade?: string; healthScore?: number };
    issues?: Array<{ description?: string }>;
  };
  return {
    grade: r.summary?.healthGrade ?? 'F',
    score: r.summary?.healthScore ?? 0,
    issues: r.issues?.slice(0, 5).map(i => i.description ?? '').filter(Boolean) ?? [],
  };
}

export async function handleSlashCommand(interaction: {
  commandName: string;
  options: { getString: (name: string) => string | null };
}): Promise<{ embeds: ReturnType<typeof buildHealthEmbed>[] }> {
  if (interaction.commandName !== 'grasp') return { embeds: [] };
  const repo = interaction.options.getString('repo') ?? 'unknown/repo';
  const result = await fetchGraspResult(repo).catch(() => ({ grade: 'F', score: 0, issues: ['Analysis failed'] }));
  const embed = buildHealthEmbed({ repo, grade: result.grade, score: result.score });
  return { embeds: [embed] };
}
