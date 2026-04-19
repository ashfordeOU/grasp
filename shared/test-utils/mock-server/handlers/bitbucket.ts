import { http, HttpResponse } from 'msw';

export const bitbucketHandlers = [
  http.get('https://api.bitbucket.org/2.0/repositories/:workspace/:repo', ({ params }) =>
    HttpResponse.json({
      full_name: `${params.workspace}/${params.repo}`,
      mainbranch: { name: 'main' },
    })
  ),
  http.get('https://api.bitbucket.org/2.0/repositories/:workspace/:repo/src', () =>
    HttpResponse.json({
      values: [{ path: 'src/index.ts', type: 'commit_file', size: 1024 }],
      pagelen: 100,
    })
  ),
];
