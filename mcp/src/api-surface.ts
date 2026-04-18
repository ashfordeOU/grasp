/**
 * Grasp API Surface Scanner
 *
 * Scans source files and OpenAPI/GraphQL schema definitions to produce
 * a full-stack API dependency map: endpoint → implementing files → called files.
 *
 * Supported:
 *   - OpenAPI 2.x / 3.x (JSON or YAML) — extracts paths, methods, operationIds
 *   - GraphQL SDL — extracts Query/Mutation/Subscription fields
 *   - Express-style routes (app.get/post/put/delete/patch, router.X)
 *   - FastAPI/Flask-style Python routes (@app.route, @router.get)
 *   - Next.js file-based routing (pages/api/x.ts, app/...route.ts)
 */

export interface ApiEndpoint {
  method: string;       // GET, POST, QUERY, MUTATION, SUBSCRIPTION, etc.
  path: string;         // /users/:id, User.posts (for GraphQL)
  operationId?: string;
  file?: string;        // source file that implements this endpoint
  line?: number;
  kind: 'rest' | 'graphql' | 'grpc';
  tag?: string;         // OpenAPI tag or GraphQL type name
  description?: string;
}

export interface ApiSurfaceReport {
  endpoints: ApiEndpoint[];
  totalEndpoints: number;
  byMethod: Record<string, number>;
  byFile: Record<string, ApiEndpoint[]>;
  undocumentedFiles: string[];   // source files with routes but no spec reference
  specFiles: string[];
}

// ── OpenAPI parser ───────────────────────────────────────────────────────────

/**
 * Extract endpoints from an OpenAPI 2.x / 3.x spec (JSON string).
 * Handles both Swagger 2.0 and OpenAPI 3.0/3.1 shapes.
 */
export function parseOpenApiSpec(json: string, specFile = 'openapi.json'): ApiEndpoint[] {
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return [];
  }

  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const endpoints: ApiEndpoint[] = [];
  const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (typeof pathItem !== 'object' || pathItem === null) continue;

    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as Record<string, unknown> | undefined;
      if (!op) continue;

      const tags = Array.isArray(op.tags) ? (op.tags as string[]) : [];
      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        description: typeof op.summary === 'string' ? op.summary : undefined,
        kind: 'rest',
        tag: tags[0],
        file: specFile,
      });
    }
  }

  return endpoints;
}

// ── GraphQL SDL parser ───────────────────────────────────────────────────────

const GQL_OPERATION_TYPES = ['Query', 'Mutation', 'Subscription'] as const;

/**
 * Extract fields from GraphQL SDL (type Query { ... }, type Mutation { ... }).
 */
export function parseGraphQlSchema(sdl: string, schemaFile = 'schema.graphql'): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const typeName of GQL_OPERATION_TYPES) {
    // Match: type Query { field1(args): ReturnType, field2: ReturnType! }
    const typeMatch = sdl.match(
      new RegExp(`type\\s+${typeName}\\s*\\{([^}]+)\\}`, 's')
    );
    if (!typeMatch) continue;

    const body = typeMatch[1];
    // Match field name: ignores arguments and return type
    const fieldRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm;
    let match: RegExpExecArray | null;
    let line = sdl.slice(0, typeMatch.index ?? 0).split('\n').length;

    while ((match = fieldRe.exec(body)) !== null) {
      endpoints.push({
        method: typeName.toUpperCase(),
        path: `${typeName}.${match[1]}`,
        operationId: match[1],
        kind: 'graphql',
        tag: typeName,
        file: schemaFile,
        line: line++,
      });
    }
  }

  return endpoints;
}

// ── Source file route scanner ────────────────────────────────────────────────

interface RoutePattern {
  regex: RegExp;
  method: string;
  pathGroup: number;
  kind: 'rest';
}

