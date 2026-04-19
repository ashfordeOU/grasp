import { http, HttpResponse } from 'msw';

export const githubHandlers = [
  http.get('https://api.github.com/repos/:owner/:repo', ({ params }) =>
    HttpResponse.json({
      full_name: `${params.owner}/${params.repo}`,
      default_branch: 'main',
      private: false,
      stargazers_count: 42,
    })
  ),
  http.get('https://api.github.com/repos/:owner/:repo/git/trees/:sha', () =>
    HttpResponse.json({
      tree: [{ path: 'src/index.ts', type: 'blob', sha: 'abc123', size: 1024 }],
      truncated: false,
    })
  ),
  http.get('https://api.github.com/repos/:owner/:repo/contents/:path', ({ params }) =>
    HttpResponse.json({
      content: Buffer.from(`// ${params.path}`).toString('base64'),
      encoding: 'base64',
    })
  ),
];
