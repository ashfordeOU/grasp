import { http, HttpResponse } from 'msw';

export const linearHandlers = [
  http.post('https://api.linear.app/graphql', () =>
    HttpResponse.json({
      data: {
        issueCreate: { success: true, issue: { id: 'issue-123', identifier: 'GRA-1', title: 'Test issue' } },
        teams: { nodes: [{ id: 'team-123', name: 'Engineering' }] },
      },
    })
  ),
];
