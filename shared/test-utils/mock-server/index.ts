import { setupServer } from 'msw/node';
import { githubHandlers } from './handlers/github';
import { gitlabHandlers } from './handlers/gitlab';
import { slackHandlers } from './handlers/slack';
import { teamsHandlers } from './handlers/teams';
import { discordHandlers } from './handlers/discord';
import { jiraHandlers } from './handlers/jira';
import { linearHandlers } from './handlers/linear';
import { bitbucketHandlers } from './handlers/bitbucket';
import { azureHandlers } from './handlers/azure';

export function setupMockServer() {
  return setupServer(
    ...githubHandlers,
    ...gitlabHandlers,
    ...slackHandlers,
    ...teamsHandlers,
    ...discordHandlers,
    ...jiraHandlers,
    ...linearHandlers,
    ...bitbucketHandlers,
    ...azureHandlers,
  );
}
