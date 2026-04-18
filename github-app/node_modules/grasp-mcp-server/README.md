# Grasp MCP Server

Expose Grasp's codebase analysis engine as MCP tools for Claude Code and other LLM agents.

Supports GitHub repositories and local directories. Analyzes dependency graphs, architecture layers, circular deps, security issues, design patterns, dead code, code metrics, git history, duplicate detection, cross-repo comparison, and monorepo workspaces.

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

Or install globally and reference the package:

```json
{
  "mcpServers": {
    "grasp": {
      "command": "npx",
      "args": ["grasp-mcp-server"]
    }
  }
}
```

## Tools

### Core Analysis

| Tool | Description |
|------|-------------|
| `grasp_analyze` | Full analysis — run first, returns `session_id` |
| `grasp_file_deps` | Outgoing deps for a file (what it imports) |
| `grasp_dependents` | Incoming deps — blast radius if you change this file |
| `grasp_cycles` | All circular dependency chains |
| `grasp_architecture` | Files grouped by layer (services/data/utils/test…) |
| `grasp_hotspots` | Most coupled + complex files, ranked |
| `grasp_metrics` | Lines, functions, complexity, fan-in/fan-out per file |
| `grasp_find_path` | Shortest dependency path between two files |
| `grasp_security` | Hardcoded secrets, SQL injection risks, insecure patterns |
| `grasp_patterns` | Detected design patterns and anti-patterns |
| `grasp_unused` | Dead code — functions defined but never called |
| `grasp_sessions` | List active analysis sessions |

### History & Comparison

| Tool | Description |
|------|-------------|
| `grasp_diff` | Compare two session snapshots — files added/removed, health delta |
| `grasp_watch` | Re-analyse a local directory and diff against a prior session |
| `grasp_timeline` | Last N git commits with per-commit changed files and co-change matrix |
| `grasp_cross_repo` | Compare two sessions — shared filenames, diverged functions, workspace info |
| `grasp_similarity` | Ranked duplicate clusters, code clones, naming clashes, hottest files |

### Code Quality

| Tool | Description |
|------|-------------|
| `grasp_suggest` | Ranked refactoring suggestions from hotspot + issue data |
| `grasp_explain` | Plain-English explanation of any file or function |
| `grasp_rules_check` | Run architecture rules and report all violations |
| `grasp_refactor` | Step-by-step refactor plan with metrics table for a file or session |
| `grasp_coverage` | Test coverage overlay — files with no test counterpart |

### Ecosystem Integration

| Tool | Description |
|------|-------------|
| `grasp_issues` | Map GitHub Issues to the files they mention |
| `grasp_contributors` | Per-file ownership, bus-factor score, top contributors |
| `grasp_bundle` | Bundle size treemap — files ranked by size with category breakdown |
| `grasp_dep_impact` | Impact of upgrading a dependency — which files import it |
| `grasp_pr_comment` | Generate a PR health comment with blast radius for changed files |
| `grasp_embed` | Generate iframe, README badge, and React snippet for sharing |

## Example Usage

```
"Analyze the express repo"
  → grasp_analyze("expressjs/express")

"What would break if I change src/router/index.js?"
  → grasp_dependents(session_id, "src/router/index.js")

"Are there any circular dependencies?"
  → grasp_cycles(session_id)

"Which files are riskiest to touch?"
  → grasp_hotspots(session_id)

"Show me the architecture layers"
  → grasp_architecture(session_id)

"What files changed most often together in the last 20 commits?"
  → grasp_timeline(session_id, n=20)

"Are there duplicate code blocks I should clean up?"
  → grasp_similarity(session_id)

"Give me a refactor plan for src/services/auth.ts"
  → grasp_refactor(session_id, file="src/services/auth.ts")

"Compare main and feature branch analyses"
  → grasp_cross_repo(session_id_a, session_id_b)

"Generate a PR comment for these changed files"
  → grasp_pr_comment(session_id, changed_files=["src/auth.ts","src/router.ts"])
```

## GitHub Token

For large repos (>100 files), pass a GitHub PAT to avoid rate limiting:

```
grasp_analyze("owner/repo", token="ghp_...")
```

Without a token: 60 req/hour. With a token: 5,000 req/hour.

## Workflow Tip

Always call `grasp_analyze` first — it returns a `session_id` that all other tools require. Sessions are held in memory and expire when the MCP server restarts.
