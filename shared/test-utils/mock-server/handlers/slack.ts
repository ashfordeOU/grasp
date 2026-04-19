import { http, HttpResponse } from 'msw';

export const slackHandlers = [
  http.post('https://slack.com/api/chat.postMessage', () =>
    HttpResponse.json({ ok: true, ts: '1234567890.123456', channel: 'C123456' })
  ),
  http.post('https://slack.com/api/conversations.list', () =>
    HttpResponse.json({ ok: true, channels: [{ id: 'C123456', name: 'general' }] })
  ),
];
