#!/usr/bin/env node
/**
 * Grasp MCP Server
 *
 * Exposes Grasp's codebase analysis engine as MCP tools for LLMs and agents.
 * Supports both GitHub repositories and local directories.
 *
 * Usage (Claude Code):
 *   Add to ~/.claude/claude_mcp_settings.json:
 *   {
 *     "mcpServers": {
 *       "grasp": {
 *         "command": "node",
 *         "args": ["/path/to/grasp/mcp/dist/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  analyzeSource,
  parseSource,
  buildFileMetrics,
  findDependencyPath,
} from './analyzer.js';
import type { AnalysisResult, Connection } from './types.js';
import { getGitTimeline } from './sources/local.js';

// In-memory session cache (persists for the lifetime of the MCP server process)
const sessions = new Map<string, AnalysisResult>();

const CHARACTER_LIMIT = 40000;

function truncate(text: string, limit = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[...truncated — ${text.length - limit} chars omitted. Use filters or pagination to narrow results.]`;
}

const server = new McpServer({
  name: 'grasp-mcp-server',
  version: '1.5.0',
});

// =====================================================================
// TOOL: grasp_analyze
// =====================================================================
server.registerTool(
  'grasp_analyze',
  {
    title: 'Analyze Repository',
    description: `Analyze a GitHub repository or local directory and return a full dependency graph, architecture map, issues, security findings, and health score.

This is the primary entry point. Run this first — it returns a session_id used by all other grasp_* tools.

Args:
  - source (string): GitHub repo as "owner/repo" or "https://github.com/owner/repo", OR local path like "/path/to/repo" or "./my-project"
  - token (string, optional): GitHub personal access token — increases rate limit from 60 to 5000 req/hour. Required for large repos.

Returns:
  {
    "session_id": string,        // Pass to other grasp_* tools
    "source": string,            // Repo identifier
    "analyzed_at": string,       // ISO timestamp
    "summary": {
      "file_count": number,
      "code_file_count": number,
      "function_count": number,
      "connection_count": number,
      "issue_count": number,
      "critical_issue_count": number,
      "circular_dep_count": number,
      "security_issue_count": number,
      "health_score": number,    // 0–100
      "health_grade": string,    // A–F
      "layers": string[],        // Architecture layers detected
      "top_folders": [...],
      "languages": [...]
    },
    "top_issues": [...],         // First 5 issues
    "security_preview": [...],   // First 3 security issues
    "architecture_preview": {...} // Files per layer (count only)
  }

Examples:
  - "Analyze the facebook/react repo" → source: "facebook/react"
  - "Analyze my local project" → source: "/Users/me/myproject"
  - "What's the health score of owner/repo?" → source: "owner/repo"`,
    inputSchema: z.object({
      source: z.string().describe('GitHub "owner/repo", GitHub URL, or local filesystem path'),
      token: z.string().optional().describe('GitHub personal access token (optional, increases rate limit)'),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ source, token }) => {
    const repoSource = parseSource(source, token);
    if (!repoSource) {
      return { content: [{ type: 'text', text: `Error: Could not parse source "${source}". Use "owner/repo", a GitHub URL, or a local path.` }] };
    }

    try {
      const result = await analyzeSource(repoSource, (msg) => {
        process.stderr.write(`[grasp] ${msg}\n`);
      });

      sessions.set(result.sessionId, result);

      // Build architecture preview
      const archPreview: Record<string, number> = {};
      result.files.forEach((f) => {
        archPreview[f.layer] = (archPreview[f.layer] ?? 0) + 1;
      });

      const output = {
        session_id: result.sessionId,
        source: result.source,
        source_type: result.sourceType,
        analyzed_at: result.analyzedAt,
        summary: {
          file_count: result.summary.fileCount,
          code_file_count: result.summary.codeFileCount,
          function_count: result.summary.functionCount,
          connection_count: result.summary.connectionCount,
          issue_count: result.summary.issueCount,
          critical_issue_count: result.summary.criticalIssueCount,
          circular_dep_count: result.summary.circularDepCount,
          security_issue_count: result.summary.securityIssueCount,
          health_score: result.summary.healthScore,
          health_grade: result.summary.healthGrade,
          layers: result.summary.layers,
          top_folders: result.summary.topFolders,
          languages: result.summary.languages,
        },
        top_issues: result.issues.slice(0, 5).map((i) => ({
          type: i.type,
          title: i.title,
          desc: i.desc,
          count: i.items.length,
          sample: i.items.slice(0, 3),
        })),
        security_preview: result.security.slice(0, 5),
        architecture_preview: archPreview,
        note: 'Use session_id with other grasp_* tools for detailed queries.',
      };

      return {
        content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
        structuredContent: output,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error analyzing "${source}": ${msg}` }] };
    }
  }
);

// =====================================================================
// TOOL: grasp_file_deps
// =====================================================================
server.registerTool(
  'grasp_file_deps',
  {
    title: 'Get File Dependencies',
    description: `Get all files that a specific file depends on (outgoing dependencies — what it calls into).

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - file_path (string): Relative path to the file (e.g. "src/auth.py", "lib/utils.ts")

Returns:
  {
    "file": string,
    "depends_on": [               // Files this file calls into
      {
        "file": string,
        "functions_called": string[],
        "call_count": number
      }
    ],
    "total": number
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      file_path: z.string().describe('Relative path to the file'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, file_path }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    // Find connections where this file is the TARGET (i.e. it's being called by source)
    // "depends_on" = files that define functions this file calls
    // Actually: connection.source = file that DEFINES the fn, connection.target = file that CALLS it
    // So for "what does file_path call?", we want connections where target = file_path
    const deps = result.connections.filter((c) => c.target === file_path);

    // Group by source file
    const grouped: Record<string, { functions: string[]; count: number }> = {};
    deps.forEach((c) => {
      if (!grouped[c.source]) grouped[c.source] = { functions: [], count: 0 };
      if (!grouped[c.source].functions.includes(c.fn)) grouped[c.source].functions.push(c.fn);
      grouped[c.source].count += c.count;
    });

    const output = {
      file: file_path,
      depends_on: Object.entries(grouped).map(([file, d]) => ({
        file,
        functions_called: d.functions,
        call_count: d.count,
      })).sort((a, b) => b.call_count - a.call_count),
      total: Object.keys(grouped).length,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_dependents
// =====================================================================
server.registerTool(
  'grasp_dependents',
  {
    title: 'Get File Dependents',
    description: `Get all files that depend on a specific file (incoming dependencies — what calls into it). Useful for blast radius analysis: "what breaks if I change this file?"

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - file_path (string): Relative path to the file

Returns:
  {
    "file": string,
    "depended_on_by": [           // Files that call into this file
      {
        "file": string,
        "functions_used": string[],
        "call_count": number
      }
    ],
    "blast_radius": number,       // Count of dependent files
    "total": number
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      file_path: z.string().describe('Relative path to the file'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, file_path }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    // source = file defining the fn, target = file calling it
    // "depended_on_by" = files that call functions defined in file_path → connections where source = file_path
    const deps = result.connections.filter((c) => c.source === file_path);

    const grouped: Record<string, { functions: string[]; count: number }> = {};
    deps.forEach((c) => {
      if (!grouped[c.target]) grouped[c.target] = { functions: [], count: 0 };
      if (!grouped[c.target].functions.includes(c.fn)) grouped[c.target].functions.push(c.fn);
      grouped[c.target].count += c.count;
    });

    const output = {
      file: file_path,
      depended_on_by: Object.entries(grouped).map(([file, d]) => ({
        file,
        functions_used: d.functions,
        call_count: d.count,
      })).sort((a, b) => b.call_count - a.call_count),
      blast_radius: Object.keys(grouped).length,
      total: Object.keys(grouped).length,
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_cycles
// =====================================================================
server.registerTool(
  'grasp_cycles',
  {
    title: 'Find Circular Dependencies',
    description: `Find all circular dependency chains in the codebase. Circular deps cause tight coupling, make testing difficult, and can cause runtime errors.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - limit (number, optional): Max cycles to return (default: 20)

Returns:
  {
    "total": number,
    "cycles": [
      {
        "length": number,           // Number of files in the cycle
        "files": string[],          // Files in the cycle (A → B → C → A)
        "display": string           // Human-readable: "a.py → b.py → c.py → a.py"
      }
    ]
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max cycles to return'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const cycleIssue = result.issues.find((i) => i.title.includes('Circular'));
    const cycles = (cycleIssue?.items ?? []).slice(0, limit).map((item) => ({
      length: (item.files ?? []).length,
      files: item.files ?? [],
      display: [...(item.files ?? []), (item.files ?? [])[0]].map((f) => f.split('/').pop()).join(' → '),
    }));

    const output = { total: cycleIssue?.items.length ?? 0, cycles };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_architecture
// =====================================================================
server.registerTool(
  'grasp_architecture',
  {
    title: 'Get Architecture Layers',
    description: `Get files grouped by architecture layer (routes/services/models/utils/components/test etc.). Useful for understanding codebase structure before making changes.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - layer (string, optional): Filter to a specific layer (e.g. "services", "data", "test")

Returns:
  {
    "layers": {
      "services": { "count": number, "files": string[] },
      "data": { "count": number, "files": string[] },
      ...
    }
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      layer: z.string().optional().describe('Filter to specific layer (services, data, utils, test, config, components, ui)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, layer }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const grouped: Record<string, string[]> = {};
    result.files.forEach((f) => {
      if (layer && f.layer !== layer) return;
      if (!grouped[f.layer]) grouped[f.layer] = [];
      grouped[f.layer].push(f.path);
    });

    const layers: Record<string, { count: number; files: string[] }> = {};
    Object.entries(grouped).sort().forEach(([l, files]) => {
      layers[l] = { count: files.length, files: files.sort() };
    });

    const output = { layers, total_layers: Object.keys(layers).length };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_hotspots
// =====================================================================
server.registerTool(
  'grasp_hotspots',
  {
    title: 'Get Hotspot Files',
    description: `Get the most problematic files ranked by a combination of coupling, complexity, and size. These are the highest-risk files to change and best candidates for refactoring.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - limit (number, optional): Number of files to return (default: 15)
  - sort_by ("coupling" | "complexity" | "size" | "combined"): Ranking strategy (default: "combined")

Returns:
  {
    "hotspots": [
      {
        "path": string,
        "name": string,
        "layer": string,
        "fan_in": number,       // Files that depend on this
        "fan_out": number,      // Files this depends on
        "complexity": number,
        "lines": number,
        "functions": number,
        "score": number         // Combined hotspot score
      }
    ]
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      limit: z.number().int().min(1).max(50).default(15).describe('Number of hotspots to return'),
      sort_by: z.enum(['coupling', 'complexity', 'size', 'combined']).default('combined').describe('Ranking strategy'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, limit, sort_by }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const metrics = buildFileMetrics(result);

    const maxFanIn = Math.max(...metrics.map((m) => m.fanIn), 1);
    const maxComplexity = Math.max(...metrics.map((m) => m.complexity), 1);
    const maxLines = Math.max(...metrics.map((m) => m.lines), 1);

    const scored = metrics.map((m) => {
      let score = 0;
      if (sort_by === 'coupling') score = m.fanIn;
      else if (sort_by === 'complexity') score = m.complexity;
      else if (sort_by === 'size') score = m.lines;
      else {
        score = (m.fanIn / maxFanIn) * 40 + (m.complexity / maxComplexity) * 40 + (m.lines / maxLines) * 20;
        score = Math.round(score * 100);
      }
      return { ...m, score };
    });

    const hotspots = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((m) => ({
        path: m.path,
        name: m.name,
        layer: m.layer,
        fan_in: m.fanIn,
        fan_out: m.fanOut,
        complexity: m.complexity,
        lines: m.lines,
        functions: m.functionCount,
        score: m.score,
      }));

    const output = { hotspots, sort_by, total: metrics.length };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_metrics
// =====================================================================
server.registerTool(
  'grasp_metrics',
  {
    title: 'Get File Metrics',
    description: `Get per-file metrics: lines, functions, cyclomatic complexity, fan-in, fan-out, and churn.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - file_path (string, optional): Get metrics for a specific file. If omitted, returns all files sorted by complexity.
  - limit (number, optional): Max files to return when listing all (default: 30)

Returns for specific file:
  { "path", "lines", "functions", "complexity", "nesting_depth", "fan_in", "fan_out", "churn", "layer" }

Returns for all files:
  { "files": [...], "total": number }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      file_path: z.string().optional().describe('Specific file path. Omit to get all files.'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max files when listing all'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, file_path, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const metrics = buildFileMetrics(result);

    if (file_path) {
      const m = metrics.find((m) => m.path === file_path || m.name === file_path);
      if (!m) return { content: [{ type: 'text', text: `Error: File "${file_path}" not found in analysis.` }] };
      const output = { path: m.path, name: m.name, layer: m.layer, lines: m.lines, functions: m.functionCount, complexity: m.complexity, nesting_depth: m.nestingDepth, fan_in: m.fanIn, fan_out: m.fanOut, churn: m.churn };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }

    const files = metrics
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, limit)
      .map((m) => ({ path: m.path, layer: m.layer, lines: m.lines, functions: m.functionCount, complexity: m.complexity, fan_in: m.fanIn, fan_out: m.fanOut }));

    const output = { files, total: metrics.length, showing: files.length };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_find_path
// =====================================================================
server.registerTool(
  'grasp_find_path',
  {
    title: 'Find Dependency Path',
    description: `Find the shortest dependency path between two files. Useful for understanding how file A connects to file B through the call graph.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - from (string): Source file path
  - to (string): Target file path

Returns:
  {
    "from": string,
    "to": string,
    "path": string[],           // Files in the dependency chain
    "length": number,           // Hops in the chain
    "found": boolean
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      from: z.string().describe('Source file path'),
      to: z.string().describe('Target file path'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, from, to }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const path = findDependencyPath(from, to, result.connections);
    const output = path
      ? { from, to, path, length: path.length - 1, found: true }
      : { from, to, path: null, length: -1, found: false, note: 'No dependency path found between these files.' };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_security
// =====================================================================
server.registerTool(
  'grasp_security',
  {
    title: 'Get Security Issues',
    description: `Get security issues found in the codebase: hardcoded secrets, SQL injection risks, insecure patterns, etc.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - severity (string, optional): Filter by severity ("critical", "high", "medium", "low")
  - limit (number, optional): Max issues to return (default: 30)

Returns:
  {
    "total": number,
    "issues": [
      {
        "type": string,
        "severity": string,
        "file": string,
        "desc": string
      }
    ]
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by severity'),
      limit: z.number().int().min(1).max(100).default(30).describe('Max issues to return'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, severity, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    let issues = result.security;
    if (severity) issues = issues.filter((i) => i.severity === severity);

    const output = {
      total: issues.length,
      issues: issues.slice(0, limit),
      ...(severity ? { filtered_by: severity } : {}),
    };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_patterns
// =====================================================================
server.registerTool(
  'grasp_patterns',
  {
    title: 'Get Design Patterns',
    description: `Get design patterns detected in the codebase: Singleton, Factory, Observer, hooks, decorators, middleware, and anti-patterns like God Objects.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - include_anti_patterns (boolean, optional): Include anti-patterns like God Object and Long File (default: true)

Returns:
  {
    "total": number,
    "patterns": [
      {
        "name": string,
        "desc": string,
        "severity": string,
        "is_anti_pattern": boolean,
        "file_count": number,
        "files": [{"name": string, "path": string}]
      }
    ]
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      include_anti_patterns: z.boolean().default(true).describe('Include anti-patterns like God Object'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, include_anti_patterns }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    let patterns = result.patterns;
    if (!include_anti_patterns) patterns = patterns.filter((p) => !p.isAnti);

    const output = {
      total: patterns.length,
      patterns: patterns.map((p) => ({
        name: p.name,
        desc: p.desc,
        severity: p.severity,
        is_anti_pattern: p.isAnti ?? false,
        file_count: p.files.length,
        files: p.files.slice(0, 10),
        metrics: p.metrics,
      })),
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_unused
// =====================================================================
server.registerTool(
  'grasp_unused',
  {
    title: 'Get Unused Functions (Dead Code)',
    description: `Get functions that appear to be dead code — exported or defined but never called from other files.

Requires a session_id from grasp_analyze.

Args:
  - session_id (string): From grasp_analyze
  - file (string, optional): Filter to functions in a specific file path
  - limit (number, optional): Max results to return (default: 50)

Returns:
  {
    "total": number,
    "dead_code_pct": number,
    "functions": [
      {
        "name": string,
        "file": string,
        "line": number | null
      }
    ]
  }`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      file: z.string().optional().describe('Filter to functions in this file path'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max results to return'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, file, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Error: Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const unusedIssue = result.issues.find((i: any) => i.title?.toLowerCase().includes('unused') || i.title?.toLowerCase().includes('dead code'));
    let fns: any[] = unusedIssue?.items || [];

    if (file) fns = fns.filter((f: any) => f.file && (f.file === file || f.file.includes(file)));

    const totalFns = result.files.reduce((s: number, f: any) => s + (f.functions?.length || 0), 0);
    const deadPct = totalFns > 0 ? Math.round((fns.length / totalFns) * 100) : 0;

    const output = {
      total: fns.length,
      dead_code_pct: deadPct,
      functions: fns.slice(0, limit).map((f: any) => ({ name: f.name, file: f.file, line: f.line ?? null })),
      ...(file ? { filtered_by_file: file } : {}),
    };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_sessions
// =====================================================================
server.registerTool(
  'grasp_sessions',
  {
    title: 'List Active Sessions',
    description: `List all active analysis sessions in this server process. Sessions persist until the server restarts.

Returns:
  { "sessions": [{ "session_id": string, "source": string, "analyzed_at": string }] }`,
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const output = {
      sessions: [...sessions.values()].map((r) => ({
        session_id: r.sessionId,
        source: r.source,
        source_type: r.sourceType,
        analyzed_at: r.analyzedAt,
        files: r.summary.codeFileCount,
        health_grade: r.summary.healthGrade,
      })),
      count: sessions.size,
    };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_diff
// =====================================================================
server.registerTool(
  'grasp_diff',
  {
    title: 'Diff Two Analysis Sessions',
    description: `Compare two analysis sessions to see what changed between them — files added/removed, health score delta, new/resolved issues, dependency count change, and new circular dependencies.

Parameters:
  session_id_a  — the baseline session (older snapshot)
  session_id_b  — the comparison session (newer snapshot)

Returns a structured diff report.`,
    inputSchema: z.object({
      session_id_a: z.string().describe('Baseline session ID (older)'),
      session_id_b: z.string().describe('Comparison session ID (newer)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id_a, session_id_b }) => {
    const a = sessions.get(session_id_a);
    const b = sessions.get(session_id_b);
    if (!a) return { content: [{ type: 'text', text: `Session not found: ${session_id_a}` }], isError: true };
    if (!b) return { content: [{ type: 'text', text: `Session not found: ${session_id_b}` }], isError: true };

    const pathsA = new Set(a.files.map((f) => f.path));
    const pathsB = new Set(b.files.map((f) => f.path));

    const added = b.files.filter((f) => !pathsA.has(f.path)).map((f) => f.path);
    const removed = a.files.filter((f) => !pathsB.has(f.path)).map((f) => f.path);

    // Issues comparison
    const issuesA = new Set(a.issues.map((i) => i.title));
    const issuesB = new Set(b.issues.map((i) => i.title));
    const newIssues = b.issues.filter((i) => !issuesA.has(i.title)).map((i) => i.title);
    const resolvedIssues = a.issues.filter((i) => !issuesB.has(i.title)).map((i) => i.title);

    // Circular dependency comparison
    const cyclesA = new Set(a.cycles.map((c) => c.join(' → ')));
    const cyclesB = new Set(b.cycles.map((c) => c.join(' → ')));
    const newCycles = b.cycles.filter((c) => !cyclesA.has(c.join(' → '))).map((c) => c.join(' → '));
    const resolvedCycles = a.cycles.filter((c) => !cyclesB.has(c.join(' → '))).map((c) => c.join(' → '));

    const output = {
      baseline: { session_id: session_id_a, source: a.source, analyzed_at: a.analyzedAt },
      comparison: { session_id: session_id_b, source: b.source, analyzed_at: b.analyzedAt },
      files: {
        added: added.length,
        removed: removed.length,
        net: b.summary.codeFileCount - a.summary.codeFileCount,
        added_paths: added.slice(0, 20),
        removed_paths: removed.slice(0, 20),
      },
      health: {
        baseline_score: a.summary.healthScore,
        comparison_score: b.summary.healthScore,
        delta: b.summary.healthScore - a.summary.healthScore,
        baseline_grade: a.summary.healthGrade,
        comparison_grade: b.summary.healthGrade,
        improved: b.summary.healthScore > a.summary.healthScore,
      },
      dependencies: {
        baseline_count: a.summary.connectionCount,
        comparison_count: b.summary.connectionCount,
        delta: b.summary.connectionCount - a.summary.connectionCount,
      },
      issues: {
        new_issues: newIssues,
        resolved_issues: resolvedIssues,
        net: b.issues.length - a.issues.length,
      },
      circular_deps: {
        new_cycles: newCycles,
        resolved_cycles: resolvedCycles,
        net: b.cycles.length - a.cycles.length,
      },
    };

    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_suggest
// =====================================================================
server.registerTool(
  'grasp_suggest',
  {
    title: 'Refactoring Suggestions',
    description: `Generate prioritised refactoring suggestions based on hotspot data, metrics, circular dependencies, and issues from a prior analysis session.

Parameter:
  session_id — from grasp_analyze

Returns a ranked list of actionable suggestions with rationale and estimated impact.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session not found: ${session_id}` }], isError: true };

    const suggestions: Array<{
      priority: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      rationale: string;
      action: string;
      impact: string;
      files?: string[];
    }> = [];

    // 1. Circular dependencies — always critical
    if (result.cycles.length > 0) {
      suggestions.push({
        priority: 'critical',
        title: `Break ${result.cycles.length} circular dependenc${result.cycles.length === 1 ? 'y' : 'ies'}`,
        rationale: 'Circular dependencies prevent tree-shaking, complicate testing, and can cause initialisation bugs.',
        action: 'Extract shared code into a new leaf module that both files can import from without creating a cycle.',
        impact: 'Improves testability, enables lazy loading, reduces bundle size',
        files: result.cycles.flatMap((c) => c).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10),
      });
    }

    // 2. God files (too many functions)
    const metrics = buildFileMetrics(result);
    const godFiles = metrics.filter((m) => m.functionCount > 15).sort((a, b) => b.functionCount - a.functionCount);
    if (godFiles.length > 0) {
      suggestions.push({
        priority: 'high',
        title: `Split ${godFiles.length} god file${godFiles.length === 1 ? '' : 's'} with 15+ functions`,
        rationale: 'Files with too many responsibilities are hard to navigate, test, and reuse.',
        action: 'Group related functions by feature or layer and extract to separate modules.',
        impact: 'Improves readability, makes unit testing easier, reduces merge conflicts',
        files: godFiles.slice(0, 5).map((m) => `${m.path} (${m.functionCount} fns)`),
      });
    }

    // 3. High fan-in files (bottleneck dependencies)
    const highFanIn = metrics.filter((m) => m.fanIn >= 8).sort((a, b) => b.fanIn - a.fanIn);
    if (highFanIn.length > 0) {
      suggestions.push({
        priority: 'high',
        title: `Reduce coupling on ${highFanIn.length} highly-imported file${highFanIn.length === 1 ? '' : 's'}`,
        rationale: 'Files imported by 8+ others are change-risk bottlenecks — any modification ripples widely.',
        action: 'Split into smaller focused modules, or introduce an interface/adapter layer to break direct coupling.',
        impact: 'Reduces blast radius of changes, enables parallel development',
        files: highFanIn.slice(0, 5).map((m) => `${m.path} (imported by ${m.fanIn})`),
      });
    }

    // 4. High complexity files
    const complexFiles = metrics.filter((m) => m.complexity > 20).sort((a, b) => b.complexity - a.complexity);
    if (complexFiles.length > 0) {
      suggestions.push({
        priority: 'medium',
        title: `Reduce complexity in ${complexFiles.length} high-complexity file${complexFiles.length === 1 ? '' : 's'}`,
        rationale: 'High cyclomatic complexity correlates with defect density and is harder to test exhaustively.',
        action: 'Extract nested conditionals into named functions, replace switch chains with lookup tables or strategy pattern.',
        impact: 'Fewer bugs, easier to add tests, faster code review',
        files: complexFiles.slice(0, 5).map((m) => `${m.path} (complexity: ${m.complexity})`),
      });
    }

    // 5. Security issues
    if (result.summary.securityIssueCount > 0) {
      const secIssue = result.issues.find((i) => i.title.toLowerCase().includes('security') || i.type === 'critical' && i.title.toLowerCase().includes('secret'));
      const secFiles = secIssue ? secIssue.items.slice(0, 5).map((i) => i.file ?? i.name) : [];
      suggestions.push({
        priority: 'critical',
        title: `Fix ${result.summary.securityIssueCount} security issue${result.summary.securityIssueCount === 1 ? '' : 's'}`,
        rationale: 'Hardcoded secrets, SQL injection risks, and eval() usage are exploitable vulnerabilities.',
        action: 'Use environment variables for secrets, parameterised queries for SQL, and JSON.parse for data deserialization.',
        impact: 'Eliminates exploitable attack surface',
        files: secFiles,
      });
    }

    // 6. Dead code
    const unusedIssue = result.issues.find((i) => i.title.toLowerCase().includes('unused') || i.title.toLowerCase().includes('dead'));
    const deadFnCount = unusedIssue ? unusedIssue.items.length : 0;
    if (deadFnCount > 5) {
      suggestions.push({
        priority: 'low',
        title: `Remove ~${deadFnCount} unused functions`,
        rationale: 'Dead code increases cognitive load and maintenance surface without adding value.',
        action: 'Verify with your IDE or a tree-shaker, then delete. Keep public API surface if the codebase is a library.',
        impact: 'Smaller bundle, easier navigation, less to maintain',
      });
    }

    // Sort: critical → high → medium → low
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => order[a.priority] - order[b.priority]);

    const output = { session_id, source: result.source, suggestion_count: suggestions.length, suggestions };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);

// =====================================================================
// TOOL: grasp_explain
// =====================================================================
server.registerTool(
  'grasp_explain',
  {
    title: 'Explain a file or function',
    description:
      'Generate a plain-English structural explanation for a file or function in the analysed codebase. ' +
      'Describes the file\'s role, layer, dependencies, complexity, and top functions, or explains a specific function\'s purpose based on its name and call graph.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      path: z.string().describe('File path (relative to repo root) to explain'),
      function_name: z.string().optional().describe('Optional: explain a specific function within the file'),
    },
  },
  async ({ session_id, path, function_name }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const file = result.files.find(f => f.path === path || f.path.endsWith('/' + path) || f.name === path);
    if (!file) return { content: [{ type: 'text', text: `File "${path}" not found in session. Check the path spelling.` }] };

    const metrics = buildFileMetrics(result);
    const fm = metrics.find(m => m.path === file.path);
    const secIssues = result.security.filter(s => s.file === file.path);
    const layerViolations = result.layerViolations.filter(v => v.from === file.path || v.to === file.path);

    // Build callers/callees for the file
    const fileCallees = result.connections.filter(c => c.source === file.path).map(c => c.target);
    const fileCallers = result.connections.filter(c => c.target === file.path).map(c => c.source);

    const lines: string[] = [];

    if (function_name) {
      const fn = file.functions.find(f => f.name === function_name || f.name === function_name.replace(/\(\)$/, ''));
      if (!fn) return { content: [{ type: 'text', text: `Function "${function_name}" not found in ${file.name}.` }] };

      const fnStat = (result as any).fnStats?.[fn.name];
      lines.push(`## ${fn.name}() — ${file.name}`);
      lines.push('');
      lines.push(`**File:** \`${file.path}\`  `);
      lines.push(`**Line:** ${fn.line ?? 'unknown'}  `);
      if (fn.type) lines.push(`**Type:** ${fn.type}  `);
      if (fn.isExported) lines.push('**Visibility:** exported (public API)  ');
      lines.push('');
      lines.push(`**Role in codebase:**`);
      lines.push(`This function lives in the \`${file.layer}\` layer of the codebase.`);
      if (fnStat) {
        if (fnStat.internal > 0) lines.push(`It is called ${fnStat.internal} time(s) within the same file.`);
        if (fnStat.external > 0) lines.push(`It is called from ${fnStat.external} external file(s).`);
        if (fnStat.internal === 0 && fnStat.external === 0) lines.push('It appears to be unused — not called from any other file.');
      }
      if (fn.code) {
        const lineCount = fn.code.split('\n').length;
        lines.push(`It spans ~${lineCount} lines.`);
        if (lineCount > 50) lines.push('⚠️ This function is long — consider breaking it into smaller pieces.');
      }
    } else {
      lines.push(`## ${file.name}`);
      lines.push('');
      lines.push(`**Path:** \`${file.path}\`  `);
      lines.push(`**Layer:** \`${file.layer}\`  `);
      lines.push(`**Lines of code:** ${file.lines}  `);
      lines.push(`**Functions:** ${file.functions.length}  `);
      if (fm) {
        lines.push(`**Complexity score:** ${fm.complexity} (${fm.complexity > 30 ? 'critical — very hard to maintain' : fm.complexity > 15 ? 'high' : fm.complexity > 5 ? 'medium' : 'low'})  `);
        lines.push(`**Nesting depth:** ${fm.nestingDepth}  `);
        lines.push(`**Fan-in (called by):** ${fm.fanIn} files  `);
        lines.push(`**Fan-out (calls into):** ${fm.fanOut} files  `);
      }
      lines.push('');
      lines.push('**Structural role:**');
      if (fm && fm.fanIn > 10) lines.push(`This is a highly-coupled core module — ${fm.fanIn} other files depend on it. Changes here have a large blast radius.`);
      else if (fm && fm.fanIn === 0) lines.push('This appears to be an entry-point or leaf file — nothing else imports it.');
      else lines.push(`This file sits in the middle of the dependency graph, importing from ${fm?.fanOut ?? fileCallees.length} file(s) and imported by ${fm?.fanIn ?? fileCallers.length}.`);

      if (file.functions.length > 0) {
        lines.push('');
        lines.push('**Top functions:**');
        file.functions.slice(0, 10).forEach(fn => {
          lines.push(`- \`${fn.name}()\` (L${fn.line})`);
        });
        if (file.functions.length > 10) lines.push(`- … and ${file.functions.length - 10} more`);
      }

      if (fileCallees.length > 0) {
        lines.push('');
        lines.push(`**Imports from:** ${[...new Set(fileCallees)].slice(0, 8).join(', ')}`);
      }
      if (fileCallers.length > 0) {
        lines.push(`**Imported by:** ${[...new Set(fileCallers)].slice(0, 8).join(', ')}`);
      }

      if (secIssues.length > 0) {
        lines.push('');
        lines.push('**⚠️ Security issues:**');
        secIssues.forEach(s => lines.push(`- [${s.severity.toUpperCase()}] ${s.desc}${s.line ? ` (L${s.line})` : ''}`));
      }
      if (layerViolations.length > 0) {
        lines.push('');
        lines.push('**🔴 Architecture violations:**');
        layerViolations.forEach(v => lines.push(`- ${v.fromLayer} → ${v.toLayer} via \`${v.fn}\``));
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// =====================================================================
// TOOL: grasp_watch
// =====================================================================
// Track watch states (path → { timer, lastResult })
const watchStates = new Map<string, { sessionId: string; fileCount: number; healthScore: number }>();

server.registerTool(
  'grasp_watch',
  {
    title: 'Watch a directory for changes',
    description:
      'Analyse a local directory and return a diff summary compared to the last time it was analysed. ' +
      'Call repeatedly to detect changes: new files, removed files, health score drift, new issues. ' +
      'Uses session IDs to compare across calls. First call returns baseline; subsequent calls return the diff.',
    inputSchema: {
      path: z.string().describe('Absolute path to the local directory to watch'),
      baseline_session_id: z.string().optional().describe('Session ID from a previous grasp_analyze or grasp_watch call — if provided, returns a diff against it'),
    },
  },
  async ({ path, baseline_session_id }) => {
    const source = { type: 'local' as const, path };
    const lines: string[] = [];

    let currentResult: AnalysisResult;
    try {
      currentResult = await analyzeSource(source, () => {});
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Analysis failed: ${err.message}` }] };
    }

    const newSessionId = currentResult.sessionId;
    sessions.set(newSessionId, currentResult);

    const s = currentResult.summary;
    lines.push(`## Grasp Watch — ${path}`);
    lines.push(`**Session:** ${newSessionId}  **Analysed at:** ${currentResult.analyzedAt}`);
    lines.push('');

    if (!baseline_session_id) {
      // First call — return baseline stats
      lines.push('### Baseline established');
      lines.push(`- Files: ${s.fileCount} (${s.codeFileCount} code)`);
      lines.push(`- Functions: ${s.functionCount}`);
      lines.push(`- Health: ${s.healthScore}/100 (${s.healthGrade})`);
      lines.push(`- Issues: ${s.issueCount} (${s.criticalIssueCount} critical)`);
      lines.push(`- Security: ${s.securityIssueCount}`);
      lines.push(`- Circular deps: ${s.circularDepCount}`);
      lines.push('');
      lines.push(`Call again with \`baseline_session_id: "${newSessionId}"\` to get a diff.`);
    } else {
      const baseline = sessions.get(baseline_session_id);
      if (!baseline) {
        lines.push(`⚠️ Baseline session "${baseline_session_id}" not found. Returning current snapshot only.`);
        lines.push(`Files: ${s.fileCount}, Health: ${s.healthScore}/100 (${s.healthGrade}), Issues: ${s.issueCount}`);
      } else {
        const bs = baseline.summary;
        const delta = (a: number, b: number) => a > b ? `+${a-b}` : a < b ? `${a-b}` : '±0';

        lines.push('### Changes since baseline');
        lines.push('');
        lines.push(`| Metric | Before | After | Delta |`);
        lines.push(`|--------|--------|-------|-------|`);
        lines.push(`| Health | ${bs.healthScore}/100 ${bs.healthGrade} | ${s.healthScore}/100 ${s.healthGrade} | **${delta(s.healthScore, bs.healthScore)}** |`);
        lines.push(`| Files | ${bs.fileCount} | ${s.fileCount} | ${delta(s.fileCount, bs.fileCount)} |`);
        lines.push(`| Functions | ${bs.functionCount} | ${s.functionCount} | ${delta(s.functionCount, bs.functionCount)} |`);
        lines.push(`| Issues | ${bs.issueCount} | ${s.issueCount} | ${delta(s.issueCount, bs.issueCount)} |`);
        lines.push(`| Critical | ${bs.criticalIssueCount} | ${s.criticalIssueCount} | ${delta(s.criticalIssueCount, bs.criticalIssueCount)} |`);
        lines.push(`| Security | ${bs.securityIssueCount} | ${s.securityIssueCount} | ${delta(s.securityIssueCount, bs.securityIssueCount)} |`);
        lines.push(`| Cycles | ${bs.circularDepCount} | ${s.circularDepCount} | ${delta(s.circularDepCount, bs.circularDepCount)} |`);
        lines.push('');

        // New/removed files
        const baselinePaths = new Set(baseline.files.map(f => f.path));
        const currentPaths = new Set(currentResult.files.map(f => f.path));
        const added = currentResult.files.filter(f => !baselinePaths.has(f.path));
        const removed = baseline.files.filter(f => !currentPaths.has(f.path));

        if (added.length > 0) {
          lines.push(`**New files (${added.length}):**`);
          added.slice(0, 10).forEach(f => lines.push(`  + \`${f.path}\``));
          if (added.length > 10) lines.push(`  … ${added.length - 10} more`);
          lines.push('');
        }
        if (removed.length > 0) {
          lines.push(`**Removed files (${removed.length}):**`);
          removed.slice(0, 10).forEach(f => lines.push(`  - \`${f.path}\``));
          if (removed.length > 10) lines.push(`  … ${removed.length - 10} more`);
          lines.push('');
        }
        if (added.length === 0 && removed.length === 0) {
          lines.push('No files added or removed.');
          lines.push('');
        }

        // New issues
        const baselineIssueTitles = new Set(baseline.issues.map(i => i.title));
        const newIssues = currentResult.issues.filter(i => !baselineIssueTitles.has(i.title));
        if (newIssues.length > 0) {
          lines.push(`**New issues (${newIssues.length}):**`);
          newIssues.forEach(i => lines.push(`  ⚠️ [${i.type}] ${i.title}: ${i.desc}`));
          lines.push('');
        }

        lines.push(`**Next call:** use \`baseline_session_id: "${newSessionId}"\` to track from this point.`);
      }
    }

    return { content: [{ type: 'text', text: truncate(lines.join('\n')) }] };
  }
);

// =====================================================================
// TOOL: grasp_rules_check
// =====================================================================
interface ArchRule { from: string; to: string; type: 'FORBIDDEN'; reason?: string; }
interface RuleViolation { rule: string; from: string; fromLayer: string; to: string; toLayer: string; fn: string; reason: string; }

function applyArchRules(
  files: Array<{ path: string; layer: string }>,
  connections: Array<{ source: string; target: string; fn: string }>,
  rules: ArchRule[]
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const layerMap: Record<string, string> = {};
  files.forEach(f => { layerMap[f.path] = f.layer; });
  rules.filter(r => r.type === 'FORBIDDEN').forEach(rule => {
    connections.forEach(conn => {
      const srcLayer = layerMap[conn.source];
      const tgtLayer = layerMap[conn.target];
      if (!srcLayer || !tgtLayer) return;
      const fromMatch = rule.from === '*' || rule.from === srcLayer;
      const toMatch   = rule.to   === '*' || rule.to   === tgtLayer;
      if (fromMatch && toMatch) {
        violations.push({ rule: `${rule.from} → ${rule.to}`, from: conn.source, fromLayer: srcLayer, to: conn.target, toLayer: tgtLayer, fn: conn.fn, reason: rule.reason || 'FORBIDDEN' });
      }
    });
  });
  return violations;
}

server.registerTool(
  'grasp_rules_check',
  {
    title: 'Check architecture rules against a session',
    description:
      'Evaluate a set of FORBIDDEN dependency rules against a prior analysis session. ' +
      'Reads rules from a .grasprules file in the repo root (if path provided) or accepts inline rules. ' +
      'Returns violations grouped by rule — pipe into CI to enforce architecture boundaries. ' +
      'Rule format: { "from": "utils", "to": "services", "type": "FORBIDDEN", "reason": "..." }',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call'),
      rules_file: z.string().optional().describe('Absolute path to .grasprules JSON file. If omitted, looks for .grasprules in the analysed directory.'),
      rules: z.array(z.object({
        from: z.string(),
        to: z.string(),
        type: z.literal('FORBIDDEN'),
        reason: z.string().optional(),
      })).optional().describe('Inline rules array (alternative to rules_file)'),
    },
  },
  async ({ session_id, rules_file, rules: inlineRules }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    let rules: ArchRule[] = [];

    if (inlineRules && inlineRules.length > 0) {
      rules = inlineRules as ArchRule[];
    } else {
      // Try rules_file, then auto-detect from session path
      const candidates: string[] = [];
      if (rules_file) candidates.push(rules_file);
      if (result.sourceType === 'local') candidates.push(require('path').join(result.source, '.grasprules'));
      candidates.push(require('path').join(process.cwd(), '.grasprules'));

      for (const p of candidates) {
        try {
          const fs = await import('fs');
          const raw = fs.readFileSync(p, 'utf-8');
          const obj = JSON.parse(raw);
          rules = Array.isArray(obj) ? obj : (obj.rules || []);
          break;
        } catch { /* try next */ }
      }
    }

    if (rules.length === 0) {
      return { content: [{ type: 'text', text: 'No rules found. Provide inline rules or create a .grasprules file.\n\nExample .grasprules:\n```json\n{ "rules": [\n  { "from": "utils", "to": "services", "type": "FORBIDDEN", "reason": "Utils must not depend on services" }\n]}\n```' }] };
    }

    const violations = applyArchRules(result.files, result.connections, rules);
    const lines: string[] = [];
    lines.push(`## Architecture Rules Check — ${session_id}`);
    lines.push(`**Rules checked:** ${rules.length} | **Violations:** ${violations.length}`);
    lines.push('');

    if (violations.length === 0) {
      lines.push('✅ No violations found. Architecture rules are clean.');
    } else {
      lines.push('### Violations\n');
      const byRule: Record<string, RuleViolation[]> = {};
      violations.forEach(v => { (byRule[v.rule] = byRule[v.rule] || []).push(v); });
      for (const [rule, vs] of Object.entries(byRule)) {
        lines.push(`**${rule}** (${vs.length} violations)  _${vs[0].reason}_`);
        vs.slice(0, 10).forEach(v => lines.push(`  - \`${v.from}\` → \`${v.to}\`  fn: \`${v.fn}\``));
        if (vs.length > 10) lines.push(`  … ${vs.length - 10} more`);
        lines.push('');
      }
      lines.push(`> CI exit code: **1** — fix violations before merging.`);
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { passed: violations.length === 0, rules_checked: rules.length, violation_count: violations.length, violations },
    };
  }
);

