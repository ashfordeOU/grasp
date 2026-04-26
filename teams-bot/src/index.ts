import { buildHealthCard } from './cards';
import { buildDigest } from '../../shared/digest-engine/index';
import { execFile } from 'child_process';
import { promisify } from 'util';

export { buildHealthCard, buildDigest };
const execFileAsync = promisify(execFile);

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

export function createBotHandler(token: string) {
  return {
    token,
    handleMessage: async (text: string, repoContext?: string) => {
      const repo = repoContext ?? text.trim().replace(/^analyze\s+/i, '');
      const result = await fetchGraspResult(repo).catch(() => ({ grade: 'F', score: 0, issues: ['Analysis failed'] }));
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: buildHealthCard({ repo, grade: result.grade, score: result.score, issues: result.issues }),
          },
        ],
      };
    },
  };
}
