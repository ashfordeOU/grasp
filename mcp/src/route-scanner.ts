export interface RouteEntry {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
}

export interface ToolEntry {
  name: string;
  type: 'mcp' | 'grpc' | 'rpc' | 'unknown';
  file: string;
  line: number;
  description?: string;
}

// Express/Fastify/Hono: app.get('/path', handler) or router.post(...)
const JS_ROUTE_RE = /(?:app|router|server)\.(get|post|put|delete|patch|head|options|all)\s*\(\s*['"`]([^'"` ]+)['"`]\s*,\s*(?!async\b|function\b|class\b)([A-Za-z_$][\w$]*)/gi;
// FastAPI/Flask: @app.get("/path") or @router.post(...)
const PY_ROUTE_RE = /@(?:app|router|blueprint)\.(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']/gi;
// Gin (Go): r.GET("/path", handler) or r.POST(...)
const GO_ROUTE_RE = /(?:r|router|engine|g)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*"([^"]+)"\s*,\s*([A-Za-z_][\w]*)/g;

export function scanRoutes(files: Record<string, string>): RouteEntry[] {
  const results: RouteEntry[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    const isGo = filePath.endsWith('.go');
    const isPy = filePath.endsWith('.py');

    lines.forEach((line, lineIdx) => {
      const ln = lineIdx + 1;
      if (isPy) {
        let m: RegExpExecArray | null;
        PY_ROUTE_RE.lastIndex = 0;
        while ((m = PY_ROUTE_RE.exec(line)) !== null) {
          // Handler is the next non-decorator, non-blank line's def name
          const handler = lines.slice(lineIdx + 1).find(l => /^\s*(async\s+)?def\s+(\w+)/.test(l))
            ?.match(/def\s+(\w+)/)?.[1] ?? 'unknown';
          results.push({ method: m[1].toUpperCase(), path: m[2], handler, file: filePath, line: ln });
        }
      } else if (isGo) {
        let m: RegExpExecArray | null;
        GO_ROUTE_RE.lastIndex = 0;
        while ((m = GO_ROUTE_RE.exec(line)) !== null) {
          results.push({ method: m[1].toUpperCase(), path: m[2], handler: m[3], file: filePath, line: ln });
        }
      } else {
        let m: RegExpExecArray | null;
        JS_ROUTE_RE.lastIndex = 0;
        while ((m = JS_ROUTE_RE.exec(line)) !== null) {
          results.push({ method: m[1].toUpperCase(), path: m[2], handler: m[3], file: filePath, line: ln });
        }
      }
    });
  }
  return results;
}

// MCP tool registrations: server.registerTool('name', ...) or server.tool('name', ...)
const MCP_TOOL_RE = /server\.(?:registerTool|tool)\s*\(\s*['"`]([^'"` ]+)['"`]/g;
// gRPC: rpc MethodName(Request) returns (Response)
const GRPC_RE = /\brpc\s+(\w+)\s*\([^)]*\)\s+returns\s*\(/g;

export function scanTools(files: Record<string, string>): ToolEntry[] {
  const results: ToolEntry[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m: RegExpExecArray | null;
      MCP_TOOL_RE.lastIndex = 0;
      while ((m = MCP_TOOL_RE.exec(line)) !== null) {
        results.push({ name: m[1], type: 'mcp', file: filePath, line: i + 1 });
      }
      GRPC_RE.lastIndex = 0;
      while ((m = GRPC_RE.exec(line)) !== null) {
        results.push({ name: m[1], type: 'grpc', file: filePath, line: i + 1 });
      }
    });
  }
  return results;
}
