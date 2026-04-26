import { buildHealthCard } from './cards';
import { buildDigest } from '../../shared/digest-engine/index';
import { fetchGraspResult } from '../../shared/grasp-cli';

export { buildHealthCard, buildDigest };

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