// =====================================================================
// TOOL: grasp_issues
// =====================================================================
server.registerTool(
  'grasp_issues',
  {
    title: 'Overlay GitHub Issues on codebase files',
    description:
      'Fetch open GitHub Issues for a repo and map them to files in a Grasp session. ' +
      'Files mentioned most in issues are your "business pain hotspots". ' +
      'Requires a GitHub token for private repos or to avoid rate limits.',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call'),
      owner: z.string().describe('GitHub repo owner (e.g. "facebook")'),
      repo: z.string().describe('GitHub repo name (e.g. "react")'),
      token: z.string().optional().describe('GitHub PAT for private repos / higher rate limits'),
      state: z.enum(['open', 'closed', 'all']).default('open').describe('Issue state to fetch'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max files to return'),
    },
  },
  async ({ session_id, owner, repo, token: ghToken, state, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

    // Fetch up to 3 pages of issues
    const allIssues: any[] = [];
    for (let page = 1; page <= 3; page++) {
      try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=100&page=${page}`, { headers });
        if (!resp.ok) { if (page === 1) return { content: [{ type: 'text', text: `GitHub API error ${resp.status}: ${resp.statusText}` }] }; break; }
        const data: any[] = await resp.json() as any[];
        if (!Array.isArray(data) || data.length === 0) break;
        allIssues.push(...data);
        if (data.length < 100) break;
      } catch (err: any) { return { content: [{ type: 'text', text: `Fetch error: ${err.message}` }] }; }
    }

    // Map issues to files
    const mentionMap = new Map<string, { count: number; issues: number[] }>();
    for (const issue of allIssues) {
      const text = `${issue.title || ''} ${issue.body || ''}`;
      for (const f of result.files) {
        const fname = f.path.split('/').pop() || f.name;
        if (text.includes(fname) || (f.path.includes('/') && text.includes(f.path))) {
          const entry = mentionMap.get(f.path) || { count: 0, issues: [] };
          entry.count++;
          entry.issues.push(issue.number);
          mentionMap.set(f.path, entry);
        }
      }
    }

    const mentioned = Array.from(mentionMap.entries())
      .map(([path, v]) => ({ path, count: v.count, issues: v.issues.slice(0, 5) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const lines = [
      `## GitHub Issues Overlay — ${owner}/${repo}`,
      `**Total issues fetched:** ${allIssues.length} | **Files mentioned:** ${mentionMap.size}`,
      '',
    ];
    if (mentioned.length === 0) {
      lines.push('No files were mentioned in the issues (by file name or path).');
    } else {
      lines.push('| File | Issue mentions | Issue numbers |');
      lines.push('|------|---------------|---------------|');
      mentioned.forEach(f => lines.push(`| \`${f.path}\` | ${f.count} | ${f.issues.map(n => `#${n}`).join(', ')} |`));
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { total_issues: allIssues.length, files_mentioned: mentionMap.size, files: mentioned },
    };
  }
);

// =====================================================================
// TOOL: grasp_contributors
// =====================================================================
server.registerTool(
  'grasp_contributors',
  {
    title: 'Team contributor ownership per file',
    description:
      'Show which team members own the most code, identify bus-factor files (single contributor), ' +
      'and reveal team silos. Uses git history from a local repo. ' +
      'Returns per-contributor stats and files with single-author risk.',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call (local repo only)'),
      min_churn: z.number().int().min(0).default(0).describe('Only show files with at least this many commits'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max files to return'),
    },
  },
  async ({ session_id, min_churn, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    if (result.sourceType !== 'local') return { content: [{ type: 'text', text: 'grasp_contributors requires a local repo analysis (not GitHub).' }] };

    const filesWithOwner = result.files.filter(f => (f as any).topContributor);
    if (filesWithOwner.length === 0) return { content: [{ type: 'text', text: 'No contributor data available. Ensure the repo has git history.' }] };

    // Aggregate by contributor
    const contributorMap = new Map<string, { files: number; totalChurn: number }>();
    for (const f of filesWithOwner) {
      const owner = (f as any).topContributor as string;
      const entry = contributorMap.get(owner) || { files: 0, totalChurn: 0 };
      entry.files++;
      entry.totalChurn += (f as any).churn || 0;
      contributorMap.set(owner, entry);
    }

    const contributors = Array.from(contributorMap.entries())
      .map(([email, s]) => ({ email, files: s.files, totalChurn: s.totalChurn }))
      .sort((a, b) => b.files - a.files);

    // Bus-factor files: single contributor + high churn
    const busFactorFiles = filesWithOwner
      .filter(f => (f as any).contributorCount === 1 && ((f as any).churn || 0) >= Math.max(1, min_churn))
      .sort((a: any, b: any) => (b.churn || 0) - (a.churn || 0))
      .slice(0, limit);

    const lines: string[] = [`## Team Contributor Ownership — ${session_id}`, ''];
    lines.push('### Contributors (by files owned)\n');
    lines.push('| Contributor | Files owned | Total churn |');
    lines.push('|------------|-------------|-------------|');
    contributors.forEach(c => lines.push(`| ${c.email.split('@')[0]} | ${c.files} | ${c.totalChurn} |`));
    lines.push('');

    if (busFactorFiles.length > 0) {
      lines.push(`### ⚠️ Bus-factor files (single contributor, ${busFactorFiles.length} files)\n`);
      busFactorFiles.forEach((f: any) => lines.push(`  - \`${f.path}\` — owner: ${(f.topContributor as string).split('@')[0]} (${f.churn || 0} commits)`));
      lines.push('');
      lines.push('> These files have only one person who understands them. Spreading knowledge reduces risk.');
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { contributors, bus_factor_files: busFactorFiles.map((f: any) => ({ path: f.path, owner: f.topContributor, churn: f.churn || 0 })) },
    };
  }
);

// =====================================================================
// TOOL: grasp_bundle
// =====================================================================
server.registerTool(
  'grasp_bundle',
  {
    title: 'Analyse bundle size contribution per file',
    description:
      'Parse a webpack/rollup/esbuild stats.json and map bundle sizes onto the files in a Grasp session. ' +
      'Returns per-file bundle size sorted largest-first. ' +
      'Helps identify which files contribute most to final bundle weight.',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call'),
      stats_file: z.string().describe('Absolute path to webpack stats.json or rollup-plugin-visualizer output'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max files to return'),
    },
  },
  async ({ session_id, stats_file, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    let statsObj: any;
    try {
      const fs = await import('fs');
      statsObj = JSON.parse(fs.readFileSync(stats_file, 'utf-8'));
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Cannot read stats file: ${err.message}` }] };
    }

    // Parse bundle sizes
    const bundleMap = new Map<string, number>();
    if (Array.isArray(statsObj.modules)) {
      // webpack --json format
      for (const mod of statsObj.modules) {
        if (mod.name && typeof mod.size === 'number') {
          const p = mod.name.replace(/^[.!]+\/+/, '').replace(/\s*\+\s*\d+\s*modules?$/, '').trim();
          if (!p.startsWith('node_modules')) bundleMap.set(p, (bundleMap.get(p) || 0) + mod.size);
        }
      }
    } else {
      // rollup-plugin-visualizer
      for (const chunk of Object.values(statsObj)) {
        if (chunk && typeof chunk === 'object' && !Array.isArray(chunk)) {
          for (const [k, v] of Object.entries(chunk as Record<string, any>)) {
            if (v?.renderedLength) { const p = k.replace(/^[./]+/, ''); if (p) bundleMap.set(p, v.renderedLength); }
          }
        }
      }
    }

    if (bundleMap.size === 0) return { content: [{ type: 'text', text: 'No module size data found. Supports webpack --json and rollup-plugin-visualizer formats.' }] };

    // Match to session files
    const matched: Array<{ path: string; size: number; churn: number }> = [];
    for (const f of result.files) {
      let size = bundleMap.get(f.path) || 0;
      if (!size) { for (const [k, v] of bundleMap) { if (k.endsWith('/' + f.path) || k.endsWith(f.path)) { size = v; break; } } }
      if (size > 0) matched.push({ path: f.path, size, churn: (f as any).churn || 0 });
    }

    matched.sort((a, b) => b.size - a.size);
    const totalSize = matched.reduce((s, f) => s + f.size, 0);
    const fmt = (b: number) => b < 1024 ? `${b}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1024 / 1024).toFixed(2)}MB`;
    const shown = matched.slice(0, limit);

    const lines = [`## Bundle Size Analysis — ${session_id}`, `**Stats file:** ${stats_file}`, `**Total matched:** ${matched.length} files · **Total size:** ${fmt(totalSize)}`, ''];
    lines.push('| File | Size | % of total | Churn |');
    lines.push('|------|------|------------|-------|');
    for (const f of shown) {
      const pct = ((f.size / totalSize) * 100).toFixed(1);
      lines.push(`| \`${f.path}\` | ${fmt(f.size)} | ${pct}% | ${f.churn} |`);
    }
    if (matched.length > limit) lines.push(`_… ${matched.length - limit} more files_`);

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { matched: matched.length, total_bytes: totalSize, files: shown },
    };
  }
);

// =====================================================================
// TOOL: grasp_dep_impact
// =====================================================================
server.registerTool(
  'grasp_dep_impact',
  {
    title: 'Dependency update impact analysis',
    description:
      'Find all files that import a given npm/pip/go package and show the blast radius of upgrading or removing it. ' +
      'Scans file content for import/require/from statements matching the package name. ' +
      'Returns affected files sorted by churn (riskiest changes first), plus the transitive blast radius.',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call'),
      package: z.string().describe('Package name to check (e.g. "react", "lodash", "express")'),
      include_transitive: z.boolean().default(true).describe('Also include files that depend on the direct importers (transitive blast radius)'),
    },
  },
  async ({ session_id, package: pkg, include_transitive }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    // Scan file content for import patterns
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importRe = new RegExp(`(?:from|require|import)\\s*['"]${escaped}(?:/|['"])`, 'i');

    const directFiles: string[] = [];
    for (const f of result.files) {
      if (f.content && importRe.test(f.content)) directFiles.push(f.path);
    }

    // Build reverse dep map for transitive blast radius
    const dependents = new Map<string, Set<string>>();
    for (const conn of result.connections) {
      if (!dependents.has(conn.source)) dependents.set(conn.source, new Set());
      dependents.get(conn.source)!.add(conn.target);
    }

    function getTransitive(paths: string[]): string[] {
      const visited = new Set(paths);
      const queue = [...paths];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const dep of (dependents.get(cur) || [])) {
          if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
        }
      }
      return Array.from(visited);
    }

    const transitiveFiles = include_transitive ? getTransitive(directFiles) : directFiles;
    const transitiveOnly = transitiveFiles.filter(p => !directFiles.includes(p));

    // Enrich with metadata
    const fileMap = new Map(result.files.map(f => [f.path, f]));
    const enrich = (paths: string[]) => paths.map(p => {
      const f = fileMap.get(p);
      return { path: p, churn: (f as any)?.churn || 0, complexity: (f as any)?.complexity?.score || 0, layer: f?.layer || '?' };
    }).sort((a, b) => b.churn - a.churn);

    const directEnriched = enrich(directFiles);
    const transitiveEnriched = enrich(transitiveOnly);

    // Check package.json for version
    let currentVersion = 'unknown';
    const pkgJsonFile = result.files.find(f => f.name === 'package.json' && (f.path === 'package.json' || f.path.endsWith('/package.json')));
    if (pkgJsonFile?.content) {
      try {
        const obj = JSON.parse(pkgJsonFile.content);
        currentVersion = (obj.dependencies?.[pkg] || obj.devDependencies?.[pkg] || obj.peerDependencies?.[pkg] || 'not in package.json');
      } catch { /* ignore */ }
    }

    const lines: string[] = [];
    lines.push(`## Dependency Impact — \`${pkg}\``);
    lines.push(`**Current version:** ${currentVersion}  |  **Session:** ${session_id}`);
    lines.push(`**Direct importers:** ${directFiles.length}  |  **Transitive blast radius:** ${transitiveFiles.length} files`);
    lines.push('');

    if (directFiles.length === 0) {
      lines.push(`No files import \`${pkg}\`. Safe to upgrade or remove.`);
    } else {
      lines.push('### Direct importers (change these first)\n');
      lines.push('| File | Layer | Churn | Complexity |');
      lines.push('|------|-------|-------|------------|');
      directEnriched.slice(0, 20).forEach(f => lines.push(`| \`${f.path}\` | ${f.layer} | ${f.churn} | ${f.complexity} |`));
      if (directEnriched.length > 20) lines.push(`_… ${directEnriched.length - 20} more_`);
      lines.push('');

      if (include_transitive && transitiveEnriched.length > 0) {
        lines.push(`### Transitive (${transitiveEnriched.length} more files that depend on direct importers)\n`);
        transitiveEnriched.slice(0, 10).forEach(f => lines.push(`  - \`${f.path}\` (churn: ${f.churn})`));
        if (transitiveEnriched.length > 10) lines.push(`  … ${transitiveEnriched.length - 10} more`);
        lines.push('');
      }

      lines.push(`### Upgrade checklist`);
      lines.push(`1. Update \`${pkg}\` in package.json`);
      lines.push(`2. Run tests in ${directFiles.length} direct-importer file${directFiles.length !== 1 ? 's' : ''}`);
      lines.push(`3. Check transitive dependents (${transitiveFiles.length} total)`);
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { package: pkg, current_version: currentVersion, direct_count: directFiles.length, transitive_count: transitiveFiles.length, direct_files: directEnriched, transitive_files: transitiveEnriched.slice(0, 50) },
    };
  }
);

