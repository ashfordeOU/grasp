import { http, HttpResponse } from 'msw';

export const discordHandlers = [
  http.post('https://discord.com/api/v10/channels/:channelId/messages', () =>
    HttpResponse.json({ id: '1234567890', content: 'message sent' })
  ),
  http.post('https://discord.com/api/v10/applications/:appId/commands', () =>
    HttpResponse.json({ id: 'cmd-123', name: 'grasp' })
  ),
];
