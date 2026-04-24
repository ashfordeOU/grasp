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

// Tree-sitter extractor modules — self-register via registerExtractor() on import
import './tree-sitter/extractors/python';
import './tree-sitter/extractors/go';
import './tree-sitter/extractors/java';
import './tree-sitter/extractors/kotlin';
import './tree-sitter/extractors/rust';
import './tree-sitter/extractors/c';
import './tree-sitter/extractors/cpp';
import './tree-sitter/extractors/csharp';
import './tree-sitter/extractors/ruby';

import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  analyzeSource,
  parseSource,
  buildFileMetrics,
  findDependencyPath,
  THRESHOLDS,
} from './analyzer.js';
import type { AnalysisResult, Connection } from './types.js';
import { getGitTimeline } from './sources/local.js';
import { toSarif } from './sarif.js';
import type { DeadPackage } from './types.js';
import { parseTraceFile, mergeTraceWithStatic, hotFiles } from './runtime-tracer.js';
import { parseAnyTrace } from './trace-parser.js';
import { buildCouplingReport, findSharedTableClusters } from './db-coupling.js';
import { buildMigrationPlan } from './migration-planner.js';
import { parseOpenApiSpec, parseGraphQlSchema, scanSourceRoutes, buildApiSurfaceReport } from './api-surface.js';
import { SessionStore } from './session-store.js';
import { scanEnvVars } from './env-scanner.js';
import { mapEvents } from './event-mapper.js';
import { trackFlags } from './flag-tracker.js';
import { analyzePerfPatterns } from './perf-analyzer.js';
import { scanLicenses } from './license-scanner.js';
import { generateMermaid, generateC4Context, generateC4Container, generateC4Component } from './diagram-gen.js';

const sessionStore = new SessionStore();
sessionStore.prune().catch(() => {}); // background prune on startup