// =====================================================================
// TOOL: grasp_coverage
// =====================================================================
server.registerTool(
  'grasp_coverage',
  {
    title: 'Overlay test coverage on analysis',
    description:
      'Parse a coverage file (lcov.info or Istanbul/NYC coverage-final.json) and return per-file coverage ' +
      'percentages mapped against files in a Grasp session. Use after grasp_analyze to get a combined ' +
      '"coverage + hotspot" view. Files with high churn AND low coverage are your riskiest files.',
    inputSchema: {
      session_id: z.string().describe('Session ID from a prior grasp_analyze call'),
      coverage_file: z.string().describe('Absolute path to lcov.info or coverage-final.json / coverage-summary.json'),
      min_pct: z.number().int().min(0).max(100).default(0).describe('Only return files below this coverage threshold (0 = all files)'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max files to return'),
    },
  },
  async ({ session_id, coverage_file, min_pct, limit }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    let rawText: string;
    try {
      const fs = await import('fs');
      rawText = fs.readFileSync(coverage_file, 'utf-8');
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Cannot read coverage file: ${err.message}` }] };
    }

    // Parse lcov or Istanbul JSON
    const covMap = new Map<string, number>();
    if (coverage_file.endsWith('.json')) {
      try {
        const obj = JSON.parse(rawText);
        for (const [k, v] of Object.entries(obj as Record<string, any>)) {
          if (k === 'total') continue;
          const pct = v?.lines?.pct ?? v?.statements?.pct;
          if (typeof pct === 'number') covMap.set(k, Math.round(pct));
        }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Failed to parse JSON: ${err.message}` }] };
      }
    } else {
      // lcov format
      let cur: string | null = null, hit = 0, found = 0;
      for (const line of rawText.split('\n')) {
        const l = line.trim();
        if (l.startsWith('SF:')) { cur = l.slice(3); hit = 0; found = 0; }
        else if (l.startsWith('DA:')) { found++; const p = l.slice(3).split(','); if (p[1] && parseInt(p[1], 10) > 0) hit++; }
        else if (l === 'end_of_record' && cur) { covMap.set(cur, found > 0 ? Math.round(hit / found * 100) : 0); cur = null; }
      }
    }

    if (covMap.size === 0) return { content: [{ type: 'text', text: 'No coverage data found in file. Supports lcov and Istanbul/NYC JSON formats.' }] };

    // Map coverage onto session files (suffix match)
    const fileCoverage: Array<{ path: string; coverage: number; churn: number; complexity: number }> = [];
    for (const f of result.files) {
      let pct: number | undefined;
      // Exact match first
      if (covMap.has(f.path)) { pct = covMap.get(f.path); }
      else { for (const [k, v] of covMap) { if (k.endsWith('/' + f.path) || k === f.path || k.endsWith(f.path)) { pct = v; break; } } }
      if (pct !== undefined) {
        fileCoverage.push({ path: f.path, coverage: pct, churn: (f as any).churn || 0, complexity: (f as any).complexity?.score || 0 });
      }
    }

    // Sort: lowest coverage first, then by churn desc (riskiest first)
    fileCoverage.sort((a, b) => a.coverage - b.coverage || b.churn - a.churn);

    const filtered = min_pct > 0 ? fileCoverage.filter(f => f.coverage < min_pct) : fileCoverage;
    const shown = filtered.slice(0, limit);
    const matched = fileCoverage.length;
    const avgCov = matched > 0 ? Math.round(fileCoverage.reduce((s, f) => s + f.coverage, 0) / matched) : 0;
    const below50 = fileCoverage.filter(f => f.coverage < 50).length;
    const above80 = fileCoverage.filter(f => f.coverage >= 80).length;

    const lines: string[] = [];
    lines.push(`## Coverage Report — ${session_id}`);
    lines.push(`**Coverage file:** ${coverage_file}`);
    lines.push(`**Matched:** ${matched}/${result.files.length} files | **Avg coverage:** ${avgCov}% | **<50%:** ${below50} | **≥80%:** ${above80}`);
    lines.push('');
    if (min_pct > 0) lines.push(`_Showing files below ${min_pct}% coverage only._`);
    lines.push('');
    lines.push('| File | Coverage | Churn | Complexity |');
    lines.push('|------|----------|-------|------------|');
    for (const f of shown) {
      const risk = f.coverage < 50 && f.churn > 3 ? ' ⚠️' : '';
      lines.push(`| \`${f.path}\` | ${f.coverage}%${risk} | ${f.churn} | ${f.complexity} |`);
    }
    if (filtered.length > limit) lines.push(`\n_… ${filtered.length - limit} more files_`);
    lines.push('');
    lines.push('> ⚠️ = Low coverage + high churn = highest risk. Prioritize testing these files first.');

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { matched, avg_coverage: avgCov, below_50: below50, above_80: above80, files: shown },
    };
  }
);

