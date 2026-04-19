import { http, HttpResponse } from 'msw';

export const gitlabHandlers = [
  http.get('https://gitlab.com/api/v4/projects/:id', ({ params }) =>
    HttpResponse.json({
      id: params.id,
      path_with_namespace: 'test/project',
      default_branch: 'main',
    })
  ),
  http.get('https://gitlab.com/api/v4/projects/:id/repository/tree', () =>
    HttpResponse.json([{ id: 'abc', name: 'index.ts', path: 'src/index.ts', type: 'blob' }])
  ),
];
