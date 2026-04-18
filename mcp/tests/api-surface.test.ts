import {
  parseOpenApiSpec,
  parseGraphQlSchema,
  scanSourceRoutes,
  buildApiSurfaceReport,
  type ApiEndpoint,
} from '../src/api-surface';

// ── parseOpenApiSpec ─────────────────────────────────────────────────────────

describe('parseOpenApiSpec', () => {
  const simpleSpec = JSON.stringify({
    openapi: '3.0.0',
    paths: {
      '/users': {
        get: { operationId: 'listUsers', summary: 'List users', tags: ['users'] },
        post: { operationId: 'createUser', tags: ['users'] },
      },
      '/users/{id}': {
        get: { operationId: 'getUser' },
        put: { operationId: 'updateUser' },
        delete: { operationId: 'deleteUser' },
      },
    },
  });

  it('extracts all HTTP methods', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    const methods = eps.map(e => e.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('extracts paths correctly', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    expect(eps.some(e => e.path === '/users')).toBe(true);
    expect(eps.some(e => e.path === '/users/{id}')).toBe(true);
  });

  it('extracts operationIds', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    expect(eps.some(e => e.operationId === 'listUsers')).toBe(true);
    expect(eps.some(e => e.operationId === 'createUser')).toBe(true);
  });

  it('extracts summary as description', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    const listUsers = eps.find(e => e.operationId === 'listUsers');
    expect(listUsers?.description).toBe('List users');
  });

  it('extracts first tag', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    const listUsers = eps.find(e => e.operationId === 'listUsers');
    expect(listUsers?.tag).toBe('users');
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseOpenApiSpec('{bad json')).toHaveLength(0);
  });

  it('returns empty array for spec with no paths', () => {
    expect(parseOpenApiSpec('{"openapi":"3.0.0"}')).toHaveLength(0);
  });

  it('sets kind to rest', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    expect(eps.every(e => e.kind === 'rest')).toBe(true);
  });

  it('sets file to specFile parameter', () => {
    const eps = parseOpenApiSpec(simpleSpec, 'api/openapi.yaml');
    expect(eps.every(e => e.file === 'api/openapi.yaml')).toBe(true);
  });

  it('counts correct number of endpoints', () => {
    const eps = parseOpenApiSpec(simpleSpec);
    expect(eps).toHaveLength(5); // GET /users, POST /users, GET /{id}, PUT /{id}, DELETE /{id}
  });
});

// ── parseGraphQlSchema ───────────────────────────────────────────────────────

describe('parseGraphQlSchema', () => {
  const sdl = `
    type Query {
      user(id: ID!): User
      users: [User!]!
      post(slug: String!): Post
    }
    type Mutation {
      createUser(input: CreateUserInput!): User
      deleteUser(id: ID!): Boolean
    }
    type Subscription {
      userCreated: User
    }
    type User { id: ID!, name: String! }
    type Post { id: ID!, title: String! }
  `;

  it('extracts Query fields', () => {
    const eps = parseGraphQlSchema(sdl);
    expect(eps.some(e => e.path === 'Query.user')).toBe(true);
    expect(eps.some(e => e.path === 'Query.users')).toBe(true);
    expect(eps.some(e => e.path === 'Query.post')).toBe(true);
  });

  it('extracts Mutation fields', () => {
    const eps = parseGraphQlSchema(sdl);
    expect(eps.some(e => e.path === 'Mutation.createUser')).toBe(true);
    expect(eps.some(e => e.path === 'Mutation.deleteUser')).toBe(true);
  });

  it('extracts Subscription fields', () => {
    const eps = parseGraphQlSchema(sdl);
    expect(eps.some(e => e.path === 'Subscription.userCreated')).toBe(true);
  });

  it('sets method to operation type', () => {
    const eps = parseGraphQlSchema(sdl);
    const queries = eps.filter(e => e.tag === 'Query');
    expect(queries.every(e => e.method === 'QUERY')).toBe(true);
    const mutations = eps.filter(e => e.tag === 'Mutation');
    expect(mutations.every(e => e.method === 'MUTATION')).toBe(true);
  });

  it('sets kind to graphql', () => {
    const eps = parseGraphQlSchema(sdl);
    expect(eps.every(e => e.kind === 'graphql')).toBe(true);
  });

  it('returns empty for SDL without operations', () => {
    const noOps = `type User { id: ID!, name: String! }`;
    expect(parseGraphQlSchema(noOps)).toHaveLength(0);
  });
});

// ── scanSourceRoutes ─────────────────────────────────────────────────────────