// =====================================================================
// TOOL: grasp_timeline
// =====================================================================
server.registerTool(
  'grasp_timeline',
  {
    title: 'Git commit timeline for a local repo',
    description: 'Returns the last N git commits for a local path, with per-commit changed files. Use this to understand how the codebase evolved, spot high-churn periods, and identify which files change together.',
    inputSchema: {
      path: z.string().describe('Absolute or relative path to the local git repository'),
      limit: z.number().optional().describe('Max commits to return (default 20, max 100)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ path: repoPath, limit = 20 }) => {
    const n = Math.min(Math.max(1, limit), 100);
    const resolved = repoPath.startsWith('~')
      ? repoPath.replace(/^~/, process.env.HOME || '')
      : repoPath;
    const snapshots = getGitTimeline(resolved, n);

    if (snapshots.length === 0) {
      return { content: [{ type: 'text', text: 'No git history found. Is this a git repository?' }] };
    }

    const lines: string[] = [];
    lines.push(`## Git Timeline — last ${snapshots.length} commits\n`);
    lines.push('| # | Hash | Date | Author | Message | Files | +/- |');
    lines.push('|---|------|------|--------|---------|-------|-----|');
    snapshots.forEach((s, i) => {
      const date = s.date.slice(0, 10);
      const msg = s.message.length > 60 ? s.message.slice(0, 57) + '…' : s.message;
      lines.push(`| ${i + 1} | \`${s.shortHash}\` | ${date} | ${s.author} | ${msg} | ${s.filesChanged} | +${s.additions}/-${s.deletions} |`);
    });

    // Co-change matrix: find files that frequently change together
    const pairs = new Map<string, number>();
    for (const s of snapshots) {
      const fs = s.changedFiles.filter(f => f.match(/\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|cpp|c|h)$/));
      for (let i = 0; i < fs.length; i++) {
        for (let j = i + 1; j < fs.length; j++) {
          const key = [fs[i], fs[j]].sort().join(' ↔ ');
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
    const topPairs = [...pairs.entries()].filter(([,c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topPairs.length > 0) {
      lines.push('\n### Files that frequently change together\n');
      for (const [pair, count] of topPairs) {
        lines.push(`- **${count}x** ${pair}`);
      }
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: { commits: snapshots.length, snapshots, top_co_changes: topPairs.map(([pair, count]) => ({ pair, count })) },
    };
  }
);

// =====================================================================
// TOOL: grasp_similarity
// =====================================================================
server.registerTool(
  'grasp_similarity',
  {
    title: 'Duplicate and semantic similarity analysis',
    description: 'Deep duplicate and code-clone analysis for a session. Returns duplicate function clusters, most-duplicated files, and refactoring recommendations ranked by impact. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      min_similarity: z.number().optional().describe('Minimum similarity 0–100 to report (default 70)'),
      top_n: z.number().optional().describe('Max number of clusters to return (default 20)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, min_similarity = 70, top_n = 20 }) => {
    const result = sessions.get(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const dups = result.duplicates ?? [];
    const filtered = dups
      .filter(d => d.similarity >= min_similarity)
      .sort((a, b) => b.similarity - a.similarity || b.files.length - a.files.length)
      .slice(0, top_n);

    // Per-file duplicate hit count
    const hitMap = new Map<string, number>();
    for (const d of dups) {
      for (const f of d.files) {
        hitMap.set(f.file, (hitMap.get(f.file) ?? 0) + 1);
      }
    }
    const hotFiles = [...hitMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([file, hits]) => ({ file, hits }));

    const nameDups = filtered.filter(d => d.type === 'name');
    const codeDups = filtered.filter(d => d.type === 'code');

    const lines: string[] = [];
    lines.push(`## Similarity Analysis — ${dups.length} duplicate clusters found\n`);
    lines.push(`Min similarity filter: ${min_similarity}% | Showing: ${filtered.length} clusters\n`);

    if (codeDups.length > 0) {
      lines.push('### Code Clones (identical/near-identical blocks)\n');
      for (const d of codeDups) {
        lines.push(`**${d.name}** — ${d.similarity}% similar across ${d.files.length} files`);
        for (const f of d.files) {
          lines.push(`  - \`${f.file}\`${f.line ? ` line ${f.line}` : ''}`);
        }
        lines.push(`  > ${d.suggestion}\n`);
      }
    }

    if (nameDups.length > 0) {
      lines.push('### Naming Clashes (same name, different files)\n');
      for (const d of nameDups) {
        lines.push(`**${d.name}** — in ${d.files.length} files (${d.similarity}% similar)`);
        for (const f of d.files) {
          lines.push(`  - \`${f.file}\``);
        }
      }
    }

    if (hotFiles.length > 0) {
      lines.push('\n### Hottest Files (most duplicate hits)\n');
      lines.push('| Rank | File | Duplicate Hits |');
      lines.push('|------|------|---------------|');
      hotFiles.forEach((f, i) => lines.push(`| ${i + 1} | \`${f.file}\` | ${f.hits} |`));
    }

    lines.push('\n### Refactor Priority\n');
    lines.push('Files with the most duplicate hits are the highest-value refactor targets.');
    lines.push('Extract shared code into utility modules to eliminate redundancy.\n');

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: {
        total_clusters: dups.length,
        code_clones: codeDups.length,
        naming_clashes: nameDups.length,
        hot_files: hotFiles,
        clusters: filtered,
      },
    };
  }
);

// =====================================================================
// Start server
// =====================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[grasp] MCP server running via stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[grasp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