async function getSession(id: string): Promise<AnalysisResult | null> {
  return sessionStore.get(id);
}

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
  - source (string): GitHub repo as "owner/repo" or "https://github.com/owner/repo", GitLab URL, Bitbucket URL (bitbucket.org/workspace/repo), Azure DevOps URL (dev.azure.com/org/project/_git/repo), Gitea URL, GitHub Enterprise URL, OR local path like "/path/to/repo" or "./my-project"
  - token (string, optional): GitHub personal access token — increases rate limit from 60 to 5000 req/hour. Required for large repos.
  - ghe_token / ghe_host: GitHub Enterprise Server PAT + hostname
  - gitlab_token / gitlab_host: GitLab PAT + optional custom hostname
  - bitbucket_username / bitbucket_password: Bitbucket credentials
  - azure_pat: Azure DevOps PAT
  - gitea_token / gitea_host: Gitea token + optional host

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
      source: z.string().describe(
        'Repo URL or path: GitHub "owner/repo", GitHub URL, GitLab URL, Bitbucket URL (bitbucket.org/workspace/repo), Azure DevOps URL (dev.azure.com/org/project/_git/repo), Gitea URL, GitHub Enterprise URL, or local filesystem path'
      ),
      token: z.string().optional().describe('GitHub personal access token'),
      ghe_token: z.string().optional().describe('GitHub Enterprise Server PAT'),
      ghe_host: z.string().optional().describe('GitHub Enterprise Server hostname, e.g. github.mycompany.com (auto-detected from URL if omitted)'),
      gitlab_token: z.string().optional().describe('GitLab personal access token (glpat-...)'),
      gitlab_host: z.string().optional().describe('Self-hosted GitLab hostname, e.g. gitlab.corp.com (auto-detected from URL if omitted)'),
      bitbucket_username: z.string().optional().describe('Bitbucket username'),
      bitbucket_password: z.string().optional().describe('Bitbucket app password'),
      azure_pat: z.string().optional().describe('Azure DevOps personal access token'),
      gitea_token: z.string().optional().describe('Gitea access token'),
      gitea_host: z.string().optional().describe('Gitea base URL, e.g. https://git.mycompany.com (auto-detected from URL if omitted)'),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ source, token, ghe_token, ghe_host, gitlab_token, gitlab_host, bitbucket_username, bitbucket_password, azure_pat, gitea_token, gitea_host }) => {
    const repoSource = parseSource(source, token, gitlab_token, gitlab_host, {
      gheToken: ghe_token,
      gheHost: ghe_host,
      bbUsername: bitbucket_username,
      bbPassword: bitbucket_password,
      azurePat: azure_pat,
      giteaToken: gitea_token,
      giteaHost: gitea_host,
    });
    if (!repoSource) {
      return { content: [{ type: 'text', text: `Error: Could not parse source "${source}". Use "owner/repo", a GitHub URL, or a local path.` }] };
    }

    try {
      const result = await analyzeSource(repoSource, (msg) => {
        process.stderr.write(`[grasp] ${msg}\n`);
      });

      await sessionStore.set(result.sessionId, result);

      // Fire-and-forget OpenSSF scorecard
      const ossRepo = typeof source === 'string' && !source.startsWith('/') ? source.replace(/^gitlab\./, 'github.com/') : null;
      if (ossRepo) {
        fetch(`https://api.securityscorecards.dev/projects/github.com/${encodeURIComponent(ossRepo)}`)
          .then(r => r.json())
          .then((sc: any) => {
            sessionStore.get(result.sessionId).then(sess => {
              if (sess && sc?.score) (sess as any).openssf = { score: sc.score, checks: sc.checks };
            }).catch(() => {});
          }).catch(() => {});
      }

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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    description: `List all persisted analysis sessions. Sessions survive server restarts and expire after 7 days (configurable via GRASP_SESSION_TTL env var).

Returns:
  { "sessions": [{ "session_id", "source", "analyzed_at", "last_accessed", "size_kb", "health_grade", "file_count" }], "storage": "~/.grasp/sessions/" }`,
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
  const list = await sessionStore.list();
  const output = {
    sessions: list.map((s) => ({
      session_id: s.id,
      repo: s.repo,
      created_at: new Date(s.created_at * 1000).toISOString(),
    })),
    count: list.length,
    storage: process.env.GRASP_DB ?? path.join(require('os').homedir(), '.grasp', 'sessions.db'),
    note: 'Sessions persist across server restarts (SQLite). Default TTL: 30 days.',
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
    const a = await getSession(session_id_a);
    const b = await getSession(session_id_b);
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
    const result = await getSession(session_id);
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
    const cycleCount = result.summary.circularDepCount;
    if (cycleCount > 0) {
      const cyclicIssue = result.issues.find((i) => i.title.toLowerCase().includes('circular'));
      const cycleFiles = cyclicIssue?.items.slice(0, 10).map((i) => i.name) ?? [];
      suggestions.push({
        priority: 'critical',
        title: `Break ${cycleCount} circular dependenc${cycleCount === 1 ? 'y' : 'ies'}`,
        rationale: 'Circular dependencies prevent tree-shaking, complicate testing, and can cause initialisation bugs.',
        action: 'Extract shared code into a new leaf module that both files can import from without creating a cycle.',
        impact: 'Improves testability, enables lazy loading, reduces bundle size',
        files: cycleFiles,
      });
    }

    // 2. God files (too many functions) — exempt index.* entry points
    const ENTRY_POINT_RE = /^index\.[jt]sx?$/i;
    const metrics = buildFileMetrics(result);
    const godFiles = metrics
      .filter((m) => m.functionCount > THRESHOLDS.maxFunctionsPerFile && !ENTRY_POINT_RE.test(m.name))
      .sort((a, b) => b.functionCount - a.functionCount);
    if (godFiles.length > 0) {
      suggestions.push({
        priority: 'high',
        title: `Split ${godFiles.length} god file${godFiles.length === 1 ? '' : 's'} with ${THRESHOLDS.maxFunctionsPerFile}+ functions`,
        rationale: 'Files with too many responsibilities are hard to navigate, test, and reuse.',
        action: 'Group related functions by feature or layer and extract to separate modules.',
        impact: 'Improves readability, makes unit testing easier, reduces merge conflicts',
        files: godFiles.slice(0, 5).map((m) => `${m.path} (${m.functionCount} fns)`),
      });
    }

    // 3. High fan-in files (bottleneck dependencies)
    const highFanIn = metrics.filter((m) => m.fanIn > THRESHOLDS.maxCouplingIn).sort((a, b) => b.fanIn - a.fanIn);
    if (highFanIn.length > 0) {
      suggestions.push({
        priority: 'high',
        title: `Reduce coupling on ${highFanIn.length} highly-imported file${highFanIn.length === 1 ? '' : 's'}`,
        rationale: `Files imported by ${THRESHOLDS.maxCouplingIn}+ others are change-risk bottlenecks — any modification ripples widely.`,
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

    // Build fan-in map for effort scoring
    const suggestFanInMap = new Map<string, number>();
    for (const conn of result.connections) {
      suggestFanInMap.set(conn.target, (suggestFanInMap.get(conn.target) ?? 0) + 1);
    }

    // Annotate each suggestion with effort/impact/ratio
    const scoredSuggestions = (suggestions as any[]).map((s: any) => {
      const file = result.files.find((f: any) => f.path === s.file);
      const fanIn = suggestFanInMap.get(s.file ?? '') ?? 0;
      const fnCount = (file as any)?.functions?.length ?? 1;
      const churnScore = (file as any)?.churn ?? 0;
      const effort = Math.min(100, Math.round(fanIn * 3 + fnCount * 0.5 + churnScore * 0.2));
      const severityWeight = s.severity === 'critical' ? 4 : s.severity === 'high' ? 3 : s.severity === 'medium' ? 2 : 1;
      const impact = Math.min(100, Math.round(severityWeight * 20 + fanIn * 2));
      const effortToImpactRatio = effort > 0 ? Math.round((impact / effort) * 100) / 100 : impact;
      return { ...s, effort, impact, effortToImpactRatio };
    });
    scoredSuggestions.sort((a: any, b: any) => b.effortToImpactRatio - a.effortToImpactRatio);

    const output = { session_id, source: result.source, suggestion_count: scoredSuggestions.length, suggestions: scoredSuggestions };
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
    const result = await getSession(session_id);
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
    await sessionStore.set(newSessionId, currentResult);

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
      const baseline = await getSession(baseline_session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    if (result.sourceType !== 'local') return { content: [{ type: 'text', text: 'grasp_contributors requires a local repo analysis (not GitHub).' }] };

    const filesWithOwner = result.files.filter(f => (f as any).topContributor);
    if (filesWithOwner.length === 0) return { content: [{ type: 'text', text: 'No contributor data available. Ensure the repo has git history.' }] };

    // Aggregate by contributor
    const contributorMap = new Map<string, { files: number; totalChurn: number; filePaths: string[] }>();
    for (const f of filesWithOwner) {
      const owner = (f as any).topContributor as string;
      const entry = contributorMap.get(owner) || { files: 0, totalChurn: 0, filePaths: [] };
      entry.files++;
      entry.totalChurn += (f as any).churn || 0;
      entry.filePaths.push(f.path);
      contributorMap.set(owner, entry);
    }

    const contributors = Array.from(contributorMap.entries())
      .map(([email, s]) => ({
        email,
        files: s.files,
        totalChurn: s.totalChurn,
        impact_score: s.filePaths.reduce((sum, filePath) => {
          return sum + (result.connections ?? []).filter(c => c.source === filePath).length;
        }, 0),
      }))
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
    const result = await getSession(session_id);
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
// TOOL: grasp_pr_comment
// =====================================================================
server.registerTool(
  'grasp_pr_comment',
  {
    title: 'Generate a PR comment body from a Grasp analysis session',
    description: 'Generates a formatted GitHub PR comment with health score, grade, key metrics, and changed-file impact. Optionally accepts a list of changed files to show blast radius. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      changed_files: z.array(z.string()).optional().describe('List of relative file paths changed in this PR (from git diff)'),
      pr_title: z.string().optional().describe('PR title to include in the comment'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, changed_files = [], pr_title }) => {
    const result = await getSession(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const s = result.summary;
    const scoreNum = s.healthScore;
    const gradeEmoji: Record<string, string> = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴' };
    const emoji = gradeEmoji[s.healthGrade] ?? '⚪';
    const bar = '█'.repeat(Math.round(scoreNum / 10)) + '░'.repeat(10 - Math.round(scoreNum / 10));

    // Blast radius for changed files
    const changedSet = new Set(changed_files.map(f => f.replace(/\\/g, '/')));
    const blastMap = new Map<string, number>();
    for (const c of result.connections) {
      const src = c.source;
      const tgt = c.target;
      if (changedSet.has(src)) blastMap.set(tgt, (blastMap.get(tgt) ?? 0) + 1);
    }
    const impactedFiles = [...blastMap.entries()]
      .filter(([f]) => !changedSet.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const lines: string[] = [];
    lines.push('## 📊 Grasp Health Report' + (pr_title ? ` — ${pr_title}` : ''));
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| **Health Score** | \`${bar}\` **${scoreNum}/100** |`);
    lines.push(`| **Grade** | ${emoji} **${s.healthGrade}** |`);
    lines.push(`| **Files** | ${s.fileCount} (${s.functionCount} functions) |`);
    lines.push(`| **Architecture Issues** | ${s.issueCount}${s.criticalIssueCount > 0 ? ` ⚠️ ${s.criticalIssueCount} critical` : ''} |`);
    lines.push(`| **Circular Deps** | ${s.circularDepCount}${s.circularDepCount === 0 ? ' ✓' : ''} |`);
    lines.push(`| **Security** | ${s.securityIssueCount}${s.securityIssueCount > 0 ? ' 🔐' : ' ✓'} |`);
    lines.push(`| **Layers** | ${(s.layers ?? []).join(', ') || 'none'} |`);

    if (changed_files.length > 0) {
      lines.push('');
      lines.push('### 📝 Changed Files in This PR');
      lines.push('');
      changed_files.slice(0, 20).forEach(f => lines.push(`- \`${f}\``));
      if (changed_files.length > 20) lines.push(`_…and ${changed_files.length - 20} more_`);
    }

    if (impactedFiles.length > 0) {
      lines.push('');
      lines.push('### 💥 Blast Radius (files that import from changed files)');
      lines.push('');
      lines.push('| File | Import Count |');
      lines.push('|------|-------------|');
      impactedFiles.forEach(([f, n]) => lines.push(`| \`${f}\` | ${n} |`));
      lines.push('');
      lines.push(`> ⚠️ **${impactedFiles.length} additional files** may be affected by these changes. Review them carefully.`);
    }

    lines.push('');
    lines.push('<details><summary>ℹ️ What is Grasp?</summary>');
    lines.push('');
    lines.push('[Grasp](https://github.com/ashfordeOU/grasp) analyses codebase architecture: dead code, circular deps, layer violations, and security patterns.');
    lines.push('</details>');

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        health_score: scoreNum,
        grade: s.healthGrade,
        changed_files: changed_files.length,
        blast_radius: impactedFiles.length,
        comment_body: lines.join('\n'),
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_embed
// =====================================================================
server.registerTool(
  'grasp_embed',
  {
    title: 'Generate shareable embed code for a repo',
    description: 'Generates iframe embed code, a README badge, and a direct shareable link for any public GitHub repository so it can be visualized via Grasp without installation.',
    inputSchema: {
      repo: z.string().describe('GitHub repo in "owner/repo" format or full GitHub URL'),
      height: z.number().optional().describe('Iframe height in pixels (default 600)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ repo, height = 600 }) => {
    // Normalize repo
    let owner = '', repoName = '';
    const urlMatch = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (urlMatch) { owner = urlMatch[1]; repoName = urlMatch[2].replace(/\.git$/, ''); }
    else {
      const parts = repo.replace(/^https?:\/\/github\.com\//, '').split('/');
      if (parts.length >= 2) { owner = parts[0]; repoName = parts[1].replace(/\.git$/, ''); }
    }

    if (!owner || !repoName) {
      return { content: [{ type: 'text', text: `Could not parse repo from "${repo}". Use "owner/repo" format.` }] };
    }

    const GRASP_URL = 'https://ashforde.github.io/grasp/';
    const src = `${GRASP_URL}?repo=${owner}/${repoName}`;

    const iframe = `<iframe
  src="${src}"
  width="100%"
  height="${height}"
  frameborder="0"
  allow="clipboard-write"
  title="Grasp — ${owner}/${repoName} Architecture"
></iframe>`;

    const badge = `[![Grasp Architecture](${GRASP_URL}badge.svg)](${src})`;

    const reactSnippet = `import { useEffect, useRef } from 'react';

export function GraspEmbed() {
  return (
    <iframe
      src="${src}"
      style={{ width: '100%', height: '${height}px', border: 'none' }}
      title="Grasp — ${owner}/${repoName}"
      allow="clipboard-write"
    />
  );
}`;

    const lines = [
      `## Grasp Embed: \`${owner}/${repoName}\`\n`,
      '### Direct Link\n',
      `[${src}](${src})\n`,
      '### iframe (HTML)\n',
      '```html\n' + iframe + '\n```\n',
      '### README Badge (Markdown)\n',
      '```markdown\n' + badge + '\n```\n',
      '### React Component\n',
      '```tsx\n' + reactSnippet + '\n```\n',
      '### Notes\n',
      '- Works for any **public** GitHub repository',
      '- No backend — the embed runs entirely in the browser',
      '- Graph loads automatically with full analysis (files, layers, deps)',
      '- Add `&token=YOUR_PAT` to the URL for private repos (use caution)',
    ];

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: { owner, repo: repoName, src, iframe, badge, react_snippet: reactSnippet },
    };
  }
);

// =====================================================================
// TOOL: grasp_refactor
// =====================================================================
server.registerTool(
  'grasp_refactor',
  {
    title: 'Refactor wizard — generate a step-by-step refactor plan',
    description: 'Analyzes a file or function within a session and produces a prioritized, step-by-step refactor plan. Considers complexity, fan-in/out, duplicates, layer violations, and circular deps. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      target: z.string().describe('Relative file path or function name to refactor'),
      goal: z.string().optional().describe('Optional refactor goal, e.g. "reduce complexity", "extract shared logic", "improve testability"'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, target, goal }) => {
    const result = await getSession(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const targetLower = target.toLowerCase();

    // Find matching file(s)
    const matchedFiles = result.files.filter(f =>
      f.path === target || f.path.toLowerCase().includes(targetLower) || f.name.toLowerCase().includes(targetLower)
    );

    // Find matching functions
    const matchedFns = result.files.flatMap(f =>
      f.functions.filter(fn => fn.name.toLowerCase().includes(targetLower)).map(fn => ({ ...fn, filePath: f.path }))
    );

    if (matchedFiles.length === 0 && matchedFns.length === 0) {
      return { content: [{ type: 'text', text: `No file or function matching "${target}" found in session. Run grasp_analyze first.` }] };
    }

    const lines: string[] = [];
    lines.push(`# Refactor Plan: \`${target}\`\n`);
    if (goal) lines.push(`**Goal:** ${goal}\n`);

    // Build full metrics for the session
    const connections = result.connections;
    const fanInMap = new Map<string, number>();
    const fanOutMap = new Map<string, number>();
    for (const c of connections) {
      fanOutMap.set(c.source, (fanOutMap.get(c.source) ?? 0) + 1);
      fanInMap.set(c.target, (fanInMap.get(c.target) ?? 0) + 1);
    }

    // Duplicate hits per file
    const dupHits = new Map<string, number>();
    for (const d of result.duplicates ?? []) {
      for (const f of d.files) dupHits.set(f.file, (dupHits.get(f.file) ?? 0) + 1);
    }

    for (const file of matchedFiles.slice(0, 3)) {
      const fanIn = fanInMap.get(file.path) ?? 0;
      const fanOut = fanOutMap.get(file.path) ?? 0;
      const cx = typeof file.complexity === 'object' ? (file.complexity as any)?.score : file.complexity;
      const dups = dupHits.get(file.path) ?? 0;
      const layerViolations = result.layerViolations?.filter(v => v.from === file.path || v.to === file.path) ?? [];
      const circularInvolvement = connections.filter(c => c.source === file.path || c.target === file.path).length;

      lines.push(`## File: \`${file.path}\`\n`);
      lines.push('### Current State\n');
      lines.push(`| Metric | Value | Signal |`);
      lines.push(`|--------|-------|--------|`);
      lines.push(`| Lines | ${file.lines} | ${file.lines > 500 ? '🔴 Too large — split' : file.lines > 300 ? '🟡 Consider splitting' : '🟢 OK'} |`);
      lines.push(`| Functions | ${file.functions.length} | ${file.functions.length > 15 ? '🔴 Too many responsibilities' : '🟢 OK'} |`);
      lines.push(`| Complexity | ${cx ?? 'n/a'} | ${cx > 20 ? '🔴 Critical' : cx > 10 ? '🟡 High' : '🟢 OK'} |`);
      lines.push(`| Fan-in (used by) | ${fanIn} | ${fanIn > 10 ? '🔴 High coupling — risky to change' : '🟢 OK'} |`);
      lines.push(`| Fan-out (uses) | ${fanOut} | ${fanOut > 10 ? '🟡 Many dependencies' : '🟢 OK'} |`);
      lines.push(`| Churn | ${file.churn} | ${file.churn > 50 ? '🔴 Hot file — high risk' : '🟢 OK'} |`);
      lines.push(`| Duplicate hits | ${dups} | ${dups > 0 ? `🟡 ${dups} duplicate clusters` : '🟢 None'} |`);
      lines.push(`| Layer violations | ${layerViolations.length} | ${layerViolations.length > 0 ? '🔴 Architecture violations' : '🟢 Clean'} |`);
      lines.push('');

      // Generate steps
      lines.push('### Recommended Steps\n');
      let step = 1;

      if (layerViolations.length > 0) {
        lines.push(`**Step ${step++}: Fix Layer Violations (${layerViolations.length} violations)**`);
        for (const v of layerViolations.slice(0, 3)) {
          lines.push(`  - \`${v.fn}\` crosses \`${v.fromLayer}\` → \`${v.toLayer}\` boundary`);
        }
        lines.push(`  > Move cross-layer calls behind interfaces or extract to a service layer.\n`);
      }

      if (dups > 0) {
        const dupClusters = (result.duplicates ?? []).filter(d => d.files.some(f => f.file === file.path));
        lines.push(`**Step ${step++}: Extract Duplicated Logic (${dups} clusters)**`);
        for (const d of dupClusters.slice(0, 3)) {
          lines.push(`  - \`${d.name}\`: ${d.similarity}% similar, appears in ${d.files.length} files`);
        }
        lines.push(`  > Create a shared utility module and import from all affected files.\n`);
      }

      if (file.lines > 500 || file.functions.length > 15) {
        lines.push(`**Step ${step++}: Split the File**`);
        const fnGroups: Record<string, string[]> = {};
        for (const fn of file.functions) {
          const g = fn.layer || fn.folder || 'core';
          if (!fnGroups[g]) fnGroups[g] = [];
          fnGroups[g].push(fn.name);
        }
        for (const [group, fns] of Object.entries(fnGroups).slice(0, 4)) {
          lines.push(`  - \`${file.name.replace(/\.[^.]+$/, '')}.${group}.ts\`: ${fns.slice(0,4).join(', ')}${fns.length > 4 ? '…' : ''}`);
        }
        lines.push(`  > Separate by concern. Each file should have one clear responsibility.\n`);
      }

      if ((cx ?? 0) > 10) {
        const complexFns = file.functions
          .filter(fn => (fn as any).complexity > 5)
          .sort((a: any, b: any) => b.complexity - a.complexity)
          .slice(0, 5);
        lines.push(`**Step ${step++}: Reduce Complexity**`);
        if (complexFns.length > 0) {
          for (const fn of complexFns) {
            lines.push(`  - \`${fn.name}()\` at line ${fn.line} — extract branches into smaller functions`);
          }
        } else {
          lines.push(`  - Break down functions with > 3 branches into smaller helpers`);
        }
        lines.push(`  > Target: cyclomatic complexity ≤ 10 per function.\n`);
      }

      if (fanIn > 10) {
        lines.push(`**Step ${step++}: Reduce Coupling (${fanIn} dependents)**`);
        lines.push(`  - Add an interface/abstraction layer so dependents don't import directly`);
        lines.push(`  - Consider using dependency injection to invert control`);
        lines.push(`  > High fan-in means changes here break many files. Protect with a stable contract.\n`);
      }

      lines.push(`**Step ${step++}: Add Tests**`);
      lines.push(`  - Cover the ${Math.min(5, file.functions.length)} most complex functions`);
      lines.push(`  - Aim for ≥80% branch coverage before making structural changes`);
      lines.push(`  > Tests are your safety net for refactoring. Write them first.\n`);

      lines.push('### Testing the Refactor\n');
      lines.push(`1. Run existing test suite before starting`);
      lines.push(`2. Make one change at a time, run tests after each step`);
      lines.push(`3. Check that all ${fanIn} dependent files still work after changes`);
      lines.push(`4. Use \`grasp_dep_impact\` to see blast radius before modifying any export\n`);
    }

    // Function-level refactor
    if (matchedFns.length > 0 && matchedFiles.length === 0) {
      lines.push(`## Function: \`${matchedFns[0].name}()\`\n`);
      lines.push(`**File:** \`${matchedFns[0].filePath}\``);
      lines.push(`**Line:** ${matchedFns[0].line || 'unknown'}\n`);
      lines.push('### Steps\n');
      lines.push('1. **Extract sub-functions**: Split into smaller named helpers (each ≤20 lines)');
      lines.push('2. **Name improvements**: Rename to clearly describe what it does, not how');
      lines.push('3. **Eliminate side effects**: Return values instead of mutating external state');
      lines.push('4. **Add type annotations**: If missing, add input/output types');
      lines.push('5. **Write a test first**: `it("should do X when Y", () => ...)`');
    }

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: {
        target,
        goal: goal ?? null,
        matched_files: matchedFiles.map(f => f.path),
        matched_functions: matchedFns.map(f => ({ name: f.name, file: (f as any).filePath, line: f.line })),
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_cross_repo
// =====================================================================
server.registerTool(
  'grasp_cross_repo',
  {
    title: 'Cross-repo / monorepo comparison',
    description: 'Compares two analyzed sessions to find shared patterns, naming clashes, duplicated logic, and suggests shared library extractions. Also reports workspace sub-packages for monorepos.',
    inputSchema: {
      session_a: z.string().describe('First session ID from grasp_analyze'),
      session_b: z.string().describe('Second session ID from grasp_analyze'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_a, session_b }) => {
    const a = await getSession(session_a);
    const b = await getSession(session_b);
    if (!a) return { content: [{ type: 'text', text: `Session "${session_a}" not found.` }] };
    if (!b) return { content: [{ type: 'text', text: `Session "${session_b}" not found.` }] };

    const lines: string[] = [];
    lines.push(`## Cross-Repo Analysis: \`${a.source}\` vs \`${b.source}\`\n`);

    // ── Health comparison ──
    lines.push('### Health Comparison\n');
    lines.push(`| Metric | ${a.source.split('/').pop()} | ${b.source.split('/').pop()} |`);
    lines.push('|--------|------|------|');
    lines.push(`| Health Score | ${a.summary.healthScore}/100 (${a.summary.healthGrade}) | ${b.summary.healthScore}/100 (${b.summary.healthGrade}) |`);
    lines.push(`| Files | ${a.summary.fileCount} | ${b.summary.fileCount} |`);
    lines.push(`| Functions | ${a.summary.functionCount} | ${b.summary.functionCount} |`);
    lines.push(`| Issues | ${a.summary.issueCount} | ${b.summary.issueCount} |`);
    lines.push(`| Security | ${a.summary.securityIssueCount ?? 0} | ${b.summary.securityIssueCount ?? 0} |`);

    // ── Shared filenames ──
    const aNamesSet = new Set(a.files.map(f => f.name.toLowerCase()));
    const bNamesSet = new Set(b.files.map(f => f.name.toLowerCase()));
    const shared = [...aNamesSet].filter(n => bNamesSet.has(n));
    lines.push(`\n### Shared Filenames (${shared.length} files exist in both repos)\n`);
    if (shared.length > 0) {
      lines.push('These files may contain duplicated logic and could be extracted to a shared library:');
      shared.slice(0, 20).forEach(n => lines.push(`- \`${n}\``));
      if (shared.length > 20) lines.push(`_…and ${shared.length - 20} more_`);
    }

    // ── Shared function names ──
    const aFnNames = new Set(a.files.flatMap(f => f.functions.map(fn => fn.name)));
    const bFnNames = new Set(b.files.flatMap(f => f.functions.map(fn => fn.name)));
    const sharedFns = [...aFnNames].filter(n => bFnNames.has(n) && n.length > 3);
    lines.push(`\n### Shared Function Names (${sharedFns.length} names appear in both)\n`);
    if (sharedFns.length > 0) {
      lines.push('Consider consolidating these into a shared utilities package:');
      sharedFns.slice(0, 20).forEach(n => lines.push(`- \`${n}()\``));
      if (sharedFns.length > 20) lines.push(`_…and ${sharedFns.length - 20} more_`);
    }

    // ── Workspace info ──
    const aWs = (a as any).workspaces as string[] | undefined;
    const bWs = (b as any).workspaces as string[] | undefined;
    if (aWs && aWs.length > 0) {
      lines.push(`\n### ${a.source} — Detected Workspaces (${aWs.length})\n`);
      aWs.forEach(w => lines.push(`- \`${w}\``));
    }
    if (bWs && bWs.length > 0) {
      lines.push(`\n### ${b.source} — Detected Workspaces (${bWs.length})\n`);
      bWs.forEach(w => lines.push(`- \`${w}\``));
    }

    // ── Layer pattern overlap ──
    const aLayers = new Set(a.summary.layers ?? []);
    const bLayers = new Set(b.summary.layers ?? []);
    const sharedLayers = [...aLayers].filter(l => bLayers.has(l));
    if (sharedLayers.length > 0) {
      lines.push(`\n### Common Architectural Layers: ${sharedLayers.join(', ')}\n`);
      lines.push('These repos share the same layer structure — good candidate for a monorepo.');
    }

    lines.push('\n### Recommendations\n');
    if (sharedFns.length > 10) {
      lines.push(`- **Extract shared utilities**: ${sharedFns.length} functions appear in both repos — create a \`@shared/utils\` package`);
    }
    if (shared.length > 5) {
      lines.push(`- **Shared infrastructure files**: ${shared.length} same-named files — consider a common config/tooling package`);
    }
    lines.push('- Run `grasp_similarity` on each session to find code clone clusters before merging');

    return {
      content: [{ type: 'text', text: truncate(lines.join('\n')) }],
      structuredContent: {
        shared_filenames: shared.length,
        shared_functions: sharedFns.length,
        health_a: { score: a.summary.healthScore, grade: a.summary.healthGrade },
        health_b: { score: b.summary.healthScore, grade: b.summary.healthGrade },
        workspaces_a: aWs ?? [],
        workspaces_b: bWs ?? [],
        shared_fn_names: sharedFns.slice(0, 50),
      },
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
    const result = await getSession(session_id);
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
// TOOL: grasp_dead_packages
// =====================================================================
server.registerTool(
  'grasp_dead_packages',
  {
    title: 'List npm packages declared but never imported',
    description: 'Returns packages found in package.json dependencies/devDependencies that are not imported by any code file. Useful for pruning bloat from node_modules. Use after grasp_analyze on a Node.js project.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      type: z.enum(['all', 'dependency', 'devDependency']).optional()
        .describe('Filter by dependency type: "dependency" for prod deps only, "devDependency" for dev only, "all" for both (default)'),
      workspace: z.string().optional().describe('Filter to a specific monorepo workspace path (e.g. "packages/api")'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, type = 'all', workspace }) => {
    const result = await getSession(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const all: DeadPackage[] = result.deadPackages ?? [];
    const filtered = all.filter(p => {
      if (type !== 'all' && p.type !== type) return false;
      if (workspace && !p.packageJsonPath.startsWith(workspace)) return false;
      return true;
    });

    if (filtered.length === 0) {
      return {
        content: [{ type: 'text', text: '✓ No unused packages found — all declared dependencies are imported somewhere in the codebase.' }],
        structuredContent: { dead_packages: [], total: 0 },
      };
    }

    const byType = { dependency: 0, devDependency: 0 };
    for (const p of filtered) byType[p.type]++;

    const lines: string[] = [
      `## Unused Dependencies (${filtered.length})`,
      '',
      `Found **${filtered.length}** package${filtered.length !== 1 ? 's' : ''} declared in package.json but never imported.`,
      `- Production deps: **${byType.dependency}**`,
      `- Dev deps: **${byType.devDependency}**`,
      '',
      '| Package | Version | Type | package.json |',
      '|---------|---------|------|--------------|',
      ...filtered.map(p => `| \`${p.name}\` | ${p.version} | ${p.type === 'devDependency' ? 'dev' : 'prod'} | ${p.packageJsonPath} |`),
      '',
      '### Suggested cleanup',
      '```bash',
      filtered.filter(p => p.type === 'dependency').length > 0
        ? `npm uninstall ${filtered.filter(p => p.type === 'dependency').map(p => p.name).join(' ')}`
        : '',
      filtered.filter(p => p.type === 'devDependency').length > 0
        ? `npm uninstall --save-dev ${filtered.filter(p => p.type === 'devDependency').map(p => p.name).join(' ')}`
        : '',
      '```',
    ].filter(l => l !== '');

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        dead_packages: filtered,
        total: filtered.length,
        dependency_count: byType.dependency,
        dev_dependency_count: byType.devDependency,
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_sarif
// =====================================================================
server.registerTool(
  'grasp_sarif',
  {
    title: 'Export analysis results as SARIF 2.1.0 for GitHub Code Scanning',
    description: 'Serializes a Grasp analysis session to SARIF 2.1.0 JSON format suitable for upload to GitHub Code Scanning via the upload-sarif action. Returns the full SARIF document as a string. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      pretty: z.boolean().optional().describe('Pretty-print JSON output (default true)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, pretty = true }) => {
    const result = await getSession(session_id);
    if (!result) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

    const sarif = toSarif(result);
    const json = pretty ? JSON.stringify(sarif, null, 2) : JSON.stringify(sarif);
    const resultCount = sarif.runs[0].results.length;
    const ruleCount = sarif.runs[0].tool.driver.rules.length;

    return {
      content: [{ type: 'text', text: json }],
      structuredContent: {
        result_count: resultCount,
        rule_count: ruleCount,
        sarif_version: sarif.version,
        sarif_json: json,
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_runtime_calls
// =====================================================================
server.registerTool(
  'grasp_runtime_calls',
  {
    title: 'Overlay runtime call trace on static dependency graph',
    description: 'Reads a .grasp-trace.json file produced by the GraspTracer and overlays actual runtime call frequencies and durations onto the static analysis. Returns hot files, hot paths, and a merged edge list. Use after instrumenting your app with the GraspTracer from grasp-mcp-server/runtime-tracer.',
    inputSchema: {
      trace_path: z.string().describe('Absolute or relative path to the .grasp-trace.json file'),
      session_id: z.string().optional().describe('Session ID from grasp_analyze to merge with static edges (optional)'),
      top_n: z.number().int().min(1).max(100).optional().describe('Number of hottest files/paths to return (default 20)'),
      min_call_count: z.number().int().min(1).optional().describe('Filter out edges with fewer calls than this threshold (default 1)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ trace_path, session_id, top_n = 20, min_call_count = 1 }) => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');

    const absPath = resolve(trace_path);
    if (!existsSync(absPath)) {
      return {
        content: [{
          type: 'text',
          text: `Trace file not found: ${absPath}\n\nInstrument your app with GraspTracer:\n  import { GraspTracer } from 'grasp-mcp-server/runtime-tracer';\n  const tracer = new GraspTracer();\n  tracer.instrument(yourModule, 'src/yourModule.ts');\n  // tracer.flush() writes .grasp-trace.json on process exit`,
        }],
      };
    }

    const rawJson = readFileSync(absPath, 'utf-8');
    let trace;
    try {
      trace = parseTraceFile(rawJson);
    } catch {
      // parseTraceFile only handles native GraspTracer format (requires "calls" array).
      // Fall back to parseAnyTrace which also supports OTEL resourceSpans format.
      const edges = parseAnyTrace(rawJson);
      if (edges.length === 0) {
        return {
          content: [{ type: 'text', text: `Failed to parse trace file: unrecognised format (not GraspTracer or OTEL). File: ${absPath}` }],
        };
      }
      // Synthesise a TraceReport from the flat TraceEdge[] returned by parseAnyTrace
      trace = {
        calls: edges.map(e => ({
          caller: '(runtime)',
          callee: e.file,
          count: e.calls,
          avgDurationMs: 0,
          minDurationMs: 0,
          maxDurationMs: 0,
          errors: 0,
        })),
        recordedAt: new Date().toISOString(),
        durationMs: 0,
        totalCallCount: edges.reduce((s, e) => s + e.calls, 0),
        tracedModules: [...new Set(edges.map(e => e.file))],
      };
    }

    const filteredCalls = trace.calls.filter(c => c.count >= min_call_count);
    const hot = hotFiles(trace, top_n);

    // Merge with static graph if session provided
    let mergedEdges: ReturnType<typeof mergeTraceWithStatic> = [];
    if (session_id) {
      const result = await getSession(session_id);
      if (result) {
        mergedEdges = mergeTraceWithStatic(trace, result.connections);
        mergedEdges = mergedEdges
          .filter(e => e.runtimeCount >= min_call_count)
          .sort((a, b) => b.runtimeCount - a.runtimeCount)
          .slice(0, top_n * 2);
      }
    }

    const lines: string[] = [
      `## Runtime Call Graph`,
      `Trace: ${absPath}`,
      `Recorded: ${trace.recordedAt}`,
      `Duration: ${(trace.durationMs / 1000).toFixed(1)}s`,
      `Total calls: ${trace.totalCallCount.toLocaleString()}`,
      `Traced modules: ${trace.tracedModules.length}`,
      '',
      `### Hot Files (top ${hot.length})`,
      ...hot.map((f, i) => `  ${i + 1}. ${f.file}  —  ${f.callCount.toLocaleString()} calls  avg ${f.avgDurationMs}ms`),
      '',
      `### Hot Call Paths (top ${Math.min(filteredCalls.length, top_n)})`,
      ...filteredCalls.slice(0, top_n).map(c =>
        `  ${c.count}×  ${c.caller} → ${c.callee}  [avg ${c.avgDurationMs}ms${c.errors > 0 ? `, ${c.errors} errors` : ''}]`
      ),
    ];

    if (mergedEdges.length > 0) {
      lines.push('', `### Merged with Static Graph (${mergedEdges.length} edges)`);
      lines.push(...mergedEdges.slice(0, top_n).map(e =>
        `  ${e.source} → ${e.target}  fn:${e.fn}  runtime:${e.runtimeCount}×  avg:${e.avgDurationMs}ms`
      ));
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        recorded_at: trace.recordedAt,
        duration_ms: trace.durationMs,
        total_call_count: trace.totalCallCount,
        traced_modules: trace.tracedModules,
        hot_files: hot,
        hot_calls: filteredCalls.slice(0, top_n),
        merged_edges: mergedEdges,
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_db_coupling
// =====================================================================
server.registerTool(
  'grasp_db_coupling',
  {
    title: 'Analyze database schema coupling (ORM models, raw SQL, queries)',
    description: 'Scans source files for ORM model definitions (SQLAlchemy, TypeORM, Sequelize, Prisma, Drizzle, Mongoose) and raw SQL/query patterns to produce a file-to-table coupling report. Identifies god tables (touched by many files), high-coupling files (touch many tables), and shared-table clusters that indicate tight coupling. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      min_shared_tables: z.number().int().min(1).optional().describe('Minimum shared tables to include a file pair in coupling clusters (default 3)'),
      top_n: z.number().int().min(1).max(100).optional().describe('Number of top entries to show in each category (default 20)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, min_shared_tables = 3, top_n = 20 }) => {
    const result = await getSession(session_id);
    if (!result) {
      return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    }

    // Build file content list from analyzed files
    const fileContents = result.files
      .filter(f => f.content && f.isCode)
      .map(f => ({ path: f.path, content: f.content! }));

    if (fileContents.length === 0) {
      return { content: [{ type: 'text', text: 'No source file content available. Ensure the analysis fetched file contents.' }] };
    }

    const report = buildCouplingReport(fileContents);

    if (report.tableCount === 0) {
      return {
        content: [{ type: 'text', text: 'No database table references detected in source files.\n\nSupported: SQLAlchemy, TypeORM, Sequelize, Prisma, Drizzle, Mongoose, raw SQL, Knex, Alembic.' }],
        structuredContent: { tableCount: 0, fileCount: 0 },
      };
    }

    const clusters = findSharedTableClusters(report, min_shared_tables);

    const lines: string[] = [
      `## DB Schema Coupling Report`,
      `Tables detected: ${report.tableCount}  |  Files with table refs: ${report.fileCount}`,
      '',
    ];

    if (report.godTablesFiles.length > 0) {
      lines.push(`### ⚠️  God Tables (≥5 files use them)`);
      lines.push(...report.godTablesFiles.map(t => {
        const files = report.tables[t] ?? [];
        return `  ${t}  —  ${files.length} files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` +${files.length - 5} more` : ''}`;
      }));
      lines.push('');
    }

    if (report.highCouplingFiles.length > 0) {
      lines.push(`### High-Coupling Files (≥10 tables)`);
      lines.push(...report.highCouplingFiles.slice(0, top_n).map(f =>
        `  ${f.file}  —  ${f.tableCount} tables`
      ));
      lines.push('');
    }

    lines.push(`### Most Shared Tables (top ${Math.min(top_n, report.highCouplingTables.length)})`);
    if (report.highCouplingTables.length > 0) {
      lines.push(...report.highCouplingTables.slice(0, top_n).map(t =>
        `  ${t.table}  —  ${t.fileCount} files`
      ));
    } else {
      lines.push('  (no table used by ≥3 files)');
    }
    lines.push('');

    if (clusters.length > 0) {
      lines.push(`### Shared-Table Clusters (≥${min_shared_tables} shared, top ${Math.min(top_n, clusters.length)})`);
      lines.push(...clusters.slice(0, top_n).map(c =>
        `  ${c.files[0]} ↔ ${c.files[1]}  shared: ${c.sharedTables.join(', ')}`
      ));
      lines.push('');
    }

    lines.push(`### Table-to-File Map (top ${Math.min(top_n, report.tableCount)} by file count)`);
    const topTables = Object.entries(report.tables)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, top_n);
    lines.push(...topTables.map(([t, files]) =>
      `  ${t}  (${files.length} files)  ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}`
    ));

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        table_count: report.tableCount,
        file_count: report.fileCount,
        god_tables: report.godTablesFiles,
        high_coupling_files: report.highCouplingFiles.slice(0, top_n),
        high_coupling_tables: report.highCouplingTables.slice(0, top_n),
        shared_clusters: clusters.slice(0, top_n),
        table_map: Object.fromEntries(
          Object.entries(report.tables)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 50)
        ),
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_migration_plan
// =====================================================================
server.registerTool(
  'grasp_migration_plan',
  {
    title: 'Generate ordered migration steps to replace or remove a dependency',
    description: 'Analyzes import usage across source files and produces a phased, topologically-ordered migration plan for replacing one package or module with another (or removing it). Returns per-file effort estimates and action items. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      from: z.string().describe('The import path or package name to replace (e.g. "lodash", "src/old/utils", "moment")'),
      to: z.string().optional().describe('Replacement import path or package name (omit to plan a pure removal)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, from: fromPkg, to: toPkg }) => {
    const result = await getSession(session_id);
    if (!result) {
      return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    }

    const plan = buildMigrationPlan(result.files, result.connections, {
      from: fromPkg,
      to: toPkg,
    });

    if (plan.totalFiles === 0) {
      return {
        content: [{ type: 'text', text: plan.summary }],
        structuredContent: { total_files: 0, phases: [] },
      };
    }

    const lines: string[] = [
      `## Migration Plan: '${fromPkg}'${toPkg ? ` → '${toPkg}'` : ' (removal)'}`,
      '',
      plan.summary,
      '',
    ];

    if (plan.warnings.length > 0) {
      lines.push('### ⚠️  Warnings');
      plan.warnings.forEach(w => lines.push(`  - ${w}`));
      lines.push('');
    }

    for (const phase of plan.phases) {
      lines.push(`### Phase ${phase.phase}: ${phase.label}`);
      if (phase.canParallelize) {
        lines.push(`  (${phase.steps.length} files — can be done in parallel)`);
      }
      for (const step of phase.steps) {
        const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[step.effort];
        lines.push(`  ${effortEmoji} ${step.file}  [${step.effort}]  ${step.importSites} imports`);
        step.actions.forEach(a => lines.push(`      • ${a}`));
        if (step.dependents.length > 0) {
          lines.push(`      → Enables: ${step.dependents.slice(0, 3).join(', ')}${step.dependents.length > 3 ? '…' : ''}`);
        }
      }
      lines.push('');
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        from: fromPkg,
        to: toPkg,
        total_files: plan.totalFiles,
        estimated_effort: plan.estimatedEffort,
        warnings: plan.warnings,
        phases: plan.phases.map(p => ({
          phase: p.phase,
          label: p.label,
          can_parallelize: p.canParallelize,
          steps: p.steps.map(s => ({
            file: s.file,
            effort: s.effort,
            import_sites: s.importSites,
            function_usages: s.functionUsages,
            actions: s.actions,
            dependents: s.dependents,
          })),
        })),
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_api_surface
// =====================================================================
server.registerTool(
  'grasp_api_surface',
  {
    title: 'Map API surface: OpenAPI/GraphQL specs to source file implementations',
    description: 'Scans source files for route declarations (Express, FastAPI, Flask, Next.js App Router) and parses OpenAPI/GraphQL specs to produce a unified API surface map. Returns endpoints grouped by method and file, identifies undocumented routes, and reports spec coverage. Use after grasp_analyze.',
    inputSchema: {
      session_id: z.string().describe('Session ID from grasp_analyze'),
      openapi_json: z.string().optional().describe('OpenAPI 2.x/3.x spec as a JSON string (optional)'),
      graphql_sdl: z.string().optional().describe('GraphQL SDL schema string (optional)'),
      spec_file: z.string().optional().describe('File name label for the spec (default: "openapi.json")'),
      top_n: z.number().int().min(1).max(200).optional().describe('Max endpoints to show per category (default 30)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, openapi_json, graphql_sdl, spec_file = 'openapi.json', top_n = 30 }) => {
    const result = await getSession(session_id);
    if (!result) {
      return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    }

    const specEndpoints = [
      ...(openapi_json ? parseOpenApiSpec(openapi_json, spec_file) : []),
      ...(graphql_sdl ? parseGraphQlSchema(graphql_sdl, spec_file.replace('.json', '.graphql')) : []),
    ];

    const codeFiles = result.files
      .filter(f => f.content && f.isCode)
      .map(f => ({ path: f.path, content: f.content! }));

    const sourceEndpoints = scanSourceRoutes(codeFiles);
    const allSourcePaths = result.files.filter(f => f.isCode).map(f => f.path);
    const report = buildApiSurfaceReport(specEndpoints, sourceEndpoints, allSourcePaths);

    if (report.totalEndpoints === 0) {
      return {
        content: [{ type: 'text', text: 'No API endpoints detected.\n\nProvide an OpenAPI spec via openapi_json, a GraphQL schema via graphql_sdl, or ensure source files contain Express/FastAPI/Next.js route declarations.' }],
        structuredContent: { total_endpoints: 0 },
      };
    }

    const lines: string[] = [
      `## API Surface Map`,
      `Total endpoints: ${report.totalEndpoints}`,
      `Spec files: ${report.specFiles.join(', ') || 'none'}`,
      '',
      `### By HTTP Method`,
      ...Object.entries(report.byMethod)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `  ${m.padEnd(10)} ${n}`),
      '',
    ];

    if (report.undocumentedFiles.length > 0) {
      lines.push(`### ⚠️  Undocumented Route Files (${report.undocumentedFiles.length})`);
      lines.push(...report.undocumentedFiles.map(f => `  ${f}`));
      lines.push('');
    }

    lines.push(`### Endpoints by File (top ${Math.min(Object.keys(report.byFile).length, top_n)} files)`);
    const topFiles = Object.entries(report.byFile)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, top_n);

    for (const [file, eps] of topFiles) {
      lines.push(`  ${file}  (${eps.length} endpoints)`);
      eps.slice(0, 5).forEach(ep => {
        lines.push(`    ${ep.method.padEnd(8)} ${ep.path}${ep.description ? '  — ' + ep.description : ''}`);
      });
      if (eps.length > 5) lines.push(`    … +${eps.length - 5} more`);
    }

    lines.push('');
    lines.push(`### All Endpoints (top ${Math.min(report.totalEndpoints, top_n)})`);
    report.endpoints.slice(0, top_n).forEach(ep => {
      const fileStr = ep.file ? ` [${ep.file.split('/').pop()}]` : '';
      lines.push(`  ${ep.method.padEnd(8)} ${ep.path}${fileStr}${ep.description ? '  — ' + ep.description : ''}`);
    });

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        total_endpoints: report.totalEndpoints,
        by_method: report.byMethod,
        undocumented_files: report.undocumentedFiles,
        spec_files: report.specFiles,
        endpoints: report.endpoints.slice(0, top_n),
        by_file: Object.fromEntries(
          Object.entries(report.byFile)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, top_n)
        ),
      },
    };
  }
);

// =====================================================================
// TOOL: grasp_commits
// =====================================================================
server.registerTool(
  'grasp_commits',
  {
    title: 'GitHub commit activity for a repo',
    description: 'Returns commit counts for the last 7 days and 30 days for a GitHub repo, plus commits since a given timestamp (useful for tracking how many commits landed since your last Grasp analysis). Use alongside grasp_analyze to detect when a repo has changed.',
    inputSchema: {
      repo: z.string().describe('GitHub repo in owner/repo format (e.g. "expressjs/express")'),
      since_timestamp: z.string().optional().describe('ISO 8601 timestamp — counts commits after this date (e.g. last grasp_analyze time). Omit to skip staleness count.'),
      token: z.string().optional().describe('GitHub PAT for private repos / higher rate limits (5,000 req/hr vs 60)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ repo, since_timestamp, token }) => {
    const [owner, name] = repo.replace(/^https?:\/\/github\.com\//, '').split('/');
    if (!owner || !name) {
      return { content: [{ type: 'text', text: 'Invalid repo format. Use owner/repo.' }] };
    }

    const headers: Record<string, string> = { 'User-Agent': 'grasp-mcp' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    async function fetchCommitCount(since: string): Promise<{ count: number; latest: string | null }> {
      const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${since}&per_page=100`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`GitHub API error ${resp.status}: ${await resp.text()}`);
      const commits = await resp.json() as Array<{ sha: string; commit: { author: { date: string }; message: string } }>;
      return {
        count: commits.length,
        latest: commits[0]?.commit?.author?.date ?? null,
      };
    }

    try {
      const [r7d, r30d] = await Promise.all([
        fetchCommitCount(since7d),
        fetchCommitCount(since30d),
      ]);

      let sinceAnalysis: number | null = null;
      if (since_timestamp) {
        const rSince = await fetchCommitCount(since_timestamp);
        sinceAnalysis = rSince.count;
      }

      const lines: string[] = [
        `## Commit Activity — ${owner}/${name}`,
        '',
        `| Period | Commits |`,
        `|--------|---------|`,
        `| Last 7 days | ${r7d.count} |`,
        `| Last 30 days | ${r30d.count} |`,
      ];
      if (sinceAnalysis !== null) {
        lines.push(`| Since last analysis | ${sinceAnalysis} |`);
      }
      if (r7d.latest) {
        lines.push('', `**Latest commit:** ${r7d.latest}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          repo: `${owner}/${name}`,
          commits_7d: r7d.count,
          commits_30d: r30d.count,
          commits_since_analysis: sinceAnalysis,
          latest_commit_date: r7d.latest,
        },
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Failed to fetch commit activity: ${err.message}` }] };
    }
  }
);

// =====================================================================
// TOOL: grasp_ci_status
// =====================================================================
server.registerTool(
  'grasp_ci_status',
  {
    title: 'GitHub Actions CI status for a repo',
    description: 'Returns the latest GitHub Actions workflow run status for a repo — whether CI is passing, failing, or in progress. Use to check build health alongside grasp_analyze or grasp_commits.',
    inputSchema: {
      repo: z.string().describe('GitHub repo in owner/repo format (e.g. "expressjs/express")'),
      workflow: z.string().optional().describe('Workflow filename or ID to filter by (e.g. "ci.yml"). Omit to get the latest run across all workflows.'),
      token: z.string().optional().describe('GitHub PAT for private repos / higher rate limits'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ repo, workflow, token }) => {
    const [owner, name] = repo.replace(/^https?:\/\/github\.com\//, '').split('/');
    if (!owner || !name) {
      return { content: [{ type: 'text', text: 'Invalid repo format. Use owner/repo.' }] };
    }

    const headers: Record<string, string> = { 'User-Agent': 'grasp-mcp' };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const workflowParam = workflow ? `&workflow_id=${encodeURIComponent(workflow)}` : '';
      const url = `https://api.github.com/repos/${owner}/${name}/actions/runs?per_page=5${workflowParam}`;
      const resp = await fetch(url, { headers });

      if (resp.status === 404) {
        return { content: [{ type: 'text', text: `No Actions runs found for ${owner}/${name}. The repo may have no CI workflows.` }] };
      }
      if (!resp.ok) {
        return { content: [{ type: 'text', text: `GitHub API error ${resp.status}: ${await resp.text()}` }] };
      }

      const data = await resp.json() as { total_count: number; workflow_runs: Array<{ id: number; name: string; status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string; head_branch: string; head_sha: string }> };

      if (!data.workflow_runs?.length) {
        return { content: [{ type: 'text', text: `No workflow runs found for ${owner}/${name}.` }] };
      }

      const latest = data.workflow_runs[0];
      const statusIcon = latest.conclusion === 'success' ? '✅' : latest.conclusion === 'failure' ? '❌' : latest.status === 'in_progress' ? '⏳' : '⚪';
      const conclusion = latest.conclusion ?? latest.status;

      const lines: string[] = [
        `## CI Status — ${owner}/${name}`,
        '',
        `**Status:** ${statusIcon} ${conclusion}`,
        `**Workflow:** ${latest.name}`,
        `**Branch:** ${latest.head_branch}`,
        `**Run URL:** ${latest.html_url}`,
        `**Updated:** ${latest.updated_at}`,
        '',
        '### Recent Runs',
        '| Workflow | Branch | Conclusion | Updated |',
        '|----------|--------|------------|---------|',
        ...data.workflow_runs.slice(0, 5).map(r => {
          const icon = r.conclusion === 'success' ? '✅' : r.conclusion === 'failure' ? '❌' : r.status === 'in_progress' ? '⏳' : '⚪';
          return `| ${r.name} | ${r.head_branch} | ${icon} ${r.conclusion ?? r.status} | ${r.updated_at.slice(0, 10)} |`;
        }),
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          repo: `${owner}/${name}`,
          status: latest.status,
          conclusion: latest.conclusion,
          passing: latest.conclusion === 'success',
          workflow_name: latest.name,
          branch: latest.head_branch,
          run_url: latest.html_url,
          updated_at: latest.updated_at,
          recent_runs: data.workflow_runs.slice(0, 5).map(r => ({
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            branch: r.head_branch,
            updated_at: r.updated_at,
            url: r.html_url,
          })),
        },
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Failed to fetch CI status: ${err.message}` }] };
    }
  }
);

// =====================================================================
// TOOL: grasp_env_vars
// =====================================================================
server.registerTool('grasp_env_vars', {
  title: 'Environment Variable Scanner',
  description: `Scans all files for environment variable reads. Cross-references with .env.example to find undocumented vars. Tags each var with which architectural layer reads it and whether it appears only in test files.

Parameters:
  session_id: string — active analysis session

Returns:
  { vars: [{name, files, layers, inEnvExample, testOnly}], undocumented: string[], testOnly: string[] }`,
  inputSchema: z.object({ session_id: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  const fileInputs = data.files.map((f: any) => ({
    path: f.path,
    content: f.content ?? '',
    layer: f.layer ?? 'unknown',
    isTest: f.isTest ?? (f.path.includes('test') || f.path.includes('spec')),
  }));

  const envExampleVars: string[] = [];
  // Try to read .env.example from session source
  const envExampleContent = data.files.find((f: any) =>
    f.path.endsWith('.env.example') || f.path.endsWith('.env.sample')
  );
  if (envExampleContent?.content) {
    for (const line of envExampleContent.content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]+)\s*=/);
      if (m) envExampleVars.push(m[1]);
    }
  }

  const result = scanEnvVars(fileInputs, envExampleVars);
  const output = {
    session_id,
    source: data.source,
    vars: result.vars,
    undocumented: result.undocumented,
    testOnly: result.testOnly,
    summary: {
      totalVars: result.vars.length,
      undocumentedCount: result.undocumented.length,
      testOnlyCount: result.testOnly.length,
    },
  };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_events
// =====================================================================
server.registerTool('grasp_events', {
  title: 'Event Pub/Sub Mapper',
  description: `Maps event emitters and subscribers across the codebase. Builds a pub/sub dependency graph that import analysis cannot see. Detects orphaned events (emitted, never subscribed) and ghost subscribers (subscribed, never emitted).

Patterns detected: Node.js EventEmitter, browser addEventListener/dispatchEvent, Redux dispatch, pub/sub libraries.

Parameters:
  session_id: string — active analysis session

Returns:
  { events: [{name, emitters, subscribers, orphaned, ghost}], orphanedCount, ghostCount }`,
  inputSchema: z.object({ session_id: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  const fileInputs = data.files.map((f: any) => ({
    path: f.path,
    content: f.content ?? '',
    layer: f.layer ?? 'unknown',
  }));

  const result = mapEvents(fileInputs);
  const output = {
    session_id,
    source: data.source,
    events: result.events,
    orphanedCount: result.orphanedCount,
    ghostCount: result.ghostCount,
    totalEvents: result.events.length,
  };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_stale
// =====================================================================
server.registerTool('grasp_stale', {
  title: 'Stale File Detector',
  description: `Finds files that are active (imported by others) but potentially abandoned — low churn, high fan-in, no test counterpart. These are the "this probably still works but nobody knows why" files.

Staleness score = (low_churn × 0.4) + (high_fanIn × 0.35) + (no_test × 0.25), normalized 0–100.

Parameters:
  session_id: string — active analysis session
  min_fan_in: number (default 2) — minimum fan-in to consider
  limit: number (default 20) — max results

Returns:
  { files: [{path, layer, fanIn, churn, hasTest, stalenessScore}] }`,
  inputSchema: z.object({
    session_id: z.string(),
    min_fan_in: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, min_fan_in = 2, limit = 20 }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  // Build fan-in map
  const fanInMap = new Map<string, number>();
  for (const conn of data.connections) {
    fanInMap.set(conn.to, (fanInMap.get(conn.to) ?? 0) + 1);
  }

  // Build test coverage set
  const testFiles = new Set(data.files.filter((f: any) => f.isTest || f.path.includes('test') || f.path.includes('spec')).map((f: any) => f.path));
  const testedPaths = new Set<string>();
  for (const conn of data.connections) {
    if (testFiles.has(conn.from)) testedPaths.add(conn.to);
  }

  type StaleFile = { path: string; layer: string; fanIn: number; churn: number; hasTest: boolean; stalenessScore: number };
  const results: StaleFile[] = [];

  for (const file of data.files) {
    if (file.isTest || (file.path.includes('test')) || (file.path.includes('spec'))) continue;
    const fanIn = fanInMap.get(file.path) ?? 0;
    if (fanIn < min_fan_in) continue;

    const churn = file.churn ?? 0;
    const hasTest = testedPaths.has(file.path);
    const maxChurn = Math.max(...data.files.map((f: any) => f.churn ?? 0), 1);
    const churnScore = 1 - Math.min(churn / maxChurn, 1);
    const fanInScore = Math.min(fanIn / 20, 1);
    const testScore = hasTest ? 0 : 1;

    const stalenessScore = Math.round((churnScore * 0.4 + fanInScore * 0.35 + testScore * 0.25) * 100);
    results.push({ path: file.path, layer: file.layer ?? 'unknown', fanIn, churn, hasTest, stalenessScore });
  }

  results.sort((a, b) => b.stalenessScore - a.stalenessScore);
  const top = results.slice(0, limit);

  const output = { session_id, source: data.source, files: top, totalAnalyzed: results.length };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_change_risk
// =====================================================================
server.registerTool('grasp_change_risk', {
  title: 'Change Risk Scorer',
  description: `Given a list of changed files (e.g. from a PR diff), returns a composite risk score 0–100 with per-component breakdown. Designed for agent decision-making: if risk > 70, require second reviewer.

Formula: risk = blast_radius×0.35 + complexity×0.25 + churn_frequency×0.20 + layer_violations×0.20
Score ≤ 33 = low, 34–66 = medium, 67+ = high.

Parameters:
  session_id: string — active analysis session
  changed_files: string[] — list of file paths that changed

Returns:
  { score: number, level: "low"|"medium"|"high", components: {blastRadius, complexity, churnFrequency, layerViolations}, affectedFiles: string[] }`,
  inputSchema: z.object({
    session_id: z.string(),
    changed_files: z.array(z.string()).min(1),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, changed_files }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  const changedSet = new Set(changed_files);

  // Blast radius: how many files import the changed files (direct dependents)
  const fanInMap = new Map<string, number>();
  for (const conn of data.connections) {
    fanInMap.set(conn.to, (fanInMap.get(conn.to) ?? 0) + 1);
  }
  const totalFanIn = changed_files.reduce((s, f) => s + (fanInMap.get(f) ?? 0), 0);
  const maxPossibleFanIn = data.files.length;
  const blastRadius = Math.min(100, Math.round((totalFanIn / Math.max(maxPossibleFanIn, 1)) * 100 * 5));

  // Complexity: avg complexity of changed files
  const complexities = changed_files.map(f => {
    const file = data.files.find((df: any) => df.path === f);
    return file?.avgComplexity ?? 0;
  });
  const avgComplexity = complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0;
  const complexity = Math.min(100, Math.round(avgComplexity * 5));

  // Churn frequency: how frequently these files change (using churn field)
  const churns = changed_files.map(f => {
    const file = data.files.find((df: any) => df.path === f);
    return file?.churn ?? 0;
  });
  const maxChurn = Math.max(...data.files.map((f: any) => f.churn ?? 0), 1);
  const avgChurn = churns.length > 0 ? churns.reduce((a, b) => a + b, 0) / churns.length : 0;
  const churnFrequency = Math.min(100, Math.round((avgChurn / maxChurn) * 100));

  // Layer violations: are any changed files involved in layer violations?
  const violationFiles = new Set((data.layerViolations ?? []).flatMap((v: any) => [v.from, v.to].filter(Boolean)));
  const layerViolationCount = changed_files.filter(f => violationFiles.has(f)).length;
  const layerViolations = Math.min(100, Math.round((layerViolationCount / Math.max(changed_files.length, 1)) * 100));

  const score = Math.round(blastRadius * 0.35 + complexity * 0.25 + churnFrequency * 0.20 + layerViolations * 0.20);
  const level = score <= 33 ? 'low' : score <= 66 ? 'medium' : 'high';

  // Find directly affected files (dependents of changed files)
  const affectedFiles = data.connections
    .filter((c: any) => changedSet.has(c.to))
    .map((c: any) => c.from)
    .filter((f: string) => !changedSet.has(f));
  const uniqueAffected = [...new Set(affectedFiles)].slice(0, 20);

  const output = {
    session_id, source: data.source,
    score, level,
    components: { blastRadius, complexity, churnFrequency, layerViolations },
    changedFiles: changed_files,
    affectedFiles: uniqueAffected,
    advice: level === 'high' ? 'High risk — consider requiring a second reviewer and extra test coverage.'
      : level === 'medium' ? 'Medium risk — review carefully, ensure tests cover the changed paths.'
      : 'Low risk — standard review process should be sufficient.',
  };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_feature_flags
// =====================================================================
server.registerTool('grasp_feature_flags', {
  title: 'Feature Flag Tracker',
  description: `Finds all feature flag reads in the codebase. Supports LaunchDarkly, GrowthBook, OpenFeature, env-var flags (FEATURE_X, FF_X, ENABLE_X), and custom patterns (flags.get, features.enabled, isFeatureEnabled).

Parameters:
  session_id: string — active analysis session

Returns:
  { flags: [{name, source, files}], totalFlags: number }`,
  inputSchema: z.object({ session_id: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  const fileInputs = data.files.map((f: any) => ({
    path: f.path,
    content: f.content ?? '',
    layer: f.layer ?? 'unknown',
  }));

  const result = trackFlags(fileInputs);
  const output = {
    session_id, source: data.source,
    flags: result.flags,
    totalFlags: result.totalFlags,
    bySource: Object.fromEntries(
      ['launchdarkly', 'growthbook', 'openfeature', 'env', 'custom'].map(src => [
        src,
        result.flags.filter(f => f.source === src).length,
      ])
    ),
  };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_perf
// =====================================================================
server.registerTool('grasp_perf', {
  title: 'Performance Anti-Pattern Detector',
  description: `Static analysis for common performance anti-patterns: N+1 ORM queries in loops, synchronous I/O on the event loop, JSON serialization inside loops. Each finding includes file, line, severity, and a fix suggestion.

Parameters:
  session_id: string — active analysis session

Returns:
  { findings: [{file, line, pattern, severity, message, suggestion}], criticalCount, warningCount }`,
  inputSchema: z.object({ session_id: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };

  const fileInputs = data.files.map((f: any) => ({
    path: f.path,
    content: f.content ?? '',
    layer: f.layer ?? 'unknown',
  }));

  const result = analyzePerfPatterns(fileInputs);
  const output = {
    session_id, source: data.source,
    findings: result.findings,
    criticalCount: result.criticalCount,
    warningCount: result.warningCount,
    totalFindings: result.findings.length,
  };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

server.registerTool('grasp_license', {
  title: 'Dependency License Audit',
  description: `Scans node_modules/ for all dependency licenses. Categorizes as permissive (MIT, Apache-2.0, BSD, ISC), copyleft (GPL, AGPL, LGPL), or unknown. Returns violations and summary counts.

Parameters:
  session_id: string — active analysis session
  flag_copyleft: boolean (default true)
  allowed_licenses: string[] (optional) — SPDX list of allowed licenses

Returns:
  { dependencies: [{name, version, license, licenseCategory}], summary: {total, permissive, copyleft, unknown}, violations: [{name, license}] }`,
  inputSchema: z.object({ session_id: z.string(), flag_copyleft: z.boolean().optional(), allowed_licenses: z.array(z.string()).optional() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, flag_copyleft, allowed_licenses }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
  const projectRoot = data.sourceType === 'local' ? data.source : process.cwd();
  const result = await scanLicenses(projectRoot, allowed_licenses, flag_copyleft ?? true);
  const output = { session_id, source: data.source, dependencies: result.dependencies, summary: result.summary, violations: result.violations, violationCount: result.violations.length, advice: result.violations.length === 0 ? 'No license violations found.' : `${result.violations.length} violation(s) found. Review copyleft licenses before commercial use.` };
  return {
    content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
    structuredContent: output,
  };
});

// =====================================================================
// TOOL: grasp_onboard
// =====================================================================
server.registerTool('grasp_onboard', {
  title: 'Onboarding Reading Path',
  description: `Produces an ordered reading path for a new engineer entering a specific area of the codebase. Given a topic/area query, returns 5–15 files sorted by "must understand first" order (low architectural layer + high fan-in = read first).

Parameters:
  session_id: string — active analysis session
  query: string — area to explore (e.g. "auth", "payments", "src/services/user.ts")
  limit: number (default 12) — max files to return

Returns:
  { path: [{file, layer, fanIn, whyFirst, connectsTo}], topic: string, totalMatched: number }`,
  inputSchema: z.object({ session_id: z.string(), query: z.string(), limit: z.number().int().min(1).max(30).optional() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, query, limit = 12 }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
  const q = query.toLowerCase();
  const candidates = data.files.filter((f: any) => f.path.toLowerCase().includes(q) || (f.layer && f.layer.toLowerCase().includes(q)));
  if (candidates.length === 0) return { content: [{ type: 'text', text: `No files matching "${query}" found in session.` }] };
  const fanInMap = new Map<string, number>();
  for (const conn of data.connections) fanInMap.set(conn.to, (fanInMap.get(conn.to) ?? 0) + 1);
  const dependentsMap = new Map<string, string[]>();
  for (const conn of data.connections) { if (!dependentsMap.has(conn.from)) dependentsMap.set(conn.from, []); dependentsMap.get(conn.from)!.push(conn.to); }
  const layerOrder: Record<string, number> = { config: 0, types: 1, utils: 2, models: 3, db: 4, services: 5, controllers: 6, api: 7, ui: 8, test: 9 };
  const scored = candidates.map((f: any) => { const fanIn = fanInMap.get(f.path) ?? 0; const layerScore = layerOrder[f.layer?.toLowerCase() ?? ''] ?? 5; return { f, fanIn, score: layerScore * 10 - fanIn }; });
  scored.sort((a: any, b: any) => a.score - b.score);
  const readingPath = scored.slice(0, limit).map(({ f, fanIn }: any) => ({ file: f.path, layer: f.layer ?? 'unknown', fanIn, whyFirst: fanIn > 5 ? `High fan-in (${fanIn} dependents)` : f.layer === 'config' || f.layer === 'types' ? 'Foundation layer' : 'Entry point for this area', connectsTo: (dependentsMap.get(f.path) ?? []).slice(0, 5) }));
  const output = { session_id, topic: query, totalMatched: candidates.length, path: readingPath, tip: 'Start at the top of this list and work downward.' };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
});

// =====================================================================
// TOOL: grasp_types
// =====================================================================
server.registerTool('grasp_types', {
  title: 'Type Annotation Coverage',
  description: `Reports type annotation coverage per file — percentage of functions with type annotations. For TypeScript/TSX files: checks for type annotations in function signatures. Prioritizes high fan-in files (annotating them has the most downstream impact).

Parameters:
  session_id: string — active analysis session
  min_fan_in: number (default 1)
  limit: number (default 20) — max files (sorted by lowest coverage first)

Returns:
  { files: [{path, layer, fanIn, typedFunctions, totalFunctions, coveragePct}], averageCoverage: number }`,
  inputSchema: z.object({ session_id: z.string(), min_fan_in: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, min_fan_in = 1, limit = 20 }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
  const fanInMap = new Map<string, number>();
  for (const conn of data.connections) fanInMap.set(conn.to, (fanInMap.get(conn.to) ?? 0) + 1);
  type FC = { path: string; layer: string; fanIn: number; typedFunctions: number; totalFunctions: number; coveragePct: number };
  const fileCoverages: FC[] = [];
  for (const file of data.files) {
    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (!['ts', 'tsx', 'py'].includes(ext)) continue;
    const fanIn = fanInMap.get(file.path) ?? 0;
    if (fanIn < min_fan_in) continue;
    const totalFunctions = (file as any).functions?.length ?? 0;
    if (totalFunctions === 0) continue;
    let typedFunctions = 0;
    for (const fn of (file as any).functions ?? []) { if (fn.signature && (fn.signature.includes(':') || fn.signature.includes('=>'))) typedFunctions++; }
    fileCoverages.push({ path: file.path, layer: (file as any).layer ?? 'unknown', fanIn, typedFunctions, totalFunctions, coveragePct: Math.round((typedFunctions / totalFunctions) * 100) });
  }
  fileCoverages.sort((a, b) => a.coveragePct - b.coveragePct || b.fanIn - a.fanIn);
  const averageCoverage = fileCoverages.length > 0 ? Math.round(fileCoverages.reduce((s, f) => s + f.coveragePct, 0) / fileCoverages.length) : 0;
  const output = { session_id, source: data.source, averageCoverage, totalFilesAnalyzed: fileCoverages.length, files: fileCoverages.slice(0, limit), advice: averageCoverage >= 80 ? 'Good type coverage overall.' : `Average coverage is ${averageCoverage}%. Prioritize annotating high fan-in files first.` };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
});

// =====================================================================
// TOOL: grasp_diagram
// =====================================================================
server.registerTool('grasp_diagram', {
  title: 'Architecture Diagram Generator',
  description: `Generates architecture diagrams from analysis data. Output pastes directly into GitHub wikis, Notion, Confluence.

Formats: mermaid (default) | c4-context | c4-container | c4-component
Parameters:
  session_id: string
  format: "mermaid"|"c4-context"|"c4-container"|"c4-component" (default "mermaid")
  layer: string (only for c4-component)
  max_nodes: number (default 50)

Returns: { diagram: string, format: string, nodeCount: number, tip: string }`,
  inputSchema: z.object({ session_id: z.string(), format: z.enum(['mermaid','c4-context','c4-container','c4-component']).optional(), layer: z.string().optional(), max_nodes: z.number().int().min(5).max(200).optional() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ session_id, format = 'mermaid', layer, max_nodes = 50 }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
  let diagram: string;
  switch (format) {
    case 'mermaid': diagram = generateMermaid(data, max_nodes); break;
    case 'c4-context': diagram = generateC4Context(data); break;
    case 'c4-container': diagram = generateC4Container(data); break;
    case 'c4-component': if (!layer) return { content: [{ type: 'text', text: 'c4-component requires the "layer" parameter.' }] }; diagram = generateC4Component(data, layer, max_nodes); break;
    default: diagram = generateMermaid(data, max_nodes);
  }
  const tips: Record<string, string> = { mermaid: 'Paste into any GitHub Markdown using ```mermaid code block.', 'c4-context': 'Render with https://structurizr.com/ or C4 PlantUML.', 'c4-container': 'Shows how architectural layers connect.', 'c4-component': `Shows individual files in the "${layer}" layer.` };
  const output = { session_id, source: data.source, format, nodeCount: Math.min(data.files.length, max_nodes), diagram, tip: tips[format] ?? '' };
  return { content: [{ type: 'text', text: `\`\`\`${format === 'mermaid' ? 'mermaid' : 'text'}\n${diagram}\n\`\`\`\n\n${tips[format]}` }], structuredContent: output };
});

// =====================================================================
// TOOL: grasp_pr_review
// =====================================================================
server.registerTool('grasp_pr_review', {
  title: 'Inline PR Review Comments',
  description: `Posts inline code review comments on a GitHub Pull Request at exact lines with high-severity findings. Posts per-line annotations visible in the PR diff view — like Reviewdog.

Only posts for: complexity > min_complexity, circular dependency participant, or security issue.

Parameters:
  session_id: string
  repo: string — "owner/repo"
  pr_number: number
  token: string — GitHub PAT with repo write access
  min_complexity: number (default 15)
  dry_run: boolean (default false) — returns comments without posting

Returns: { posted: number, skipped: number, comments: [{path, line, body}], dryRun: boolean }`,
  inputSchema: z.object({ session_id: z.string(), repo: z.string(), pr_number: z.number().int().positive(), token: z.string(), min_complexity: z.number().int().min(1).optional(), dry_run: z.boolean().optional() }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ session_id, repo, pr_number, token, min_complexity = 15, dry_run = false }) => {
  const data = await getSession(session_id);
  if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) return { content: [{ type: 'text', text: 'Invalid repo format. Use "owner/repo".' }] };
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: token });
  let prFiles: any[];
  try { const { data: files } = await octokit.pulls.listFiles({ owner, repo: repoName, pull_number: pr_number, per_page: 100 }); prFiles = files; }
  catch (err: any) { return { content: [{ type: 'text', text: `Failed to fetch PR files: ${err.message}` }] }; }
  const changedPaths = new Set(prFiles.map((f: any) => f.filename));
  const secByFile = new Map<string, any[]>();
  for (const s of data.security ?? []) { if (!s.file) continue; if (!secByFile.has(s.file)) secByFile.set(s.file, []); secByFile.get(s.file)!.push(s); }
  const circFiles = new Set((data.patterns ?? []).filter((p: any) => p.type === 'circular').flatMap((p: any) => p.files ?? []));
  const complexByFile = new Map<string, {fn: string; complexity: number}[]>();
  for (const file of data.files) { for (const fn of (file as any).functions ?? []) { if ((fn.complexity ?? 0) >= min_complexity) { if (!complexByFile.has(file.path)) complexByFile.set(file.path, []); complexByFile.get(file.path)!.push({fn: fn.name, complexity: fn.complexity ?? 0}); } } }
  type RC = {path: string; position: number; body: string};
  const comments: RC[] = [];
  for (const pf of prFiles) {
    const fp = pf.filename; const findings: string[] = [];
    for (const s of secByFile.get(fp) ?? []) findings.push(`🔴 **Security:** ${s.type ?? 'issue'} — ${s.description ?? 'potential vulnerability'}`);
    if (circFiles.has(fp)) findings.push(`🟡 **Circular dependency:** This file participates in a dependency cycle.`);
    for (const {fn, complexity} of complexByFile.get(fp) ?? []) findings.push(`🟠 **High complexity:** \`${fn}\` has cyclomatic complexity ${complexity} (threshold: ${min_complexity}).`);
    if (findings.length > 0 && pf.patch) comments.push({path: fp, position: 1, body: `**Grasp Analysis Findings**\n\n${findings.join('\n\n')}\n\n*Generated by [grasp](https://github.com/ashfordeOU/grasp)*`});
  }
  if (dry_run) { const output = {posted: 0, skipped: changedPaths.size - comments.length, comments, dryRun: true}; return {content: [{type: 'text', text: truncate(JSON.stringify(output, null, 2))}], structuredContent: output}; }
  let posted = 0;
  if (comments.length > 0) {
    try { await octokit.pulls.createReview({owner, repo: repoName, pull_number: pr_number, event: 'COMMENT', body: `Grasp found ${comments.length} finding(s).`, comments: comments.map(c => ({path: c.path, position: c.position, body: c.body}))}); posted = comments.length; }
    catch (err: any) { return {content: [{type: 'text', text: `Failed to post review: ${err.message}`}]}; }
  }
  const output = {posted, skipped: changedPaths.size - comments.length, comments, dryRun: false, prUrl: `https://github.com/${repo}/pull/${pr_number}`};
  return {content: [{type: 'text', text: truncate(JSON.stringify(output, null, 2))}], structuredContent: output};
});

// =====================================================================
// TOOL: grasp_config_check
// =====================================================================
server.registerTool('grasp_config_check', {
  description: 'Run grasp.yml architecture rules against a session — returns violations with severity and file',
  inputSchema: {
    session_id: z.string().describe('Session ID from grasp_analyze'),
    config_path: z.string().optional().describe('Optional path to directory containing grasp.yml (defaults to session source path)'),
  },
}, async ({ session_id, config_path }) => {
  const session = sessionStore.get(session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found. Run grasp_analyze first.' }] };
  const dir = config_path ?? (session.source.type === 'local' ? session.source.path : process.cwd());
  const { loadGraspConfig, evaluateRules } = await import('./config.js');
  const cfg = await loadGraspConfig(dir);
  if (!cfg) return { content: [{ type: 'text', text: `No grasp.yml found in ${dir}` }] };
  const blastMap: Record<string, number> = {};
  for (const conn of session.result.connections) {
    blastMap[conn.source] = (blastMap[conn.source] ?? 0) + 1;
  }
  const violations = evaluateRules(cfg, {
    score: session.result.summary.healthScore,
    blastMap,
    layers: session.result.summary.layers ?? [],
  });
  if (violations.length === 0) {
    return { content: [{ type: 'text', text: '✅ All grasp.yml rules passed.' }] };
  }
  const lines = violations.map(v =>
    `${v.severity === 'error' ? '❌' : '⚠️'} [${v.rule}]${v.file ? ` ${v.file}` : ''}: ${v.message}`
  );
  return { content: [{ type: 'text', text: `${violations.length} rule violation(s):\n\n${lines.join('\n')}` }] };
});

// =====================================================================
// TOOL: grasp_service_graph
// =====================================================================
server.registerTool('grasp_service_graph', {
  description: 'Build a service-level dependency graph from OTEL or custom trace JSON — maps inter-service call volumes',
  inputSchema: {
    traces_json: z.string().describe('JSON array of {service, calls:[{to,count}]} objects or OTEL resourceSpans'),
  },
}, async ({ traces_json }) => {
  const { buildServiceGraph } = await import('./distributed.js');
  let traces;
  try {
    const raw = JSON.parse(traces_json);
    // Support OTEL format: extract service names from resourceSpans
    if (raw.resourceSpans) {
      traces = raw.resourceSpans.map((rs: any) => ({
        service: rs.resource?.attributes?.find((a: any) => a.key === 'service.name')?.value?.stringValue ?? 'unknown',
        calls: [],
      }));
    } else {
      traces = Array.isArray(raw) ? raw : [];
    }
  } catch { return { content: [{ type: 'text', text: 'Invalid JSON' }] }; }
  const graph = buildServiceGraph(traces);
  return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
});

server.registerTool('grasp_jira_issues', {
  description: 'Map Jira issues to source files — finds which files are referenced in issue titles and descriptions',
  inputSchema: {
    session_id: z.string(),
    jira_base_url: z.string().describe('e.g. https://acme.atlassian.net'),
    jira_email: z.string(),
    jira_token: z.string(),
    project_key: z.string().describe('Jira project key e.g. ENG'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const { fetchJiraIssues, parseJiraIssues } = await import('./jira.js');
  const issues = await fetchJiraIssues(args.jira_base_url, args.jira_email, args.jira_token, args.project_key);
  const files = session.result.files.map((f: any) => f.path);
  const mapped = parseJiraIssues(issues, files);
  const lines = Object.entries(mapped).map(([f, iss]) => `${f}: ${iss.map(i => i.key).join(', ')}`);
  return { content: [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : 'No Jira issues matched any files.' }] };
});

// TOOL: grasp_req_trace
server.registerTool('grasp_req_trace', {
  title: 'Requirement Traceability',
  description: 'Map requirements to source code — shows coverage, uncovered requirements, and unspecified code for DO-178C / ECSS compliance',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    requirements: z.array(z.object({ id: z.string(), desc: z.string(), level: z.string().optional() })).describe('List of requirements {id, desc, level}'),
    prefix: z.string().optional().describe('Requirement ID prefix — default REQ'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const prefix = args.prefix ?? 'REQ';
  const tagRe = new RegExp(`[@#]?(${prefix}-[A-Z0-9_-]+)`, 'gi');
  const reqMap: Record<string, Array<{file:string,path:string,line:number}>> = {};
  args.requirements.forEach(r => { reqMap[r.id.toUpperCase()] = []; });
  const unspecified: string[] = [];
  for (const f of session.result.files as any[]) {
    if (!f.content || !f.isCode) continue;
    const lines: string[] = f.content.split('\n');
    const fileReqs: string[] = [];
    lines.forEach((line: string, idx: number) => {
      let m: RegExpExecArray | null;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(line)) !== null) {
        const id = m[1].toUpperCase();
        fileReqs.push(id);
        if (!reqMap[id]) reqMap[id] = [];
        reqMap[id].push({ file: f.name, path: f.path, line: idx + 1 });
      }
    });
    if (fileReqs.length === 0 && f.lines > 10) unspecified.push(f.path);
  }
  const covered = args.requirements.filter(r => reqMap[r.id.toUpperCase()]?.length > 0).map(r => ({ ...r, coveredBy: reqMap[r.id.toUpperCase()] }));
  const uncovered = args.requirements.filter(r => !reqMap[r.id.toUpperCase()]?.length);
  const coveragePct = args.requirements.length ? Math.round(covered.length / args.requirements.length * 100) : 0;
  const lines: string[] = [
    `Requirement Traceability — ${prefix}`,
    `Coverage: ${coveragePct}% (${covered.length}/${args.requirements.length})`,
    '',
    `COVERED (${covered.length}):`,
    ...covered.map(r => `  ${r.id}: ${r.desc} → ${r.coveredBy.map((c:any) => c.path+':'+c.line).join(', ')}`),
    '',
    `UNCOVERED (${uncovered.length}):`,
    ...uncovered.map(r => `  ${r.id}: ${r.desc}`),
    '',
    `UNSPECIFIED FILES (no ${prefix} tag, ${unspecified.length} files):`,
    ...unspecified.slice(0, 20).map(p => `  ${p}`),
    unspecified.length > 20 ? `  ... and ${unspecified.length - 20} more` : '',
  ].filter(l => l !== undefined);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_anomaly
server.registerTool('grasp_anomaly', {
  title: 'Anomaly Investigation',
  description: 'Build a structured investigation package for a suspect file — callers, callees, transitive blast radius, security issues in the call chain, and a plain-English summary',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    suspect_file: z.string().describe('Path of the suspect file to investigate'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;
  const suspect = args.suspect_file;
  const calledBy: Map<string, string[]> = new Map();
  const callsInto: Map<string, string[]> = new Map();
  for (const c of data.connections as any[]) {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    const tgt = typeof c.target === 'object' ? c.target.id : c.target;
    if (tgt === suspect) { if (!calledBy.has(src)) calledBy.set(src, []); calledBy.get(src)!.push(c.fn); }
    if (src === suspect) { if (!callsInto.has(tgt)) callsInto.set(tgt, []); callsInto.get(tgt)!.push(c.fn); }
  }
  // Transitive BFS
  const visited = new Set([suspect]);
  const queue = [...calledBy.keys()];
  const transitive: string[] = [];
  while (queue.length && transitive.length < 100) {
    const f = queue.shift()!; if (visited.has(f)) continue; visited.add(f); transitive.push(f);
    for (const c of data.connections as any[]) { const tgt = typeof c.target === 'object' ? c.target.id : c.target; if (tgt === f) { const src = typeof c.source === 'object' ? c.source.id : c.source; if (!visited.has(src)) queue.push(src); } }
  }
  const chainFiles = new Set([suspect, ...calledBy.keys(), ...callsInto.keys()]);
  const secIssues = (data.securityIssues as any[] ?? []).filter((s: any) => chainFiles.has(s.path) || chainFiles.has(s.file));
  const lines = [
    `Anomaly Investigation: ${suspect}`,
    `Blast Radius: ${calledBy.size + transitive.length} files affected`,
    '',
    `CALLERS (${calledBy.size}):`,
    ...[...calledBy.entries()].map(([f, fns]) => `  ${f}: ${fns.slice(0, 3).join(', ')}`),
    '',
    `CALLS INTO (${callsInto.size}):`,
    ...[...callsInto.entries()].map(([f, fns]) => `  ${f}: ${fns.slice(0, 3).join(', ')}`),
    '',
    `TRANSITIVE DEPENDENTS (${transitive.length}):`,
    ...transitive.slice(0, 20).map(f => `  ${f}`),
    transitive.length > 20 ? `  ... and ${transitive.length - 20} more` : '',
    '',
    `SECURITY ISSUES IN CHAIN (${secIssues.length}):`,
    ...secIssues.map((s: any) => `  [${s.severity.toUpperCase()}] ${s.title} — ${s.path ?? s.file}${s.line ? ':' + s.line : ''}`),
  ].filter(l => l !== undefined);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_reuse
server.registerTool('grasp_reuse', {
  title: 'Software Reuse Assessment',
  description: 'Assess whether a candidate module can be safely reused in a target project — produces Red/Amber/Green compatibility matrix across interface, dependencies, security, and architecture',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id_candidate: z.string().describe('Session ID of the candidate module to assess'),
    session_id_target: z.string().describe('Session ID of the target project'),
    module_path: z.string().optional().describe('Optional: restrict candidate assessment to this folder prefix'),
  },
}, async (args) => {
  const sessA = sessionStore.get(args.session_id_candidate);
  const sessB = sessionStore.get(args.session_id_target);
  if (!sessA) return { content: [{ type: 'text', text: 'Candidate session not found.' }] };
  if (!sessB) return { content: [{ type: 'text', text: 'Target session not found.' }] };
  const candData = sessA.result;
  const tgtData = sessB.result;
  const pfx = args.module_path;
  const candFiles = (candData.files as any[]).filter(f => !pfx || f.path.startsWith(pfx));
  const candExported = candFiles.flatMap((f: any) => (f.functions ?? []).filter((fn: any) => fn.isExported).map((fn: any) => fn.name));
  const tgtCalledFns = new Set((tgtData.connections as any[]).map((c: any) => c.fn));
  const matched = candExported.filter((fn: string) => tgtCalledFns.has(fn));
  const ifacePct = candExported.length ? Math.round(matched.length / candExported.length * 100) : 100;
  const candImports = new Set((candData.connections as any[]).filter((c: any) => {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    return !pfx || src.startsWith(pfx);
  }).map((c: any) => typeof c.target === 'object' ? c.target.id : c.target));
  const tgtFilePaths = new Set((tgtData.files as any[]).map((f: any) => f.path));
  const missingDeps = [...candImports].filter(p => !tgtFilePaths.has(p) && !p.includes('node_modules'));
  const candSecHigh = (candData.securityIssues as any[] ?? []).filter((s: any) => s.severity === 'high' || s.severity === 'critical');
  const statusOf = (ok: boolean, warn: boolean) => ok ? 'GREEN' : warn ? 'AMBER' : 'RED';
  const dims = [
    { name: 'Interface Compatibility', status: statusOf(ifacePct >= 80, ifacePct >= 50), detail: `${ifacePct}% of exported functions used (${matched.length}/${candExported.length})` },
    { name: 'Dependency Coverage', status: statusOf(missingDeps.length === 0, missingDeps.length <= 2), detail: missingDeps.length === 0 ? 'All satisfied' : `${missingDeps.length} missing: ${missingDeps.slice(0, 3).join(', ')}` },
    { name: 'Security', status: statusOf(candSecHigh.length === 0, candSecHigh.length <= 2), detail: candSecHigh.length === 0 ? 'No critical/high issues' : `${candSecHigh.length} critical/high issues` },
  ];
  const blockers = dims.filter(d => d.status === 'RED');
  const warnings = dims.filter(d => d.status === 'AMBER');
  const verdict = blockers.length === 0 && warnings.length === 0 ? 'Safe to reuse' : blockers.length === 0 ? `Needs adaptation (${warnings.length} warning(s))` : `Do not reuse (${blockers.length} blocker(s))`;
  const lines = [`Software Reuse Assessment`, `Verdict: ${verdict}`, '', 'Compatibility Matrix:',
    ...dims.map(d => `  ${d.status === 'GREEN' ? '✅' : d.status === 'AMBER' ? '⚠️' : '❌'} ${d.name}: ${d.detail}`),
    '', blockers.length > 0 ? 'BLOCKERS:' : '', ...blockers.map(b => `  ❌ ${b.name}: ${b.detail}`),
    warnings.length > 0 ? 'WARNINGS:' : '', ...warnings.map(w => `  ⚠️ ${w.name}: ${w.detail}`),
  ].filter(l => l !== undefined);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_safety_trace
server.registerTool('grasp_safety_trace', {
  title: 'Safety Constraint Tracer',
  description: 'Identify ungated output paths — paths from entry points to output files that do not pass through any designated safety gate file',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    gates: z.array(z.string()).describe('File paths that are safety gates (e.g. content filters, sanitizers)'),
    entry_points: z.array(z.string()).optional().describe('Entry point file paths (auto-detected from ui/api layer if omitted)'),
    output_points: z.array(z.string()).optional().describe('Output file paths (auto-detected from data/services layer if omitted)'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;
  const adj: Map<string, string[]> = new Map();
  for (const c of data.connections as any[]) {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    const tgt = typeof c.target === 'object' ? c.target.id : c.target;
    if (!adj.has(src)) adj.set(src, []); adj.get(src)!.push(tgt);
  }
  const gateSet = new Set(args.gates);
  const entryFiles = args.entry_points?.length ? args.entry_points : (data.files as any[]).filter((f: any) => f.layer === 'ui' || f.layer === 'api').map((f: any) => f.path).slice(0, 5);
  const outputFiles = new Set(args.output_points?.length ? args.output_points : (data.files as any[]).filter((f: any) => f.layer === 'data' || f.layer === 'services').map((f: any) => f.path).slice(0, 10));
  const ungatedPaths: string[][] = [];
  function dfs(path: string[], cur: string): void {
    if (path.length > 12 || ungatedPaths.length > 10) return;
    if (gateSet.has(cur)) return;
    if (outputFiles.has(cur)) { ungatedPaths.push([...path, cur]); return; }
    for (const next of adj.get(cur) ?? []) { if (!path.includes(next)) dfs([...path, cur], next); }
  }
  for (const e of entryFiles) dfs([], e);
  const gatedPct = gateSet.size > 0 ? Math.round((1 - ungatedPaths.length / Math.max(1, entryFiles.length)) * 100) : 0;
  const lines = [
    `Safety Constraint Tracer`,
    `Gates configured: ${args.gates.length}`,
    `Ungated paths found: ${ungatedPaths.length}`,
    `Coverage estimate: ${gatedPct}%`,
    '',
    ungatedPaths.length > 0 ? 'UNGATED PATHS (paths without a safety gate):' : '✅ No ungated paths found',
    ...ungatedPaths.map((p, i) => `  ${i + 1}. ${p.map(f => f.split('/').pop()).join(' → ')}`),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_run_diff
server.registerTool('grasp_run_diff', {
  title: 'Training Run Dependency Diff',
  description: 'Diff two training run configs (YAML or JSON) and identify which code files are affected by each changed hyperparameter or data pipeline key',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    config_a: z.string().describe('First config as JSON or YAML string'),
    config_b: z.string().describe('Second config as JSON or YAML string'),
    format: z.enum(['json', 'yaml']).optional().default('json'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;

  function parseConfig(raw: string, fmt: string): Record<string, unknown> {
    if (fmt === 'yaml') {
      // Minimal YAML key: value parser (flat)
      const obj: Record<string, unknown> = {};
      for (const line of raw.split('\n')) {
        const m = line.match(/^(\s*)(\w[\w.-]*)\s*:\s*(.*)$/);
        if (m && !m[3].startsWith('#')) {
          const val = m[3].trim();
          obj[m[2]] = val === '' ? null : isNaN(Number(val)) ? val.replace(/^['"]|['"]$/g, '') : Number(val);
        }
      }
      return obj;
    }
    try { return JSON.parse(raw); } catch { return {}; }
  }

  const cfgA = parseConfig(args.config_a, args.format ?? 'json');
  const cfgB = parseConfig(args.config_b, args.format ?? 'json');

  // Compute flat key diff
  const allKeys = new Set([...Object.keys(cfgA), ...Object.keys(cfgB)]);
  const configDiff: Array<{ key: string; before: unknown; after: unknown; affectedFiles: string[] }> = [];

  // Pattern matching: find files that read a config key
  function findConfigReaders(key: string): string[] {
    const patterns = [
      new RegExp(`config\\.${key}\\b`),
      new RegExp(`args\\.${key}\\b`),
      new RegExp(`hparams\\[['"]${key}['"]\\]`),
      new RegExp(`os\\.getenv\\(['"]${key}['"]`),
      new RegExp(`FLAGS\\.${key}\\b`),
      new RegExp(`\\b${key}\\s*=`),
    ];
    return (data.files as any[])
      .filter((f: any) => f.content && patterns.some(p => p.test(f.content)))
      .map((f: any) => f.path)
      .slice(0, 8);
  }

  for (const key of allKeys) {
    const before = cfgA[key] ?? null;
    const after = cfgB[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      configDiff.push({ key, before, after, affectedFiles: findConfigReaders(key) });
    }
  }

  const allAffected = new Set(configDiff.flatMap(d => d.affectedFiles));
  const dataPipelineChanges = [...allAffected].filter(f => /\/data\/|\/dataset|\/dataload/i.test(f));
  const modelChanges = [...allAffected].filter(f => /\/model\/|\/network\/|\/arch/i.test(f));
  const evalChanges = [...allAffected].filter(f => /\/eval\/|\/metric\/|\/assess/i.test(f));

  const summary = `${configDiff.length} hyperparameter${configDiff.length !== 1 ? 's' : ''} changed, affecting ${allAffected.size} file${allAffected.size !== 1 ? 's' : ''}`;
  const lines = [
    '## Training Run Diff', '', `**${summary}**`, '',
    '### Config Changes',
    ...configDiff.map(d => `- **${d.key}**: \`${d.before}\` → \`${d.after}\`${d.affectedFiles.length ? `\n  Files: ${d.affectedFiles.map(f => f.split('/').pop()).join(', ')}` : ''}`),
    '',
    dataPipelineChanges.length ? `### Data Pipeline Changes (${dataPipelineChanges.length})\n${dataPipelineChanges.map(f => `- ${f}`).join('\n')}` : '',
    modelChanges.length ? `### Model Changes (${modelChanges.length})\n${modelChanges.map(f => `- ${f}`).join('\n')}` : '',
    evalChanges.length ? `### Eval Changes (${evalChanges.length})\n${evalChanges.map(f => `- ${f}`).join('\n')}` : '',
  ].filter(l => l !== '');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_eval_coverage
server.registerTool('grasp_eval_coverage', {
  title: 'Eval Coverage Map',
  description: 'Trace which codebase files are reached by eval/test scripts and identify safety-critical files with no eval coverage',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    eval_patterns: z.array(z.string()).optional().describe('Folder or file patterns for eval scripts (e.g. ["eval/", "*_eval.py"]). Auto-detected if omitted.'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;

  const evalPatterns = args.eval_patterns?.length
    ? args.eval_patterns
    : ['eval/', 'evals/', 'assessments/', 'benchmarks/', '_eval.py', '_test.py'];

  const evalFiles = (data.files as any[]).filter((f: any) =>
    evalPatterns.some(p => p.endsWith('/') ? f.path.includes(p) : f.path.includes(p) || f.name.endsWith(p.replace('*', '')))
  );

  // BFS from eval files through imports
  const adj: Map<string, string[]> = new Map();
  for (const c of data.connections as any[]) {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    const tgt = typeof c.target === 'object' ? c.target.id : c.target;
    if (!adj.has(src)) adj.set(src, []); adj.get(src)!.push(tgt);
  }

  const covered = new Set<string>();
  const queue = evalFiles.map((f: any) => f.path);
  covered.add(...(queue as any));
  for (let i = 0; i < queue.length && i < 500; i++) {
    for (const next of adj.get(queue[i]) ?? []) {
      if (!covered.has(next)) { covered.add(next); queue.push(next); }
    }
  }

  const allCodeFiles = (data.files as any[]).filter((f: any) => f.isCode);
  const uncoveredFiles = allCodeFiles.filter((f: any) => !covered.has(f.path));
  const coveredPct = Math.round(covered.size / Math.max(1, allCodeFiles.length) * 100);

  const lines = [
    '## Eval Coverage Map',
    `Eval files found: ${evalFiles.length}`,
    `Files covered by evals: ${covered.size} / ${allCodeFiles.length} (${coveredPct}%)`,
    '',
    evalFiles.length === 0 ? '⚠️ No eval files detected. Provide eval_patterns to specify eval script locations.' : '',
    uncoveredFiles.length > 0 ? `### Uncovered Files (${uncoveredFiles.length})` : '✅ All files reached by evals',
    ...uncoveredFiles.slice(0, 20).map((f: any) => `- ${f.path}`),
    uncoveredFiles.length > 20 ? `…and ${uncoveredFiles.length - 20} more` : '',
  ].filter(l => l !== '');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_sbom
server.registerTool('grasp_sbom', {
  title: 'SBOM Generator',
  description: 'Generate a Software Bill of Materials (CycloneDX or SPDX) from dependency files detected in the analysed repo',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    format: z.enum(['cyclonedx', 'spdx']).optional().default('cyclonedx'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;
  const depFileNames = ['requirements.txt', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'package.json'];
  const allDeps: Array<{ name: string; version: string; type: string }> = [];

  for (const f of data.files as any[]) {
    if (!f.content) continue;
    const fname = f.name;
    if (depFileNames.some(d => fname === d || fname.endsWith('/' + d))) {
      if (fname === 'package.json' || fname.endsWith('/package.json')) {
        try {
          const pkg = JSON.parse(f.content);
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          for (const [name, ver] of Object.entries(deps)) {
            allDeps.push({ name, version: String(ver).replace(/[\^~>=<]/, ''), type: 'npm' });
          }
        } catch { /* skip */ }
      } else {
        const parsed = Parser.parseDependencyFile(f.name, f.content);
        allDeps.push(...parsed);
      }
    }
  }

  const repoName = (data as any).repo || session.source || 'unknown';
  const now = new Date().toISOString();

  if ((args.format ?? 'cyclonedx') === 'spdx') {
    const spdx = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: String(repoName),
      documentNamespace: `https://grasp.tool/sbom/${Date.now()}`,
      created: now,
      packages: allDeps.map((d, i) => ({
        SPDXID: `SPDXRef-Package-${i}`,
        name: d.name,
        versionInfo: d.version,
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
      })),
    };
    return { content: [{ type: 'text', text: JSON.stringify(spdx, null, 2) }] };
  }

  const cdx = {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    serialNumber: `urn:uuid:${[8,4,4,4,12].map(n => Array.from({length:n},()=>(Math.random()*16|0).toString(16)).join('')).join('-')}`,
    version: 1,
    metadata: { timestamp: now, component: { type: 'library', name: String(repoName) } },
    components: allDeps.map(d => ({
      type: 'library', name: d.name, version: d.version,
      purl: `pkg:${d.type}/${d.name}@${d.version}`,
    })),
  };
  const lines = [
    `## SBOM (CycloneDX) — ${repoName}`,
    `Components: ${allDeps.length}`,
    '',
    '```json',
    JSON.stringify(cdx, null, 2).slice(0, 4000),
    allDeps.length > 20 ? '…(truncated — full SBOM available via export)' : '',
    '```',
  ].filter(l => l !== '');
  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// TOOL: grasp_dora
server.registerTool('grasp_dora', {
  title: 'DORA Metrics',
  description: 'Estimate DORA metrics (Deployment Frequency, Lead Time, Change Failure Rate, MTTR) from GitHub API data',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    token: z.string().describe('GitHub personal access token'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const src = session.source as string;
  const repoMatch = src?.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!repoMatch) return { content: [{ type: 'text', text: 'DORA metrics require a GitHub repo session.' }] };
  const repo = repoMatch[1].replace(/\.git$/, '');
  const headers = { Authorization: `Bearer ${args.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function ghFetch(path: string) {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: headers as any });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
    return res.json();
  }
  try {
    const [runsData, prsData] = await Promise.all([
      ghFetch('/actions/runs?event=push&status=success&per_page=100').catch(() => ({ workflow_runs: [] })),
      ghFetch('/pulls?state=closed&per_page=100&sort=updated').catch(() => []),
    ]);
    const runs: any[] = runsData.workflow_runs || [];
    const prs: any[] = Array.isArray(prsData) ? prsData : [];
    const now = Date.now();
    const ms30d = 30 * 24 * 3600 * 1000;
    const recent = runs.filter((r: any) => now - new Date(r.created_at).getTime() < ms30d);
    const deployFreq = recent.length / 30;
    const mergedPrs = prs.filter((p: any) => p.merged_at);
    const leadTimes = mergedPrs.map((p: any) => (new Date(p.merged_at).getTime() - new Date(p.created_at).getTime()) / 3600000);
    const avgLeadH = leadTimes.length ? leadTimes.reduce((a: number, b: number) => a + b, 0) / leadTimes.length : 0;
    const reverts = prs.filter((p: any) => p.title?.toLowerCase().includes('revert')).length;
    const cfrPct = prs.length ? Math.round(reverts / prs.length * 100) : 0;
    let tier = 'Low';
    if (deployFreq >= 1 && avgLeadH <= 1 && cfrPct <= 5) tier = 'Elite';
    else if (deployFreq >= 1/7 && avgLeadH <= 168 && cfrPct <= 10) tier = 'High';
    else if (deployFreq >= 1/30 && avgLeadH <= 720 && cfrPct <= 15) tier = 'Medium';
    const lines = [
      `## DORA Metrics — ${repo}`,
      `**Tier: ${tier}**`,
      '',
      `| Metric | Value | Tier |`,
      `|--------|-------|------|`,
      `| Deployment Frequency | ${deployFreq >= 1 ? deployFreq.toFixed(1) + '/day' : (deployFreq * 7).toFixed(1) + '/week'} | ${deployFreq >= 1 ? 'Elite' : deployFreq >= 1/7 ? 'High' : 'Medium'} |`,
      `| Lead Time | ${avgLeadH < 1 ? '<1h' : avgLeadH < 24 ? avgLeadH.toFixed(0) + 'h' : (avgLeadH/24).toFixed(1) + 'd'} | ${avgLeadH <= 1 ? 'Elite' : avgLeadH <= 168 ? 'High' : 'Medium'} |`,
      `| Change Failure Rate | ${cfrPct}% | ${cfrPct <= 5 ? 'Elite' : cfrPct <= 10 ? 'High' : 'Medium'} |`,
      '',
      `Based on ${recent.length} deployments and ${mergedPrs.length} merged PRs in the last 30 days.`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `DORA fetch failed: ${err.message}` }] };
  }
});

// TOOL: grasp_adr
server.registerTool('grasp_adr', {
  title: 'ADR Generator',
  description: 'Generate an Architecture Decision Record (MADR format) from codebase analysis data and optional PR context',
  annotations: { readOnlyHint: true },
  inputSchema: {
    session_id: z.string(),
    focus_files: z.array(z.string()).optional().describe('Files relevant to the architectural decision'),
    decision_context: z.string().optional().describe('Brief description of the decision being made'),
    api_key: z.string().optional().describe('Anthropic API key for Claude-powered ADR generation'),
  },
}, async (args) => {
  const session = sessionStore.get(args.session_id);
  if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
  const data = session.result;
  const stats = (data as any).stats || {};
  const focusFiles = args.focus_files || [];
  const relevant = (data.files as any[]).filter((f: any) => focusFiles.length === 0 || focusFiles.includes(f.path)).slice(0, 5);
  const context = [
    `Repo stats: ${stats.files} files, ${stats.functions} functions, ${stats.connections} connections, Health: ${stats.healthGrade || '?'} (${stats.healthScore || '?'}/100)`,
    `Focus files: ${relevant.map((f: any) => f.path).join(', ') || 'none specified'}`,
    `Architecture layers: ${[...new Set((data.files as any[]).map((f: any) => f.layer))].join(', ')}`,
    args.decision_context ? `Decision context: ${args.decision_context}` : '',
  ].filter(Boolean).join('\n');

  if (args.api_key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': args.api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: 'You are an architect documenting decisions. Given codebase analysis data, generate an ADR in MADR format. Focus on WHY, not what. Be concise.',
          messages: [{ role: 'user', content: `Generate an ADR for this codebase:\n\n${context}` }],
        }),
      });
      if (res.ok) {
        const json = await res.json() as any;
        return { content: [{ type: 'text', text: json.content?.[0]?.text || 'No response' }] };
      }
    } catch { /* fall through to template */ }
  }

  const adr = [
    `# Architecture Decision Record`,
    ``,
    `## Status`,
    `Proposed`,
    ``,
    `## Context`,
    `${args.decision_context || 'Add decision context here.'}`,
    ``,
    `Codebase context:`,
    `- ${stats.files} files across layers: ${[...new Set((data.files as any[]).map((f: any) => f.layer))].join(', ')}`,
    `- Health grade: ${stats.healthGrade || '?'} (${stats.healthScore || '?'}/100)`,
    focusFiles.length ? `- Focus: ${focusFiles.join(', ')}` : '',
    ``,
    `## Decision`,
    `[Describe the decision made]`,
    ``,
    `## Consequences`,
    `### Positive`,
    `- [Benefit 1]`,
    ``,
    `### Negative`,
    `- [Tradeoff 1]`,
    ``,
    `## Alternatives Considered`,
    `- [Alt 1]: [Why not chosen]`,
  ].filter(l => l !== '').join('\n');
  return { content: [{ type: 'text', text: adr }] };
});

server.registerTool('grasp_org_graph', {
  title: 'Org-Level Multi-Repo Dependency Graph',
  description: `Merge multiple analysis sessions into a single org-level graph. One node per repo, edges = inter-repo package dependencies detected by matching package.json names across sessions. Use after running grasp_analyze on 2+ repos.

Args:
  - session_ids: array of 2+ session IDs to merge
  - include_shared_libs: include shared library nodes used by 3+ repos (default true)`,
  inputSchema: {
    session_ids: z.array(z.string()).min(2).describe('Array of session IDs to merge into org graph'),
    include_shared_libs: z.boolean().optional().describe('Show shared lib nodes used by 3+ repos (default true)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const sessions: Array<{ id: string; data: AnalysisResult }> = [];
  for (const id of args.session_ids) {
    const d = await getSession(id);
    if (!d) return { content: [{ type: 'text', text: `Session not found: ${id}` }] };
    sessions.push({ id, data: d });
  }

  const repos = sessions.map(({ id, data }) => ({
    session_id: id,
    name: data.source || id,
    health: data.summary?.healthScore ?? 0,
    grade:  data.summary?.healthGrade ?? 'C',
    file_count: data.files?.length ?? 0,
    issue_count: data.issues?.length ?? 0,
    top_issues: (data.issues ?? []).slice(0, 3).map((i) => i.title ?? ''),
  }));

  // Detect inter-repo edges by matching repo names against imported function names and file paths.
  // AnalysisResult has no packageJson field — we derive package identity from data.source (the
  // "owner/repo" or "/local/path" string) and look for cross-repo references in connections.
  const edges: Array<{ from: string; to: string; type: string; weight: number }> = [];

  // Build a map: short repo name (last path segment of data.source) → session id
  const repoNameToId = new Map<string, string>();
  for (const { id, data } of sessions) {
    const shortName = data.source.split('/').pop() ?? data.source;
    if (shortName) repoNameToId.set(shortName.toLowerCase(), id);
    // Also register any dead-package names declared in this repo so that if another repo
    // references the same package name we can infer a dependency edge.
    for (const dp of data.deadPackages ?? []) {
      if (!repoNameToId.has(dp.name.toLowerCase())) {
        repoNameToId.set(dp.name.toLowerCase(), id);
      }
    }
  }

  for (const { id, data } of sessions) {
    // Collect names imported by this repo: function names from connections + dead package names
    const importedNames = new Set<string>();
    for (const conn of data.connections) {
      importedNames.add(conn.fn.toLowerCase());
      // file paths may contain the dep name (e.g. "node_modules/other-repo/index.js")
      const targetSegments = conn.target.split(/[/\\]/);
      for (const seg of targetSegments) importedNames.add(seg.toLowerCase());
    }
    for (const dp of data.deadPackages ?? []) {
      importedNames.add(dp.name.toLowerCase());
    }

    for (const [pkgName, targetId] of repoNameToId) {
      if (targetId === id) continue;
      if (importedNames.has(pkgName)) {
        const existing = edges.find(e => e.from === id && e.to === targetId);
        if (existing) existing.weight++;
        else edges.push({ from: id, to: targetId, type: 'repo-ref', weight: 1 });
      }
    }
  }

  const sharedLibs: Array<{ name: string; used_by: string[] }> = [];
  if (args.include_shared_libs !== false) {
    // Gather dead packages (declared deps) across all sessions as a proxy for shared lib usage
    const libUsage = new Map<string, string[]>();
    for (const { id, data } of sessions) {
      const declared = (data.deadPackages ?? []).map(dp => dp.name);
      for (const dep of declared) {
        if (!libUsage.has(dep)) libUsage.set(dep, []);
        libUsage.get(dep)!.push(id);
      }
    }
    for (const [name, usedBy] of libUsage) {
      if (usedBy.length >= 3) sharedLibs.push({ name, used_by: usedBy });
    }
  }

  const result = {
    repos,
    edges,
    shared_libs: sharedLibs,
    health_summary: {
      avg_health: Math.round(repos.reduce((s, r) => s + r.health, 0) / repos.length),
      highest: repos.reduce((a, b) => a.health > b.health ? a : b).name,
      lowest: repos.reduce((a, b) => a.health < b.health ? a : b).name,
      total_issues: repos.reduce((s, r) => s + r.issue_count, 0),
    },
  };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

server.registerTool('grasp_api_diff', {
  title: 'Breaking API Change Detector',
  description: `Compare two sessions of the same repo and detect breaking API changes — removed exports, parameter count changes. Returns severity-ranked list of breaking changes with affected caller counts.

Args:
  - session_id_old: baseline session
  - session_id_new: new session to compare against`,
  inputSchema: {
    session_id_old: z.string().describe('Baseline session ID'),
    session_id_new: z.string().describe('New session ID to compare against baseline'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_) return { content: [{ type: 'text', text: 'Old session not found' }] };
  if (!new_) return { content: [{ type: 'text', text: 'New session not found' }] };

  function buildExports(data: AnalysisResult) {
    const map = new Map<string, { params: number; file: string }>();
    for (const file of data.files ?? []) {
      for (const fn of file.functions ?? []) {
        if (fn.isExported) {
          const fnAny = fn as any;
          const paramCount = fnAny.params ?? fnAny.paramCount ?? 0;
          map.set(`${file.path}::${fn.name}`, { params: paramCount, file: file.path });
        }
      }
    }
    return map;
  }

  const oldExports = buildExports(old_);
  const newExports = buildExports(new_);

  const breaking: Array<{ severity: string; type: string; fn: string; file: string; detail: string; callers: number }> = [];

  for (const [key, val] of oldExports) {
    if (!newExports.has(key)) {
      const fnName = key.split('::')[1];
      const callers = (old_.connections ?? []).filter((c: Connection) => c.target === val.file && c.fn === fnName).length;
      breaking.push({ severity: 'critical', type: 'removed', fn: fnName, file: val.file, detail: 'Export removed', callers });
    }
  }

  for (const [key, oldVal] of oldExports) {
    const newVal = newExports.get(key);
    if (newVal && newVal.params !== oldVal.params) {
      const fnName = key.split('::')[1];
      const callers = (old_.connections ?? []).filter((c: Connection) => c.target === oldVal.file && c.fn === fnName).length;
      breaking.push({ severity: 'high', type: 'signature', fn: fnName, file: oldVal.file, detail: `Params: ${oldVal.params} → ${newVal.params}`, callers });
    }
  }

  const added: string[] = [];
  for (const [key] of newExports) {
    if (!oldExports.has(key)) added.push(key.split('::')[1]);
  }

  breaking.sort((a, b) => b.callers - a.callers);

  const result = {
    breaking_changes: breaking,
    added_exports: added,
    breaking_count: breaking.length,
    added_count: added.length,
    summary: `${breaking.length} breaking changes (${breaking.filter(b => b.severity === 'critical').length} removed, ${breaking.filter(b => b.severity === 'high').length} signature changes), ${added.length} new exports`,
  };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_plugins — Plugin Extension-Point Map
// =====================================================================
server.registerTool('grasp_plugins', {
  title: 'Plugin Extension-Point Map',
  description: `Detect plugin extension points (registerPlugin, use(), extend(), addHook() patterns) and map which files expose them vs which files implement plugins. Flags tightly-coupled extension points (fan-in > 10).`,
  inputSchema: {
    session_id: z.string(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const PLUGIN_PATTERNS = /\b(registerPlugin|addPlugin|pluginManager|addHook|registerMiddleware)\b|\.use\s*\(|\.extend\s*\(/;
  const IMPL_PATTERNS = /\b(implements\s+\w*[Pp]lugin|extends\s+\w*[Pp]lugin|class\s+\w+\s+implements|Plugin\s*\{)/;

  const extensionPoints: Array<{ file: string; pattern: string; fan_in: number; coupled: boolean }> = [];
  const pluginFiles: Array<{ file: string; type: string }> = [];

  for (const file of data.files) {
    // content is string | null — use function names as proxy when content is unavailable
    const content: string = file.content ?? file.functions.map(f => f.name + ' ' + (f.code ?? '')).join('\n');
    if (!content) continue;

    const epMatch = content.match(PLUGIN_PATTERNS);
    if (epMatch) {
      const fanIn = data.connections.filter(c => c.target === file.path).length;
      extensionPoints.push({
        file: file.path,
        pattern: epMatch[0],
        fan_in: fanIn,
        coupled: fanIn > 10,
      });
    }

    if (IMPL_PATTERNS.test(content)) {
      pluginFiles.push({ file: file.path, type: 'plugin implementation' });
    }
  }

  const tightlyCoupled = extensionPoints.filter(e => e.coupled);
  const result = {
    extension_points: extensionPoints,
    plugin_implementations: pluginFiles,
    tightly_coupled: tightlyCoupled,
    summary: `${extensionPoints.length} extension points, ${pluginFiles.length} plugin implementations, ${tightlyCoupled.length} tightly coupled (fan-in > 10)`,
  };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_semver — Semantic Versioning Enforcer
// =====================================================================
server.registerTool('grasp_semver', {
  title: 'Semantic Versioning Enforcer',
  description: `Compare two sessions and determine if the version bump in package.json is semantically correct. Breaking changes (removed exports) require at least a minor bump. New exports require at least a minor bump. Fixes only = patch is correct.

Verdict: 'ok' | 'underbump' | 'breach'

Note: AnalysisResult does not carry a packageVersion field. Versions must be supplied via the session source string or are reported as 'unknown'.`,
  inputSchema: {
    session_id_old: z.string().describe('Baseline session'),
    session_id_new: z.string().describe('New session to compare'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_) return { content: [{ type: 'text', text: 'Old session not found' }] };
  if (!new_) return { content: [{ type: 'text', text: 'New session not found' }] };

  // AnalysisResult has no packageVersion/packageJson field — version is not persisted in sessions.
  // We fall back to 'unknown' and note it in the summary.
  const oldVer: string = (old_ as any).packageVersion ?? (old_ as any).packageJson?.version ?? 'unknown';
  const newVer: string = (new_ as any).packageVersion ?? (new_ as any).packageJson?.version ?? 'unknown';

  function parseSemver(v: string) {
    const parts = v.split('.').map(Number);
    return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
  }
  const ov = parseSemver(oldVer), nv = parseSemver(newVer);
  const actualBump = (oldVer === 'unknown' || newVer === 'unknown') ? 'unknown'
    : nv.major > ov.major ? 'major'
    : nv.minor > ov.minor ? 'minor'
    : nv.patch > ov.patch ? 'patch'
    : 'none';

  function getExportedFunctions(data: AnalysisResult): Set<string> {
    const s = new Set<string>();
    for (const file of data.files) {
      for (const fn of (file as any).functions ?? []) {
        if (fn.isExported) s.add(`${file.path}::${fn.name}`);
      }
    }
    return s;
  }

  const oldExp = getExportedFunctions(old_);
  const newExp = getExportedFunctions(new_);
  const removed = [...oldExp].filter(k => !newExp.has(k));
  const added = [...newExp].filter(k => !oldExp.has(k));

  const hasBreaking = removed.length > 0;
  const hasAdditions = added.length > 0;

  const required = hasBreaking ? 'minor-or-major' : hasAdditions ? 'minor-or-higher' : 'patch';
  let verdict: 'ok' | 'underbump' | 'breach' | 'unknown';
  if (actualBump === 'unknown') {
    verdict = 'unknown';
  } else if (hasBreaking && actualBump === 'patch') {
    verdict = 'breach';
  } else if (hasAdditions && actualBump === 'patch') {
    verdict = 'underbump';
  } else {
    verdict = 'ok';
  }

  const recommendation = verdict === 'breach'
    ? `Bump to minor or major — ${removed.length} exports removed`
    : verdict === 'underbump'
    ? `Consider bumping to minor — ${added.length} new exports added`
    : verdict === 'unknown'
    ? `Version info not available in sessions — pass packageVersion via session metadata or check package.json manually`
    : 'Version bump is semantically correct';

  const result = {
    old_version: oldVer,
    new_version: newVer,
    actual_bump: actualBump,
    required_bump: required,
    verdict,
    breaking_removed: removed,
    new_exports: added,
    recommendation,
    note: (oldVer === 'unknown' || newVer === 'unknown')
      ? 'AnalysisResult does not store packageVersion — version comparison unavailable; export surface analysis still valid'
      : undefined,
  };
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// =====================================================================
// grasp_pii_trace — PII / Sensitive Data Flow Tracer
// =====================================================================
server.registerTool('grasp_pii_trace', {
  title: 'PII / Sensitive Data Flow Tracer',
  description: `Trace all code paths that touch user-marked PII entry points (personally identifiable information, financial data). BFS through dependents, flags risky patterns: logging, unencrypted storage writes, URL parameters, external API calls.

Args:
  - session_id: analysis session
  - pii_sources: file paths marked as PII entry points`,
  inputSchema: {
    session_id: z.string(),
    pii_sources: z.array(z.string()).describe('File paths marked as PII entry points'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const RISKY_PATTERNS = [
    { re: /console\.(log|warn|error|info)\s*\(/, label: 'Logging PII to console', severity: 'high' },
    { re: /logger\.\w+\s*\(|winston\.|pino\.|bunyan\./, label: 'Logging PII via logger', severity: 'high' },
    { re: /localStorage\.setItem|sessionStorage\.setItem/, label: 'Storing PII in browser storage', severity: 'high' },
    { re: /writeFile|fs\.write|\.write\s*\(/, label: 'Writing PII to file', severity: 'high' },
    { re: /[?&][a-zA-Z_]*(?:email|user|name|id|token|key)[^=]*=/, label: 'PII in URL parameter', severity: 'critical' },
    { re: /URLSearchParams|url\.searchParams\.set/, label: 'PII appended to URL', severity: 'critical' },
    { re: /fetch\s*\(|axios\.\w+|http\.request|https\.request/, label: 'PII sent to external endpoint', severity: 'high' },
  ];

  // BFS through dependents from PII sources
  const piiFiles = new Set(args.pii_sources);
  const visited = new Set<string>();
  const queue = [...piiFiles];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    // Find files that this file is imported/called by (downstream consumers = files where this file is the source)
    const dependents = data.connections
      .filter(c => c.source === cur)
      .map(c => c.target);
    for (const dep of dependents) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  const violations: Array<{ file: string; pattern: string; severity: string; line: number }> = [];
  for (const filePath of visited) {
    const file = data.files.find(f => f.path === filePath);
    if (!file) continue;
    const content: string = file.content ?? '';
    if (!content) continue;
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      for (const { re, label, severity } of RISKY_PATTERNS) {
        if (re.test(line)) {
          violations.push({ file: filePath, pattern: label, severity, line: i + 1 });
        }
      }
    });
  }

  violations.sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0));
  const result = {
    pii_sources: args.pii_sources,
    files_in_flow: [...visited],
    flow_size: visited.size,
    violations,
    critical_count: violations.filter(v => v.severity === 'critical').length,
    summary: `${visited.size} files touch PII data. ${violations.length} risky patterns: ${violations.filter(v=>v.severity==='critical').length} critical, ${violations.filter(v=>v.severity==='high').length} high.`,
  };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_duties — Separation of Duties Validator
// =====================================================================
server.registerTool('grasp_duties', {
  title: 'Separation of Duties Validator',
  description: `Scans the codebase for separation-of-duties violations — cases where the same file or module both initiates a transaction/action AND approves/validates it. Critical for SOX, FDA 21 CFR Part 11, and security-sensitive systems.

Args:
  - session_id: analysis session
  - initiation_patterns: regex patterns identifying "initiate" code (optional, defaults to common financial/command patterns)
  - approval_patterns: regex patterns identifying "approve/validate" code (optional, defaults to common approval patterns)`,
  inputSchema: {
    session_id: z.string(),
    initiation_patterns: z.array(z.string()).optional().describe('Regex patterns for initiation code'),
    approval_patterns: z.array(z.string()).optional().describe('Regex patterns for approval/validation code'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const DEFAULT_INITIATION = [
    'createTransaction', 'submitOrder', 'initiateTransfer', 'recordTrade',
    'placeOrder', 'createEntry', 'submitRequest', 'dispatchEvent', 'executeCommand',
  ];
  const DEFAULT_APPROVAL = [
    'approveTransaction', 'validateOrder', 'authorizeTransfer', 'confirmTrade',
    'reviewOrder', 'auditEntry', 'approveRequest', 'verifyEvent', 'signOff',
    'authorize', 'approve', 'validate', 'verify',
  ];

  const initPatterns: string[] = args.initiation_patterns && args.initiation_patterns.length > 0
    ? args.initiation_patterns
    : DEFAULT_INITIATION;
  const aprvPatterns: string[] = args.approval_patterns && args.approval_patterns.length > 0
    ? args.approval_patterns
    : DEFAULT_APPROVAL;

  // Fix 3: pre-lowercase pattern arrays once, outside any loop
  const lowerInitPatterns = initPatterns.map(p => p.toLowerCase());
  const lowerAprvPatterns = aprvPatterns.map(p => p.toLowerCase());

  // Build sets of files that contain initiation or approval patterns
  const initiatorFiles = new Set<string>();
  const approverFiles = new Set<string>();

  // Helper: case-insensitive substring match for any pattern
  // Accepts pre-lowercased patterns; lowercases content once per call
  function matchesAny(content: string, lowerPatterns: string[]): string[] {
    const lower = content.toLowerCase();
    return lowerPatterns.filter(p => lower.includes(p));
  }

  // Fix 1: proximity-only co-occurrence check (FunctionDef only has `line`, not startLine/endLine)
  function hasProximityCoOccurrence(
    content: string,
    initMatches: string[],
    aprvMatches: string[],
  ): boolean {
    const lines = content.split('\n');
    const initLineNums: number[] = [];
    const aprvLineNums: number[] = [];
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (initMatches.some(p => lower.includes(p))) initLineNums.push(i);
      if (aprvMatches.some(p => lower.includes(p))) aprvLineNums.push(i);
    });
    for (const il of initLineNums) {
      for (const al of aprvLineNums) {
        if (Math.abs(il - al) <= 30) return true;
      }
    }
    return false;
  }

  type Violation = {
    severity: 'critical' | 'high' | 'medium';
    file: string;
    type: 'proximity' | 'same_file' | 'coupling';
    initiationPatterns: string[];
    approvalPatterns: string[];
    description: string;
  };

  const violations: Violation[] = [];

  // Phase 1: per-file scan
  for (const file of data.files) {
    const content: string = file.content ?? '';
    const initMatches = matchesAny(content, lowerInitPatterns);
    const aprvMatches = matchesAny(content, lowerAprvPatterns);

    if (initMatches.length > 0) initiatorFiles.add(file.path);
    if (aprvMatches.length > 0) approverFiles.add(file.path);

    if (initMatches.length > 0 && aprvMatches.length > 0) {
      // Determine severity: proximity within 30 lines → critical, else high
      const isCritical = hasProximityCoOccurrence(content, initMatches, aprvMatches);
      if (isCritical) {
        violations.push({
          severity: 'critical',
          file: file.path,
          type: 'proximity',
          initiationPatterns: initMatches,
          approvalPatterns: aprvMatches,
          description: `File contains both initiation (${initMatches.slice(0, 3).join(', ')}) and approval (${aprvMatches.slice(0, 3).join(', ')}) patterns within 30 lines — critical separation-of-duties violation.`,
        });
      } else {
        violations.push({
          severity: 'high',
          file: file.path,
          type: 'same_file',
          initiationPatterns: initMatches,
          approvalPatterns: aprvMatches,
          description: `File contains both initiation (${initMatches.slice(0, 3).join(', ')}) and approval (${aprvMatches.slice(0, 3).join(', ')}) patterns — same-file separation-of-duties violation.`,
        });
      }
    }
  }

  // Phase 2: coupling violations — a file that depends on both an initiator-file and an approver-file
  // Fix 2: conn.source = definer, conn.target = caller; build caller → set of callees map
  const dependencyMap = new Map<string, Set<string>>();
  for (const conn of data.connections) {
    if (!dependencyMap.has(conn.target)) dependencyMap.set(conn.target, new Set());
    dependencyMap.get(conn.target)!.add(conn.source);
  }

  const alreadyViolating = new Set(violations.map(v => v.file));
  for (const [src, targets] of dependencyMap.entries()) {
    if (alreadyViolating.has(src)) continue; // already flagged at higher severity
    const importsInitiator = [...targets].filter(t => initiatorFiles.has(t));
    const importsApprover = [...targets].filter(t => approverFiles.has(t));
    if (importsInitiator.length > 0 && importsApprover.length > 0) {
      violations.push({
        severity: 'medium',
        file: src,
        type: 'coupling',
        initiationPatterns: importsInitiator.map(f => `imports:${f}`),
        approvalPatterns: importsApprover.map(f => `imports:${f}`),
        description: `File imports both initiation modules (${importsInitiator.slice(0, 2).join(', ')}) and approval modules (${importsApprover.slice(0, 2).join(', ')}) — coupling violation.`,
      });
    }
  }

  // Sort: critical first, then high, then medium
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  violations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;
  const mediumCount = violations.filter(v => v.severity === 'medium').length;

  const result = {
    violations,
    summary: {
      total: violations.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      compliant: criticalCount === 0 && highCount === 0,
      checkedFiles: data.files.length,
    },
  };

  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_reg_impact — Regulatory Change Impact Mapper
// =====================================================================
server.registerTool('grasp_reg_impact', {
  title: 'Regulatory Change Impact Mapper',
  description: `Given a regulatory document section (GDPR article, HIPAA rule, SOX control, PCI-DSS requirement) and keywords describing what that regulation requires in code, finds all files that implement or touch that regulatory area and estimates the blast radius of a compliance change.

Args:
  - session_id: analysis session
  - regulation: human-readable regulation label, e.g. "GDPR Article 17 - Right to Erasure"
  - keywords: code-level keywords to search for, e.g. ["delete", "erasure", "forget", "remove", "purge", "user_data"]
  - scope_paths: optional list of path prefixes to restrict the search, e.g. ["src/user/", "api/"]`,
  inputSchema: {
    session_id: z.string(),
    regulation: z.string().describe('Regulation label, e.g. "GDPR Article 17 - Right to Erasure"'),
    keywords: z.array(z.string()).describe('Code-level keywords to search for'),
    scope_paths: z.array(z.string()).optional().describe('Restrict search to files under these path prefixes'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const lowerKeywords = args.keywords.map(k => k.toLowerCase());

  // Step 1: Filter files by scope_paths if provided
  const candidateFiles = args.scope_paths && args.scope_paths.length > 0
    ? data.files.filter(f => args.scope_paths!.some(prefix => f.path.startsWith(prefix)))
    : data.files;

  // Step 2: Scan each candidate file for keyword matches (case-insensitive)
  type DirectImpact = { file: string; matched_keywords: string[]; functions_count: number };
  const directImpactList: DirectImpact[] = [];
  const directImpactSet = new Set<string>();

  for (const file of candidateFiles) {
    const lowerContent = (file.content ?? '').toLowerCase();
    const matched = lowerKeywords.filter(kw => lowerContent.includes(kw));
    if (matched.length > 0) {
      directImpactList.push({
        file: file.path,
        matched_keywords: matched,
        functions_count: file.functions?.length ?? 0,
      });
      directImpactSet.add(file.path);
    }
  }

  // Step 3: Find transitive dependents — files that import any directly impacted file
  // Connection semantics: source = definer, target = caller/importer
  // So: conn.source === impactedFile → conn.target depends on it
  const transitiveSet = new Set<string>();
  for (const conn of data.connections) {
    if (directImpactSet.has(conn.source) && !directImpactSet.has(conn.target)) {
      transitiveSet.add(conn.target);
    }
  }

  const transitiveImpact = [...transitiveSet];
  const totalBlastRadius = directImpactSet.size + transitiveSet.size;

  // Step 4: Determine risk level
  let riskLevel: 'critical' | 'high' | 'medium' | 'low';
  if (totalBlastRadius > 50) {
    riskLevel = 'critical';
  } else if (totalBlastRadius > 20) {
    riskLevel = 'high';
  } else if (totalBlastRadius > 5) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  const summary = `${args.regulation} affects ${directImpactSet.size} file${directImpactSet.size !== 1 ? 's' : ''} directly, ${transitiveSet.size} transitively (${totalBlastRadius} total, ${riskLevel.toUpperCase()} risk)`;

  const result = {
    regulation: args.regulation,
    direct_impact: directImpactList,
    transitive_impact: transitiveImpact,
    total_blast_radius: totalBlastRadius,
    risk_level: riskLevel,
    summary,
  };

  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_latency — Finance Latency Hotspot Detection
// =====================================================================
server.registerTool('grasp_latency', {
  title: 'Finance Latency Hotspot Detection',
  description: `Detects code patterns that introduce latency risk in high-frequency trading or latency-sensitive financial systems — synchronous blocking calls in hot paths, GC-inducing allocations in loops, unnecessary serialization, lock contention patterns.

Args:
  - session_id: analysis session
  - language: language to scan for (default 'auto' — detected from file extensions)
  - severity_threshold: filter results by minimum severity: 'all', 'high', 'critical' (default 'all')`,
  inputSchema: {
    session_id: z.string(),
    language: z.enum(['java', 'cpp', 'c', 'python', 'javascript', 'typescript', 'go', 'rust', 'auto']).optional(),
    severity_threshold: z.enum(['all', 'high', 'critical']).optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const severityThreshold = args.severity_threshold ?? 'all';

  // Step 1: Auto-detect language from file extensions
  let detectedLanguage: string;
  if (!args.language || args.language === 'auto') {
    const extCount: Record<string, number> = {};
    for (const file of data.files) {
      const match = file.path.match(/\.([a-z0-9]+)$/i);
      if (match) {
        const ext = match[1].toLowerCase();
        extCount[ext] = (extCount[ext] ?? 0) + 1;
      }
    }
    const extToLang: Record<string, string> = {
      java: 'java',
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
      c: 'c',
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      go: 'go',
      rs: 'rust',
    };
    let bestExt = '';
    let bestCount = 0;
    for (const [ext, count] of Object.entries(extCount)) {
      if (count > bestCount) { bestCount = count; bestExt = ext; }
    }
    detectedLanguage = extToLang[bestExt] ?? 'unknown';
  } else {
    detectedLanguage = args.language;
  }

  // Step 2: Define latency pattern detectors
  type Severity = 'critical' | 'high' | 'medium';
  interface LatencyPattern {
    category: string;
    severity: Severity;
    languages: string[]; // empty = all
    // test applied to a single trimmed line
    test: (line: string, lineIndex: number, lines: string[]) => boolean;
    patternLabel: string;
  }

  // Helper: check if any of the 5 lines before lineIndex contain a for/while keyword
  function precedingLoopWithin5(lineIndex: number, lines: string[]): boolean {
    const start = Math.max(0, lineIndex - 5);
    for (let i = start; i < lineIndex; i++) {
      if (/\b(for|while)\b/.test(lines[i])) return true;
    }
    return false;
  }

  const patterns: LatencyPattern[] = [
    // Blocking I/O in hot path
    {
      category: 'Blocking I/O in hot path',
      severity: 'high',
      languages: [],
      patternLabel: 'Thread.sleep / TimeUnit.SLEEP / sleep( / wait( / Object.wait',
      test: (line) => /Thread\.sleep|TimeUnit\.SLEEP|(?<![a-zA-Z])sleep\s*\(|(?<![a-zA-Z])wait\s*\(|Object\.wait/i.test(line),
    },
    // Allocation in loop (java/cpp/c)
    {
      category: 'Allocation in loop',
      severity: 'high',
      languages: ['java', 'cpp', 'c'],
      patternLabel: 'new  inside for/while loop context',
      test: (line, lineIndex, lines) => /\bnew\s+/.test(line) && precedingLoopWithin5(lineIndex, lines),
    },
    // Lock contention
    {
      category: 'Lock contention',
      severity: 'high',
      languages: ['java', 'cpp', 'c'],
      patternLabel: 'synchronized( / pthread_mutex_lock / std::mutex / lock.lock() / ReentrantLock',
      test: (line) => /synchronized\s*\(|pthread_mutex_lock|std::mutex|lock\.lock\s*\(\)|ReentrantLock/.test(line),
    },
    // GC pressure
    {
      category: 'GC pressure',
      severity: 'critical',
      languages: ['java', 'python', 'csharp'],
      patternLabel: 'System.gc() / Runtime.getRuntime().gc() / gc.collect() / GC.Collect()',
      test: (line) => /System\.gc\s*\(\)|Runtime\.getRuntime\s*\(\)\.gc\s*\(\)|gc\.collect\s*\(\)|GC\.Collect\s*\(\)/.test(line),
    },
    // Serialization in hot path
    {
      category: 'Serialization in hot path',
      severity: 'high',
      languages: [],
      patternLabel: 'ObjectOutputStream / JSON.stringify in loop / pickle.dumps in loop / json.dumps in loop / Marshal.dump in loop',
      test: (line, lineIndex, lines) => {
        if (/ObjectOutputStream/.test(line)) return true;
        if (/JSON\.stringify/.test(line) && precedingLoopWithin5(lineIndex, lines)) return true;
        if (/pickle\.dumps/.test(line) && precedingLoopWithin5(lineIndex, lines)) return true;
        if (/json\.dumps/.test(line) && precedingLoopWithin5(lineIndex, lines)) return true;
        if (/Marshal\.dump/.test(line) && precedingLoopWithin5(lineIndex, lines)) return true;
        return false;
      },
    },
    // String concatenation in loop (java/python)
    {
      category: 'String concatenation in loop',
      severity: 'high',
      languages: ['java', 'python'],
      patternLabel: 'string += or string + " inside for/while loop',
      test: (line, lineIndex, lines) => {
        if (!precedingLoopWithin5(lineIndex, lines)) return false;
        return /\+= *"|= .*\+ *"/.test(line);
      },
    },
    // Blocking HTTP
    {
      category: 'Blocking HTTP',
      severity: 'high',
      languages: [],
      patternLabel: 'HttpURLConnection / urllib.urlopen / requests.get( / fetch( without async / http.get(',
      test: (line) => /HttpURLConnection|urllib\.urlopen|requests\.get\s*\(|http\.get\s*\(/.test(line)
        || (/\bfetch\s*\(/.test(line) && !/async/.test(line)),
    },
    // Memory barrier
    {
      category: 'Memory barrier',
      severity: 'medium',
      languages: ['java', 'cpp'],
      patternLabel: 'volatile field in tight loop / AtomicInteger.get() in loop',
      test: (line, lineIndex, lines) => {
        if (!precedingLoopWithin5(lineIndex, lines)) return false;
        return /\bvolatile\b/.test(line) || /AtomicInteger.*\.get\s*\(\)/.test(line);
      },
    },
    // System call overhead
    {
      category: 'System call overhead',
      severity: 'medium',
      languages: ['java'],
      patternLabel: 'System.currentTimeMillis() or System.nanoTime() in loop',
      test: (line, lineIndex, lines) => {
        if (!precedingLoopWithin5(lineIndex, lines)) return false;
        return /System\.currentTimeMillis\s*\(\)|System\.nanoTime\s*\(\)/.test(line);
      },
    },
  ];

  // Step 3: Determine which patterns apply given the detected language
  const effectiveLang = detectedLanguage;
  const applicablePatterns = patterns.filter(p =>
    p.languages.length === 0 || p.languages.includes(effectiveLang)
  );

  // Step 4: Severity filter
  const severityOrder: Record<Severity, number> = { medium: 1, high: 2, critical: 3 };
  const minSeverity = severityThreshold === 'critical' ? 3 : severityThreshold === 'high' ? 2 : 1;

  // Step 5: Scan each file
  type IssueEntry = {
    category: string;
    severity: Severity;
    line: number;
    snippet: string;
    pattern: string;
  };
  type HotspotEntry = { file: string; issues: IssueEntry[] };

  const hotspots: HotspotEntry[] = [];
  let totalIssues = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;

  for (const file of data.files) {
    const content = file.content ?? '';
    if (!content.trim()) continue;

    const lines = content.split('\n');
    const issues: IssueEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimEnd();
      for (const pat of applicablePatterns) {
        if (severityOrder[pat.severity] < minSeverity) continue;
        if (pat.test(trimmed, i, lines)) {
          issues.push({
            category: pat.category,
            severity: pat.severity,
            line: i + 1, // 1-based
            snippet: trimmed.trim().slice(0, 120),
            pattern: pat.patternLabel,
          });
          if (pat.severity === 'critical') criticalCount++;
          else if (pat.severity === 'high') highCount++;
          else mediumCount++;
          totalIssues++;
        }
      }
    }

    if (issues.length > 0) {
      hotspots.push({ file: file.path, issues });
    }
  }

  const result = {
    language_detected: detectedLanguage,
    hotspots,
    summary: {
      total_issues: totalIssues,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      files_affected: hotspots.length,
    },
  };

  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// grasp_model_risk — Financial Model Risk Audit
// =====================================================================
server.registerTool('grasp_model_risk', {
  title: 'Financial Model Risk Audit',
  description: `Audits quantitative financial code for model risk — validates that pricing models, risk calculations, and valuation functions follow best practices: test coverage, parameter validation, numerical stability checks, documentation, and version control patterns.

Args:
  - session_id: analysis session
  - model_paths: optional list of path prefixes to restrict audit (e.g. ["src/pricing/", "models/"])`,
  inputSchema: {
    session_id: z.string(),
    model_paths: z.array(z.string()).optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const financialKeywords = [
    'price', 'value', 'risk', 'vol', 'rate', 'npv', 'pnl', 'delta', 'gamma',
    'vega', 'theta', 'rho', 'hedge', 'option', 'future', 'swap', 'bond', 'yield',
    'duration', 'convexity', 'var', 'cvar', 'sharpe', 'alpha', 'beta',
  ];

  const financialKeywordRe = new RegExp(financialKeywords.join('|'), 'i');

  // Filter files by model_paths if provided; otherwise scan all files
  const targetFiles = args.model_paths && args.model_paths.length > 0
    ? data.files.filter(f => args.model_paths!.some(p => f.path.includes(p)))
    : data.files;

  // Build set of all file paths for test-counterpart check
  const allFilePaths = new Set(data.files.map(f => f.path));

  interface RiskFinding {
    category: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    lines?: number[];
  }

  interface FileFinding {
    file: string;
    risks: RiskFinding[];
  }

  const findings: FileFinding[] = [];
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;

  for (const file of targetFiles) {
    const content = file.content ?? '';
    const lines = content.split('\n');
    const risks: RiskFinding[] = [];

    // ---- 1. Hardcoded parameters (magic numbers in formulas) ----
    // Lines with numeric literals not in const/final/#define declarations
    // Only run on files that contain financial keywords to avoid false positives
    const constDeclRe = /^\s*(const|final|#define|val\s|let\s|var\s)/;
    const numericLiteralRe = /(?<![a-zA-Z0-9_])\d+\.?\d*(?!\s*[a-zA-Z_])/;
    const magicNumberLines: number[] = [];
    if (financialKeywordRe.test(content)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!constDeclRe.test(line) && numericLiteralRe.test(line)) {
          // Only flag lines that look like they are in expressions (have operators)
          if (/[+\-*/=<>]/.test(line) && /(?<![a-zA-Z0-9_])(?:0\.\d+|\d+\.\d+|(?<!\d)\d{2,}(?!\d))/.test(line)) {
            magicNumberLines.push(i + 1);
          }
        }
      }
    }
    if (magicNumberLines.length > 0) {
      risks.push({
        category: 'Hardcoded parameters',
        severity: 'high',
        description: 'Numeric literals used directly in expressions instead of named constants — changes require code edits rather than config updates.',
        lines: magicNumberLines.slice(0, 20),
      });
    }

    // ---- 2. No input validation ----
    // File has financial function names but no validation keywords
    const hasFinancialFunctions = financialKeywordRe.test(content) &&
      /function\s+\w*(price|value|risk|vol|rate|npv|pnl|delta|gamma|vega|theta|rho|hedge|option|future|swap|bond|yield|duration|convexity|var|cvar|sharpe|alpha|beta)\w*\s*\(/i.test(content);
    const hasValidation = /assert|raise ValueError|throw|ArgumentException|precondition/i.test(content) ||
      /if\s*\(.*[<>]/.test(content);
    if (hasFinancialFunctions && !hasValidation) {
      risks.push({
        category: 'No input validation',
        severity: 'medium',
        description: 'Financial functions detected without guard clauses or input validation — invalid inputs (negative rates, zero notional) may produce silently wrong results.',
      });
    }

    // ---- 3. Division without zero-check ----
    const divisionLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip full-line comments and strip inline comments before testing
      const strippedDiv = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (/\//.test(strippedDiv)) {
        if (/[a-zA-Z0-9_)\]]\s*\/\s*[a-zA-Z0-9_(]/.test(strippedDiv)) {
          // Check surrounding 3 lines for zero-check
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 2);
          const surroundingBlock = lines.slice(start, end + 1).join('\n');
          if (!/!=\s*0|>\s*0|abs\s*\(/.test(surroundingBlock)) {
            divisionLines.push(i + 1);
          }
        }
      }
    }
    if (divisionLines.length > 0) {
      risks.push({
        category: 'Division without zero-check',
        severity: 'high',
        description: 'Division operations found without adjacent zero-guard checks — risk of divide-by-zero runtime errors in production.',
        lines: divisionLines.slice(0, 20),
      });
    }

    // ---- 4. Floating point comparison ----
    const fpCompLines: number[] = [];
    const fpCompRe = /[!=]=\s*(?:0\.0|1\.0|-?\d+\.\d+)/;
    for (let i = 0; i < lines.length; i++) {
      if (fpCompRe.test(lines[i])) {
        fpCompLines.push(i + 1);
      }
    }
    if (fpCompLines.length > 0) {
      risks.push({
        category: 'Floating point comparison',
        severity: 'high',
        description: 'Exact equality/inequality comparison with float literals — floating-point precision errors make these comparisons unreliable; use epsilon-based checks.',
        lines: fpCompLines.slice(0, 20),
      });
    }

    // ---- 5. No test counterpart ----
    const baseName = file.path.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    if (baseName && financialKeywordRe.test(content)) {
      const hasTestFile =
        [...allFilePaths].some(p => {
          const normalised = p.replace(/\\/g, '/');
          return (
            normalised.includes(`test_${baseName}`) ||
            normalised.includes(`${baseName}_test`) ||
            normalised.includes(`${baseName}.test`) ||
            normalised.includes(`${baseName}.spec`)
          );
        });
      if (!hasTestFile) {
        risks.push({
          category: 'No test counterpart',
          severity: 'medium',
          description: `No test file found for "${baseName}" — financial model correctness must be verified by automated tests.`,
        });
      }
    }

    // ---- 6. Undocumented formula ----
    if (hasFinancialFunctions) {
      const hasDocstring = /\/\*\*|"""|'''|\/\/\/|#\s/.test(content);
      if (!hasDocstring) {
        risks.push({
          category: 'Undocumented formula',
          severity: 'low',
          description: 'Financial functions present but no docstrings or formula comments detected — mathematical assumptions and derivations should be documented.',
        });
      }
    }

    // ---- 7. NaN/Inf not checked ----
    const usesUnstableOps = /sqrt\s*\(|log\s*\(|pow\s*\(|exp\s*\(|Math\.sqrt|Math\.log|Math\.pow|Math\.exp/i.test(content);
    const hasNanCheck = /isnan|isinf|isfinite|math\.isnan|float\.IsNaN/i.test(content);
    if (usesUnstableOps && !hasNanCheck) {
      risks.push({
        category: 'NaN/Inf not checked',
        severity: 'high',
        description: 'File uses sqrt/log/pow/exp but has no NaN or Inf checks — domain errors (e.g. sqrt of negative, log of zero) silently produce NaN/Inf that propagate through calculations.',
      });
    }

    if (risks.length > 0) {
      findings.push({ file: file.path, risks });
      for (const r of risks) {
        if (r.severity === 'high') totalHigh++;
        else if (r.severity === 'medium') totalMedium++;
        else totalLow++;
      }
    }
  }

  const totalFindings = totalHigh + totalMedium + totalLow;
  const rawScore = totalHigh * 10 + totalMedium * 5 + totalLow * 2;
  const modelRiskScore = Math.min(100, rawScore);

  const result = {
    audited_files: targetFiles.length,
    findings,
    summary: {
      total_findings: totalFindings,
      high: totalHigh,
      medium: totalMedium,
      low: totalLow,
      model_risk_score: modelRiskScore,
    },
  };

  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});

// =====================================================================
// T12: grasp_subsystems — Kernel / OS Subsystem Boundary Map
// =====================================================================
server.registerTool('grasp_subsystems', {
  title: 'Kernel / OS Subsystem Boundary Map',
  description: 'Detect directory-level subsystem groupings in C/C++ repos (networking, fs, mm, drivers, arch, crypto, etc.) and flag cross-subsystem dependencies. Also supports user-defined subsystems via custom boundaries.',
  inputSchema: {
    session_id: z.string(),
    custom_boundaries: z.array(z.object({ name: z.string(), paths: z.array(z.string()) })).optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const DEFAULT_SUBSYSTEMS = [
    { name: 'networking', paths: ['net/', 'drivers/net/', 'include/net/'] },
    { name: 'filesystem', paths: ['fs/', 'include/linux/fs'] },
    { name: 'memory-management', paths: ['mm/', 'include/linux/mm'] },
    { name: 'drivers', paths: ['drivers/'] },
    { name: 'arch', paths: ['arch/'] },
    { name: 'crypto', paths: ['crypto/'] },
    { name: 'security', paths: ['security/'] },
    { name: 'kernel-core', paths: ['kernel/'] },
  ];
  const subsystems = [...DEFAULT_SUBSYSTEMS, ...(args.custom_boundaries ?? [])];

  function getSubsystem(filePath: string) {
    return subsystems.find(s => s.paths.some(p => filePath.startsWith(p)))?.name ?? 'other';
  }

  const crossBoundary: Array<{ from: string; to: string; from_subsystem: string; to_subsystem: string }> = [];
  for (const conn of data.connections ?? []) {
    const fromSys = getSubsystem(conn.source);
    const toSys = getSubsystem(conn.target);
    if (fromSys !== toSys && fromSys !== 'other' && toSys !== 'other') {
      crossBoundary.push({ from: conn.source, to: conn.target, from_subsystem: fromSys, to_subsystem: toSys });
    }
  }

  const subsystemStats = subsystems.map(s => ({
    name: s.name,
    file_count: (data.files ?? []).filter(f => s.paths.some(p => f.path.startsWith(p))).length,
    cross_boundary_deps: crossBoundary.filter(c => c.from_subsystem === s.name || c.to_subsystem === s.name).length,
  }));

  return { content: [{ type: 'text', text: truncate(JSON.stringify({ subsystems: subsystemStats, cross_boundary_violations: crossBoundary, summary: `${crossBoundary.length} cross-subsystem dependencies detected` }, null, 2)) }] };
});

// =====================================================================
// T13: grasp_abi_diff — ABI / API Stability Checker
// =====================================================================
server.registerTool('grasp_abi_diff', {
  title: 'ABI / API Stability Checker',
  description: 'Compare exported symbols between two sessions. For C/C++: function signatures in headers. For JS/TS: non-underscore exports. Flags removed exports (breaking), signature changes (breaking), new exports (non-breaking). Works for any language.',
  inputSchema: {
    session_id_old: z.string(),
    session_id_new: z.string(),
    header_only: z.boolean().optional().describe('Only check .h/.hpp header files (C/C++ mode)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_) return { content: [{ type: 'text', text: `Session "${args.session_id_old}" not found` }] };
  if (!new_) return { content: [{ type: 'text', text: `Session "${args.session_id_new}" not found` }] };

  function getExports(data: AnalysisResult, headerOnly: boolean) {
    const exports_: Array<{ symbol: string; file: string }> = [];
    for (const file of data.files ?? []) {
      if (headerOnly && !file.path.match(/\.(h|hpp|hxx)$/)) continue;
      for (const fn of file.functions ?? []) {
        if (fn.isExported || (fn.name && !fn.name.startsWith('_'))) {
          exports_.push({ symbol: `${file.path}::${fn.name}`, file: file.path });
        }
      }
    }
    return exports_;
  }

  const oldExps = getExports(old_, args.header_only ?? false);
  const newExps = getExports(new_, args.header_only ?? false);
  const oldSet = new Set(oldExps.map(e => e.symbol));
  const newSet = new Set(newExps.map(e => e.symbol));

  const removed = oldExps.filter(e => !newSet.has(e.symbol)).map(e => ({ ...e, change: 'removed' }));
  const added = newExps.filter(e => !oldSet.has(e.symbol)).map(e => ({ ...e, change: 'added' }));

  const stability_score = oldExps.length === 0 ? 100 : Math.round(((oldExps.length - removed.length) / oldExps.length) * 100);
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ stability_score, removed, added, summary: `ABI stability: ${stability_score}/100. ${removed.length} removed (breaking), ${added.length} added (non-breaking).` }, null, 2)) }] };
});

server.registerTool('grasp_kconfig', {
  title: 'Kconfig / Build-Time Conditional Analysis',
  description: 'Parse Kconfig files and #ifdef CONFIG_* patterns in C files. Maps config options to conditionally compiled files. Detects high-risk toggles (affecting >50 files) and dead code under specific configs.',
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const configUsage = new Map<string, string[]>();
  for (const file of data.files ?? []) {
    const content: string = file.content ?? '';
    const matches = content.match(/CONFIG_[A-Z0-9_]+/g) ?? [];
    const seen = new Set(matches);
    for (const cfg of seen) {
      if (!configUsage.has(cfg)) configUsage.set(cfg, []);
      configUsage.get(cfg)!.push(file.path);
    }
  }

  const options = [...configUsage.entries()].map(([name, files]) => ({ name, file_count: files.length, high_risk: files.length > 50, files: files.slice(0, 10) }));
  options.sort((a, b) => b.file_count - a.file_count);
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ config_options: options.slice(0, 50), high_risk_toggles: options.filter(o => o.high_risk), summary: `${options.length} config options. ${options.filter(o => o.high_risk).length} affect >50 files.` }, null, 2)) }] };
});

server.registerTool('grasp_irq', {
  title: 'IRQ / Interrupt Dependency Graph',
  description: 'Detect interrupt handler patterns and trace their call chains. Flags: dynamic allocation (malloc/new) in IRQ chain, sleeping calls in IRQ chain, excessive call depth from interrupt context.',
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const IRQ_PATTERNS = /\birq_handler\b|__irqhandler|ISR_VECTOR|INTERRUPT\s+PROCEDURE|xTaskCreate.*Interrupt|IRQ_CONNECT\s*\(/;
  const ALLOC_PATTERNS = /\bmalloc\b|\bcalloc\b|\bnew\s+\w+/;
  const SLEEP_PATTERNS = /\bsleep\b|\bdelay\b|\bwait\b|\bmsDelay\b|\bvTaskDelay\b/;

  const irqHandlers: Array<{ file: string; fn: string; violations: string[] }> = [];
  for (const file of data.files ?? []) {
    const content: string = file.content ?? '';
    if (!IRQ_PATTERNS.test(content)) continue;
    const violations: string[] = [];
    if (ALLOC_PATTERNS.test(content)) violations.push('Dynamic allocation in IRQ context (forbidden in safety-critical RTOS)');
    if (SLEEP_PATTERNS.test(content)) violations.push('Blocking/sleep call in IRQ handler (causes system hang)');
    // Call depth: count files this IRQ handler file calls into
    const fanOut = (data.connections ?? []).filter(c => c.source === file.path).length;
    if (fanOut > 5) violations.push(`Fan-out ${fanOut} direct callees from IRQ handler (>5 increases stack overflow risk)`);
    irqHandlers.push({ file: file.path, fn: 'IRQ handler', violations });
  }

  return { content: [{ type: 'text', text: truncate(JSON.stringify({ irq_handlers: irqHandlers, violations_total: irqHandlers.reduce((s, h) => s + h.violations.length, 0), summary: `${irqHandlers.length} IRQ handlers. ${irqHandlers.filter(h => h.violations.length > 0).length} have violations.` }, null, 2)) }] };
});

// =====================================================================
// grasp_patch_impact — Patch Series Impact Analyzer
// =====================================================================
server.registerTool('grasp_patch_impact', {
  title: 'Patch Series Impact Analyzer',
  description: 'Given an ordered list of commit SHAs, rank patches by blast radius and subsystem crossings. Helps kernel/OS reviewers prioritize which patches in a series need most attention.',
  inputSchema: {
    session_id: z.string(),
    commits: z.array(z.string()).describe('Ordered list of commit SHAs in the patch series'),
    token: z.string().optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const timeline: any[] = (data as any).timeline ?? [];
  const patches = args.commits.map((sha, i) => {
    const commit = timeline.find((t: any) => t.hash?.startsWith(sha)) ?? { hash: sha, files: [] };
    const changedFiles: string[] = commit.files ?? [];
    const blastRadius = changedFiles.reduce((sum: number, f: string) => {
      // target = caller/dependent; files that depend ON f
      return sum + (data.connections ?? []).filter(c => c.target === f).length;
    }, 0);
    const complexity = changedFiles.reduce((sum: number, f: string) => {
      const file = (data.files ?? []).find(fl => fl.path === f);
      // use functions count as a proxy for complexity if dedicated field not available
      return sum + (file?.functions?.length ?? 0);
    }, 0);
    return { patch: i + 1, sha, files_changed: changedFiles.length, blast_radius: blastRadius, complexity, review_priority: blastRadius + complexity };
  });

  patches.sort((a, b) => b.review_priority - a.review_priority);
  const safeMax = patches.length > 0 ? Math.max(...patches.map(p => p.blast_radius)) : 0;
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ patches_ranked: patches, series_summary: { total_files: patches.reduce((s,p)=>s+p.files_changed,0), max_blast_radius: safeMax, review_first: patches[0]?.sha }, summary: `Series of ${patches.length} patches. Review patch ${patches[0]?.patch ?? 1}/${patches.length} first (blast radius ${patches[0]?.blast_radius ?? 0}).` }, null, 2)) }] };
});

server.registerTool('grasp_good_first_issues', {
  title: 'Good First Issue Generator',
  description: 'Identify ideal first-contribution targets: isolated files (fan-in ≤ 2), low complexity (< 10 functions), no test counterpart, stable (not in active churn). Returns ranked suggestions with GitHub issue draft text.',
  inputSchema: { session_id: z.string(), max_suggestions: z.number().optional() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const testFiles = new Set((data.files ?? []).filter(f => /test|spec/.test(f.path)).map(f => f.path));
  const recentFiles = new Set(((data as any).timeline ?? []).slice(0, 10).flatMap((t: any) => t.files ?? []));

  const candidates = (data.files ?? [])
    .filter(f => {
      const fanIn = (data.connections ?? []).filter(c => c.source === f.path).length;
      const fanOut = (data.connections ?? []).filter(c => c.target === f.path).length;
      const fnCount = f.functions?.length ?? 0;
      const baseName = f.path.replace(/\.[^.]+$/, '').split('/').pop() ?? '';
      const hasTest = [...testFiles].some(t => t.includes(baseName));
      const isActive = recentFiles.has(f.path);
      return fanIn <= 2 && fanOut <= 3 && fnCount < 10 && !hasTest && !isActive && !f.path.match(/test|spec|vendor|node_modules/);
    })
    .sort((a, b) => (a.functions?.length ?? 0) - (b.functions?.length ?? 0))
    .slice(0, args.max_suggestions ?? 5);

  const suggestions = candidates.map(f => {
    const fanIn = (data.connections ?? []).filter(c => c.source === f.path).length;
    const fnCount = f.functions?.length ?? 0;
    return {
      file: f.path,
      why: `Fan-in: ${fanIn}, functions: ${fnCount}, no tests`,
      issue_title: `Add tests for ${f.path.split('/').pop()}`,
      issue_body: `## Good First Issue\n\n**File:** \`${f.path}\`\n\n**Task:** Add unit tests for this module.\n\n**Why?**\n- Low function count (${fnCount})\n- Not actively changing\n- No existing test counterpart\n\n**Suggested approach:**\n1. Read \`${f.path}\`\n2. Identify the main exported functions\n3. Create \`${f.path.replace(/\.[^.]+$/, '.test$&')}\`\n4. Write tests covering happy path and edge cases`,
    };
  });

  return { content: [{ type: 'text', text: JSON.stringify({ suggestions, summary: `${suggestions.length} good first issue candidates identified` }, null, 2) }] };
});

server.registerTool('grasp_api_stability', {
  title: 'API Stability Score',
  description: 'Score 0–100 measuring how stable the public API surface is between two sessions. 100 = zero breaking changes, 0 = complete API rewrite. For library authors.',
  inputSchema: { session_id_old: z.string(), session_id_new: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_) return { content: [{ type: 'text', text: `Session "${args.session_id_old}" not found` }] };
  if (!new_) return { content: [{ type: 'text', text: `Session "${args.session_id_new}" not found` }] };

  const getPublicExports = (d: AnalysisResult) => new Set(
    (d.files ?? []).flatMap(f =>
      (f.functions ?? [])
        .filter(fn => fn.isExported || (fn.name && !fn.name.startsWith('_')))
        .map(fn => `${f.path}::${fn.name}`)
    )
  );
  const oldExp = getPublicExports(old_), newExp = getPublicExports(new_);
  const removed = [...oldExp].filter(k => !newExp.has(k)).length;
  const added = [...newExp].filter(k => !oldExp.has(k)).length;
  const unchanged = [...oldExp].filter(k => newExp.has(k)).length;
  const score = oldExp.size === 0 ? 100 : Math.round((unchanged / oldExp.size) * 100);

  return { content: [{ type: 'text', text: JSON.stringify({ stability_score: score, unchanged, removed, added, total_exports_old: oldExp.size, total_exports_new: newExp.size, badge_text: `API Stability: ${score}/100` }, null, 2) }] };
});

server.registerTool('grasp_deps_dev', {
  title: 'Ecosystem Dependents (deps.dev)',
  description: 'Query deps.dev for how many public packages in the ecosystem depend on this repo/package. Shows dependent count across npm/PyPI/Go/Maven.',
  inputSchema: { session_id: z.string(), package_name: z.string().optional() },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const pkgName = args.package_name ?? (data as any).packageJson?.name ?? data.source?.split('/').pop();
  if (!pkgName) return { content: [{ type: 'text', text: 'No package name found. Pass package_name explicitly.' }] };

  try {
    const resp = await fetch(`https://api.deps.dev/v3alpha/projects/github.com%2F${encodeURIComponent(pkgName)}`);
    const json = await resp.json() as any;
    const dependentCount = json?.dependents?.count ?? 'unknown';
    return { content: [{ type: 'text', text: JSON.stringify({ package: pkgName, dependent_count: dependentCount, source: 'deps.dev', note: dependentCount === 'unknown' ? 'Package may not be indexed on deps.dev yet' : `${dependentCount} public packages depend on ${pkgName}` }, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ package: pkgName, dependent_count: 'unavailable', error: e.message }, null, 2) }] };
  }
});

server.registerTool('grasp_fork_diff', {
  title: 'Fork Divergence Analysis',
  description: 'Compare a fork session against its upstream session. Shows diverged files, identical files, fork-only files, and the blast radius of merging upstream back.',
  inputSchema: { session_id_fork: z.string(), session_id_upstream: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [fork, upstream] = await Promise.all([getSession(args.session_id_fork), getSession(args.session_id_upstream)]);
  if (!fork) return { content: [{ type: 'text', text: `Session "${args.session_id_fork}" not found` }] };
  if (!upstream) return { content: [{ type: 'text', text: `Session "${args.session_id_upstream}" not found` }] };

  const forkFiles = new Map((fork.files ?? []).map(f => [f.path, f]));
  const upstreamFiles = new Map((upstream.files ?? []).map(f => [f.path, f]));

  const diverged: string[] = [], identical: string[] = [], forkOnly: string[] = [], upstreamOnly: string[] = [];
  for (const [path, fFile] of forkFiles) {
    if (!upstreamFiles.has(path)) { forkOnly.push(path); continue; }
    const uFile = upstreamFiles.get(path)!;
    // Compare by function count and line count as divergence proxy
    if (fFile.functions?.length !== uFile.functions?.length) diverged.push(path);
    else identical.push(path);
  }
  for (const path of upstreamFiles.keys()) if (!forkFiles.has(path)) upstreamOnly.push(path);

  const mergeBlastRadius = diverged.reduce((sum, p) => {
    return sum + (fork.connections ?? []).filter(c => c.target === p).length;
  }, 0);
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ diverged: diverged.length, identical: identical.length, fork_only: forkOnly.length, upstream_only: upstreamOnly.length, diverged_files: diverged.slice(0, 20), merge_blast_radius: mergeBlastRadius, summary: `Fork has diverged in ${diverged.length} files. Merging upstream would affect ${mergeBlastRadius} dependent files.` }, null, 2)) }] };
});

// =====================================================================
// TOOL: grasp_multilang
// =====================================================================
server.registerTool('grasp_multilang', {
  title: 'Multi-Language Call Graph',
  description: 'Detect cross-language call boundaries: Ada pragma Import/Export to C, Python ctypes/cffi calling C, JavaScript calling Rust/WASM. Renders cross-language edges and flags safety gaps where rules may not be caught across the boundary.',
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const crossLangEdges: Array<{ from_file: string; to_file: string; mechanism: string; risk: string }> = [];

  for (const file of data.files ?? []) {
    const content: string = file.content ?? '';
    const lang: string = (file as any).language ?? '';

    if (lang === 'Ada' || file.path.match(/\.(adb|ads)$/)) {
      const pragmaImport = content.match(/pragma\s+Import\s*\(\s*C\s*,\s*(\w+)\s*,\s*"([^"]+)"/gi) ?? [];
      for (const p of pragmaImport) {
        const cFn = p.match(/"([^"]+)"/)?.[1];
        const cFile = (data.files ?? []).find(f => (f.content ?? '').includes(`${cFn}(`));
        crossLangEdges.push({ from_file: file.path, to_file: cFile?.path ?? `[C: ${cFn}]`, mechanism: 'Ada pragma Import(C)', risk: 'MISRA rules do not cross Ada→C boundary' });
      }
    }

    if (lang === 'Python' || file.path.match(/\.py$/)) {
      if (/ctypes|cffi|cdll|CDLL/.test(content)) {
        crossLangEdges.push({ from_file: file.path, to_file: '[C shared library]', mechanism: 'Python ctypes/cffi', risk: 'C code not visible to Python static analysis' });
      }
    }

    if (file.path.match(/\.[jt]sx?$/) && /WebAssembly\.instantiate|\.wasm/.test(content)) {
      crossLangEdges.push({ from_file: file.path, to_file: '[WebAssembly module]', mechanism: 'WebAssembly', risk: 'WASM module not analysed by Grasp' });
    }
  }

  return { content: [{ type: 'text', text: truncate(JSON.stringify({ cross_language_edges: crossLangEdges, summary: `${crossLangEdges.length} cross-language boundaries detected` }, null, 2)) }] };
});

server.registerTool('grasp_heritage', {
  title: 'Heritage Software Genealogy',
  description: 'Overlay heritage manifest (which files came from prior missions/versions) on the codebase. Returns heritage coverage %, delta complexity, and files with zero delta (reuse candidates for certification shortcut).',
  inputSchema: {
    session_id: z.string(),
    manifest: z.array(z.object({
      file: z.string(),
      origin_mission: z.string(),
      origin_version: z.string().optional(),
      delta_functions: z.array(z.string()).optional()
    }))
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const total = data.files?.length ?? 0;
  const zeroDelta = args.manifest.filter(m => !m.delta_functions?.length);
  const heritage_pct = total === 0 ? 0 : Math.round((args.manifest.length / total) * 100);

  return { content: [{ type: 'text', text: JSON.stringify({
    heritage_pct,
    total_files: total,
    heritage_files: args.manifest.length,
    zero_delta_files: zeroDelta,
    certification_shortcut_candidates: zeroDelta.length,
    summary: `${heritage_pct}% heritage. ${zeroDelta.length} files unchanged from original — certification evidence reusable.`
  }, null, 2) }] };
});

server.registerTool('grasp_icd', {
  title: 'Interface Control Document Mapper',
  description: 'Match ICD (Interface Control Document) entries to code functions. Flags unimplemented interfaces (ICD entry with no matching function) and undocumented interfaces (function with no ICD entry).',
  inputSchema: {
    session_id: z.string(),
    icd_entries: z.array(z.object({
      id: z.string(),
      name: z.string(),
      direction: z.enum(['input', 'output', 'bidirectional']).optional(),
      description: z.string().optional()
    }))
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  // Collect all exported functions
  const exportedFns = (data.files ?? []).flatMap(f =>
    (f.functions ?? [])
      .filter(fn => fn.isExported)
      .map(fn => ({ name: fn.name, file: f.path }))
  );

  // Match ICD entries to functions (case-insensitive name match)
  const matched: Array<{ icd_id: string; icd_name: string; function: string; file: string }> = [];
  const unimplemented: Array<{ icd_id: string; icd_name: string }> = [];

  for (const entry of args.icd_entries) {
    const fn = exportedFns.find(f => f.name.toLowerCase().includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(f.name.toLowerCase()));
    if (fn) matched.push({ icd_id: entry.id, icd_name: entry.name, function: fn.name, file: fn.file });
    else unimplemented.push({ icd_id: entry.id, icd_name: entry.name });
  }

  const matchedNames = new Set(matched.map(m => m.function));
  const undocumented = exportedFns.filter(f => !matchedNames.has(f.name));

  return { content: [{ type: 'text', text: truncate(JSON.stringify({
    matched,
    unimplemented,
    undocumented: undocumented.slice(0, 20),
    summary: `${matched.length}/${args.icd_entries.length} ICD entries implemented. ${unimplemented.length} unimplemented, ${undocumented.length} undocumented functions.`
  }, null, 2)) }] };
});

server.registerTool('grasp_ecss', {
  title: 'ECSS-E-ST-40C Compliance Checker',
  description: 'Check ESA software engineering standard ECSS-E-ST-40C compliance. Verifiable rules: DI-01 (unique IDs in file headers), DI-04 (documented interfaces), DI-07 (test coverage), DI-10 (no circular deps), DI-15 (no dead code).',
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const files = data.files ?? [];
  const connections = data.connections ?? [];

  // DI-01: Unique software item identification — check for file header comment with @file or module docs
  const di01Missing = files.filter(f => {
    const content = f.content ?? '';
    return !/@file|@module|\/\*\*/.test(content);
  }).map(f => f.path);

  // DI-04: Documented interfaces — check for JSDoc/docstring presence
  const di04Missing = files.filter(f => {
    const content = f.content ?? '';
    return !content.includes('/**') && !content.includes('"""') && !content.includes("'''");
  }).length;

  // DI-07: Test coverage — files with no corresponding test file
  const testFileNames = new Set(files.filter(f => /test|spec/.test(f.path)).map(f => f.path));
  const di07Untested = files.filter(f => {
    if (/test|spec/.test(f.path)) return false;
    const baseName = f.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    return baseName && ![...testFileNames].some(t => t.includes(baseName));
  }).length;

  // DI-10: No circular dependencies — use data.summary or estimate from connections
  const cycleCount = (data as any).cycles?.length ?? 0;

  // DI-15: No dead code
  const deadFnCount = (data as any).deadFunctions?.length ?? 0;

  const rules = [
    { id: 'DI-01', name: 'Unique software item identification', status: di01Missing.length === 0 ? 'pass' : 'fail', findings: di01Missing.length, detail: di01Missing.slice(0, 10) },
    { id: 'DI-04', name: 'Documented interfaces', status: di04Missing === 0 ? 'pass' : 'warn', findings: di04Missing, detail: [] },
    { id: 'DI-07', name: 'Test coverage documented', status: di07Untested === 0 ? 'pass' : 'warn', findings: di07Untested, detail: [] },
    { id: 'DI-10', name: 'No circular dependencies', status: cycleCount === 0 ? 'pass' : 'fail', findings: cycleCount, detail: [] },
    { id: 'DI-15', name: 'No dead code in deliverable', status: deadFnCount === 0 ? 'pass' : 'warn', findings: deadFnCount, detail: [] },
  ];

  const passed = rules.filter(r => r.status === 'pass').length;
  return { content: [{ type: 'text', text: JSON.stringify({ rules, passed, total: rules.length, compliance_pct: Math.round((passed / rules.length) * 100), summary: `ECSS compliance: ${passed}/${rules.length} rules pass` }, null, 2) }] };
});

// =====================================================================
// Start server
// =====================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[grasp] MCP server running via stdio\n');
}

function startHttpServer(port = 7332) {
  const srv = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const parsed = url.parse(req.url ?? '/', true);
    const sessionId = parsed.query['session_id'] as string;
    const envelope = (report_type: string, data: any) => JSON.stringify({ version: '3.9.5', generated_at: new Date().toISOString(), session_id: sessionId, report_type, data }, null, 2);

    const noSessionRequired = (p: string | null) =>
      !p || p.startsWith('/health') || p.startsWith('/auth/') || p.startsWith('/api/workspace') ||
      p.startsWith('/billing/') || p.startsWith('/api/v1/');
    if (!sessionId && !noSessionRequired(parsed.pathname ?? null)) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'session_id required' })); return;
    }

    try {
      if (parsed.pathname === '/health') { res.end(JSON.stringify({ status: 'ok' })); return; }
      if (parsed.pathname === '/report/sbom') {
        const session = await getSession(sessionId);
        if (!session) { res.writeHead(404); res.end(JSON.stringify({ error: 'session not found' })); return; }
        const format = (parsed.query['format'] as string) ?? 'cyclonedx';
        res.end(envelope('sbom', { format, note: 'Run grasp_sbom MCP tool for full output' }));
        return;
      }
      if (parsed.pathname === '/report/dora') { res.end(envelope('dora', { note: 'Requires GitHub token. Run grasp_dora MCP tool.' })); return; }
      if (parsed.pathname === '/report/do178c') { res.end(envelope('do178c', { note: 'Run grasp_req_trace + grasp_anomaly for full evidence package.' })); return; }
      if (parsed.pathname === '/report/pii-audit') { res.end(envelope('pii-audit', { note: 'Mark PII sources first, then run grasp_pii_trace.' })); return; }
      if (parsed.pathname === '/report/model-risk') { res.end(envelope('model-risk', { note: 'Run grasp_model_risk MCP tool for full output.' })); return; }

      if (parsed.pathname === '/auth/github') {
        const clientId = process.env.GITHUB_CLIENT_ID ?? '';
        if (!clientId) { res.writeHead(500); res.end(JSON.stringify({ error: 'GITHUB_CLIENT_ID not set' })); return; }
        const state = require('crypto').randomBytes(16).toString('hex');
        (global as any).__oauthStates = (global as any).__oauthStates ?? new Map();
        (global as any).__oauthStates.set(state, Date.now());
        res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=read:user,read:org` });
        res.end(); return;
      }

      if (parsed.pathname === '/auth/github/callback') {
        const code = parsed.query['code'] as string;
        const state = parsed.query['state'] as string;
        const states: Map<string,number> = (global as any).__oauthStates ?? new Map();
        if (!states.has(state)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid state' })); return; }
        states.delete(state);
        try {
          const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
          });
          const tokenJson = await tokenResp.json() as any;
          const userResp = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'grasp-cloud' } });
          const user = await userResp.json() as any;
          res.writeHead(302, { Location: `/?auth=success&user=${encodeURIComponent(user.login ?? 'unknown')}` });
        } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
        res.end(); return;
      }

      if (parsed.pathname === '/api/workspace') {
        const room = parsed.query['room'] as string ?? 'default';
        const workspaceKey = `workspace:${room}`;
        if (req.method === 'GET') {
          const sess = await sessionStore.get(workspaceKey);
          res.end(JSON.stringify({ room, data: sess ?? {} })); return;
        }
        if (req.method === 'PUT') {
          let body2 = '';
          req.on('data', (c: any) => body2 += c);
          req.on('end', async () => {
            try { await sessionStore.set(workspaceKey, JSON.parse(body2), 90); res.end(JSON.stringify({ ok: true })); }
            catch (e: any) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
          }); return;
        }
      }

      // Billing checkout redirect (no card data handled)
      if (parsed.pathname === '/billing/checkout') {
        const priceId = process.env.STRIPE_PRO_PRICE_ID ?? '';
        if (!priceId) { res.writeHead(503); res.end(JSON.stringify({ error: 'Billing not configured' })); return; }
        const email = encodeURIComponent((parsed.query['email'] as string) ?? '');
        res.writeHead(302, { Location: `https://checkout.stripe.com/pay/${priceId}?prefilled_email=${email}` });
        res.end(); return;
      }

      // Async job queue for analysis
      if (parsed.pathname === '/api/v1/analyze' && req.method === 'POST') {
        let body3 = '';
        req.on('data', (c: any) => body3 += c);
        req.on('end', () => {
          try {
            const { repo, token } = JSON.parse(body3);
            const jobId = require('crypto').randomUUID();
            (global as any).__jobs = (global as any).__jobs ?? new Map();
            (global as any).__jobs.set(jobId, { status: 'queued', repo });
            res.end(JSON.stringify({ job_id: jobId, status: 'queued' }));
          } catch (e: any) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
        }); return;
      }

      if (parsed.pathname?.startsWith('/api/v1/jobs/') && req.method === 'GET') {
        const jobId = parsed.pathname.split('/').pop()!;
        const jobs: Map<string,any> = (global as any).__jobs ?? new Map();
        const job = jobs.get(jobId);
        if (!job) { res.writeHead(404); res.end(JSON.stringify({ error: 'Job not found' })); return; }
        res.end(JSON.stringify({ job_id: jobId, ...job })); return;
      }

      res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown report type' }));
    } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  });
  srv.listen(port, () => process.stderr.write(`[grasp] HTTP report API on :${port}\n`));
}

if (process.argv.includes('--http')) startHttpServer(Number(process.argv.find(a => a.startsWith('--http-port='))?.split('=')[1] ?? '7332'));

main().catch((err) => {
  process.stderr.write(`[grasp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
