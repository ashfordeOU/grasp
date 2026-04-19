import { http, HttpResponse } from 'msw';

export const jiraHandlers = [
  http.post('https://your-domain.atlassian.net/rest/api/3/issue', () =>
    HttpResponse.json({ id: '10001', key: 'PROJ-1', self: 'https://your-domain.atlassian.net/rest/api/3/issue/10001' })
  ),
  http.get('https://your-domain.atlassian.net/rest/api/3/project', () =>
    HttpResponse.json([{ id: '10000', key: 'PROJ', name: 'Test Project' }])
  ),
];