describe('scanSourceRoutes', () => {
  it('detects Express app.get', () => {
    const files = [{ path: 'src/users.ts', content: `app.get('/users', handler);\n` }];
    const eps = scanSourceRoutes(files);
    expect(eps.some(e => e.path === '/users' && e.method === 'GET')).toBe(true);
  });

  it('detects Express router.post', () => {
    const files = [{ path: 'src/auth.ts', content: `router.post('/login', loginHandler);\n` }];
    const eps = scanSourceRoutes(files);
    expect(eps.some(e => e.path === '/login' && e.method === 'POST')).toBe(true);
  });

  it('detects multiple routes in same file', () => {
    const content = `
      router.get('/items', list);
      router.post('/items', create);
      router.delete('/items/:id', remove);
    `;
    const files = [{ path: 'src/items.ts', content }];
    const eps = scanSourceRoutes(files);
    expect(eps.filter(e => e.file === 'src/items.ts')).toHaveLength(3);
  });

  it('detects FastAPI/Flask @app.route decorator', () => {
    const files = [{ path: 'api/users.py', content: `@app.route('/users', methods=['GET'])\ndef list_users(): pass` }];
    const eps = scanSourceRoutes(files);
    expect(eps.some(e => e.path === '/users')).toBe(true);
  });

  it('detects FastAPI @router.get decorator', () => {
    const files = [{ path: 'api/users.py', content: `@router.get('/users/{id}')\nasync def get_user(id: int): ...` }];
    const eps = scanSourceRoutes(files);
    expect(eps.some(e => e.path === '/users/{id}')).toBe(true);
  });

  it('detects Next.js App Router exports', () => {
    const files = [{ path: 'app/api/users/route.ts', content: `export async function GET(req: Request) {}\nexport async function POST(req: Request) {}` }];
    const eps = scanSourceRoutes(files);
    expect(eps.some(e => e.method === 'GET' && e.file === 'app/api/users/route.ts')).toBe(true);
    expect(eps.some(e => e.method === 'POST')).toBe(true);
  });

  it('returns empty for files with no routes', () => {
    const files = [{ path: 'src/utils.ts', content: `export const add = (a: number, b: number) => a + b;` }];
    expect(scanSourceRoutes(files)).toHaveLength(0);
  });

  it('records file path', () => {
    const files = [{ path: 'src/routes/orders.ts', content: `app.get('/orders', list);` }];
    const eps = scanSourceRoutes(files);
    expect(eps[0].file).toBe('src/routes/orders.ts');
  });
});

// ── buildApiSurfaceReport ────────────────────────────────────────────────────

describe('buildApiSurfaceReport', () => {
  const specEps: ApiEndpoint[] = [
    { method: 'GET', path: '/users', kind: 'rest', file: 'openapi.json' },
    { method: 'POST', path: '/users', kind: 'rest', file: 'openapi.json' },
  ];
  const sourceEps: ApiEndpoint[] = [
    { method: 'GET', path: '/users', kind: 'rest', file: 'src/users.ts' },
    { method: 'DELETE', path: '/users/:id', kind: 'rest', file: 'src/users.ts' },
  ];

  it('deduplicates spec+source by method+path', () => {
    const report = buildApiSurfaceReport(specEps, sourceEps, []);
    const paths = report.endpoints.map(e => `${e.method}:${e.path}`);
    // GET /users appears in both — should appear once
    expect(paths.filter(p => p === 'GET:/users')).toHaveLength(1);
  });

  it('counts endpoints correctly', () => {
    const report = buildApiSurfaceReport(specEps, sourceEps, []);
    // GET /users (deduped), POST /users, DELETE /users/:id = 3 unique
    expect(report.totalEndpoints).toBe(3);
  });

  it('groups endpoints by file', () => {
    const report = buildApiSurfaceReport(specEps, sourceEps, []);
    expect(report.byFile['src/users.ts']).toBeDefined();
  });

  it('identifies undocumented route files', () => {
    const report = buildApiSurfaceReport(specEps, sourceEps, []);
    // DELETE /users/:id is in source but not in spec
    expect(report.undocumentedFiles).toContain('src/users.ts');
  });

  it('returns specFiles list', () => {
    const report = buildApiSurfaceReport(specEps, [], []);
    expect(report.specFiles).toContain('openapi.json');
  });

  it('byMethod counts are correct', () => {
    const report = buildApiSurfaceReport(specEps, sourceEps, []);
    expect(report.byMethod['GET']).toBe(1);
    expect(report.byMethod['POST']).toBe(1);
    expect(report.byMethod['DELETE']).toBe(1);
  });

  it('returns empty report for no endpoints', () => {
    const report = buildApiSurfaceReport([], [], []);
    expect(report.totalEndpoints).toBe(0);
    expect(report.endpoints).toHaveLength(0);
  });
});
