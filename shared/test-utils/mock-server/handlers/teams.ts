import { http, HttpResponse } from 'msw';

export const teamsHandlers = [
  http.post('https://smba.trafficmanager.net/*', () =>
    HttpResponse.json({ id: 'msg-123', serviceUrl: 'https://smba.trafficmanager.net/amer/' })
  ),
];
