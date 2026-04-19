import { buildHealthCard } from './cards';
import { buildDigest } from '../../shared/digest-engine/index';

export { buildHealthCard, buildDigest };

// Bot entry point — registers the command handler
// Full bot registration requires Azure Bot Service + Teams app manifest
// See README.md for setup instructions
export function createBotHandler(token: string) {
  return {
    token,
    handleMessage: async (text: string, repoContext?: string) => {
      const repo = repoContext ?? text.trim().replace(/^analyze\s+/i, '');
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: buildHealthCard({ repo, grade: 'B', score: 78, issues: [] }),
          },
        ],
      };
    },
  };
}
