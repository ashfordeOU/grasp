# Grasp MCP Server

Expose Grasp's codebase analysis engine as MCP tools for Claude Code and other LLM agents.

Supports GitHub repositories and local directories. Analyzes dependency graphs, architecture layers, circular deps, security issues, design patterns, dead code, and code metrics. Local repos include real git churn data.

## Setup

```bash
cd mcp
npm install
npm run build
```

## Configure in Claude Code

Add to `~/.claude/claude_mcp_settings.json`:

```json
{
  "mcpServers": {
    "grasp": {
      "command": "node",
      "args": ["/absolute/path/to/grasp/mcp/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `grasp_analyze` | Full analysis — run first, returns `session_id` |
| `grasp_file_deps` | Outgoing deps for a file (what it calls) |
| `grasp_dependents` | Incoming deps (blast radius — what breaks if you change it) |
| `grasp_cycles` | All circular dependency chains |
| `grasp_architecture` | Files grouped by layer (services/data/utils/test…) |
| `grasp_hotspots` | Most coupled + complex files, ranked |
| `grasp_metrics` | Lines, functions, complexity, fan-in/fan-out per file |
| `grasp_find_path` | Shortest dependency path between two files |
| `grasp_security` | Hardcoded secrets, SQL injection risks, insecure patterns |
| `grasp_patterns` | Detected design patterns and anti-patterns |
| `grasp_sessions` | List active analysis sessions |
| `grasp_diff` | Compare two session snapshots — files added/removed, health delta, new issues |
| `grasp_suggest` | Ranked refactoring suggestions from hotspot + issue data |
| `grasp_explain` | Plain-English explanation of any file or function |
| `grasp_watch` | Re-analyse a local directory and diff against a prior session |
| `grasp_unused` | Dead code — functions defined but never called from other files |

## Example usage

```
"Analyze the express repo" → grasp_analyze("expressjs/express")
"What would break if I change src/router/index.js?" → grasp_dependents(session_id, "src/router/index.js")
"Are there any circular deps?" → grasp_cycles(session_id)
"What are the riskiest files to touch?" → grasp_hotspots(session_id)
"Walk me through the architecture" → grasp_architecture(session_id)
```

## GitHub token

For large repos (>100 files), pass a GitHub PAT to avoid rate limiting:

```
grasp_analyze("owner/repo", token="ghp_...")
```

Without a token: 60 req/hour. With a token: 5000 req/hour.