const ROUTE_PATTERNS: RoutePattern[] = [
  // Express: app.get('/path', ...) / router.post('/path', ...)
  {
    regex: /(?:app|router)\.(?:get|post|put|delete|patch|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: 'DYNAMIC',
    pathGroup: 1,
    kind: 'rest',
  },
  // FastAPI / Flask: @app.route('/path', methods=['GET'])
  {
    regex: /@(?:app|router)\.route\s*\(\s*['"]([^'"]+)['"]/g,
    method: 'DYNAMIC',
    pathGroup: 1,
    kind: 'rest',
  },
  // FastAPI decorator: @router.get('/path') / @app.post('/path')
  {
    regex: /@(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g,
    method: 'DYNAMIC',
    pathGroup: 1,
    kind: 'rest',
  },
  // Next.js App Router: export async function GET(req) in route.ts
  {
    regex: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g,
    method: 'DYNAMIC',
    pathGroup: 1,
    kind: 'rest',
  },
];

/**
 * Extract the HTTP method from a route statement (e.g. app.get → GET).
 */
function extractMethod(line: string): string {
  const m = line.match(/\.(?:get|post|put|delete|patch)\s*\(/i);
  return m ? m[0].slice(1, -1).trim().replace(/[\s(]/g, '').toUpperCase() : 'ANY';
}

/**
 * Scan source files for inline route declarations.
 */
export function scanSourceRoutes(
  fileContents: Array<{ path: string; content: string }>,
): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const { path: filePath, content } of fileContents) {
    // Next.js file-based routing
    if (/(?:^|\/)(?:pages\/api|app\/.+)\/route\.[jt]sx?$/.test(filePath)) {
      const httpMethodRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = httpMethodRe.exec(content)) !== null) {
        const routePath = filePath
          .replace(/.*\/(?:pages\/api|app)/, '')
          .replace(/\/route\.[jt]sx?$/, '')
          .replace(/\/page\.[jt]sx?$/, '')
          || '/';
        const line = content.slice(0, m.index).split('\n').length;
        endpoints.push({ method: m[1], path: routePath, file: filePath, line, kind: 'rest' });
      }
      continue;
    }

    // Express / FastAPI style
    const expressRe = /(?:app|router)\.(get|post|put|delete|patch|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = expressRe.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      const verb = m[1].toUpperCase() === 'USE' || m[1].toUpperCase() === 'ALL' ? 'ANY' : m[1].toUpperCase();
      endpoints.push({ method: verb, path: m[2], file: filePath, line, kind: 'rest' });
    }

    const pyRe = /@(?:app|router)\.(?:route|get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    while ((m = pyRe.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      endpoints.push({ method: extractMethod(content.slice(m.index, m.index + 80)), path: m[1], file: filePath, line, kind: 'rest' });
    }
  }

  return endpoints;
}

// ── Report builder ───────────────────────────────────────────────────────────

/**
 * Merge spec endpoints and source-file endpoints into a unified surface report.
 * Tries to match spec operationIds / paths to source file implementations.
 */
export function buildApiSurfaceReport(
  specEndpoints: ApiEndpoint[],
  sourceEndpoints: ApiEndpoint[],
  allSourceFiles: string[],
): ApiSurfaceReport {
  const all = [...specEndpoints, ...sourceEndpoints];

  // Deduplicate by method+path
  const seen = new Set<string>();
  const deduplicated: ApiEndpoint[] = [];
  for (const ep of all) {
    const key = `${ep.method}:${ep.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(ep);
    }
  }

  // byMethod
  const byMethod: Record<string, number> = {};
  for (const ep of deduplicated) {
    byMethod[ep.method] = (byMethod[ep.method] ?? 0) + 1;
  }

  // byFile
  const byFile: Record<string, ApiEndpoint[]> = {};
  for (const ep of deduplicated) {
    if (ep.file) {
      byFile[ep.file] = byFile[ep.file] ?? [];
      byFile[ep.file].push(ep);
    }
  }

  // Find source files that have routes but aren't referenced in spec
  const specPaths = new Set(specEndpoints.map(e => e.path));
  const routeFiles = new Set(sourceEndpoints.map(e => e.file).filter(Boolean) as string[]);
  const specFiles = [...new Set(specEndpoints.map(e => e.file).filter(Boolean) as string[])];

  const undocumentedFiles = [...routeFiles].filter(f => {
    const filePaths = new Set(sourceEndpoints.filter(e => e.file === f).map(e => e.path));
    return [...filePaths].some(p => !specPaths.has(p));
  });

  return {
    endpoints: deduplicated,
    totalEndpoints: deduplicated.length,
    byMethod,
    byFile,
    undocumentedFiles,
    specFiles,
  };
}
