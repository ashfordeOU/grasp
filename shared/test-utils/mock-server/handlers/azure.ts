import { http, HttpResponse } from 'msw';

export const azureHandlers = [
  http.get('https://dev.azure.com/:org/:project/_apis/git/repositories/:repo/items', () =>
    HttpResponse.json({
      value: [
        { path: '/src/index.ts', gitObjectType: 'blob', objectId: 'abc123' },
        { path: '/src', gitObjectType: 'tree', objectId: 'def456' },
      ],
      count: 2,
    })
  ),
];
