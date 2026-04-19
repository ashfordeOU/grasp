# Grasp MCP Server

Expose Grasp's codebase analysis engine as MCP tools for Claude Code and other LLM agents.

Supports GitHub repositories and local directories. Analyzes dependency graphs, architecture layers, circular deps, security issues, design patterns, dead code, code metrics, git history, duplicate detection, cross-repo comparison, monorepo workspaces, runtime call graphs, database schema coupling, API surface maps, and migration planning.

**Current version: 3.1.0** — 47 tools — now with GitLab support, pro tier API keys, analysis history, Slack Block Kit digest, and Cursor IDE integration — across core analysis, history, code quality, ecosystem integration, runtime/infrastructure intelligence, GitHub activity, and codebase intelligence (env vars, events, flags, perf, licenses, diagrams, onboarding, and more).

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

Or install globally via npm:

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
| `grasp_sessions` | List persisted analysis sessions — survive restarts, expire after 7 days |
| `grasp_config_check` | Run grasp.yml architecture rules against a session — returns violations with severity |

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
| `grasp_dead_packages` | npm deps declared in package.json but never imported by any source file |
| `grasp_sarif` | Export analysis as SARIF 2.1.0 for GitHub Code Scanning upload |

### Runtime & Infrastructure Intelligence

| Tool | Description |
|------|-------------|
| `grasp_runtime_calls` | Merge a GraspTracer JSON trace with static edges — shows actual call paths and hot files |
| `grasp_db_coupling` | ORM/SQL-to-table coupling map — god tables, high-coupling files, shared-table clusters |
| `grasp_migration_plan` | Phased, topologically-ordered plan for replacing or removing a package/module |
| `grasp_api_surface` | Unified API surface map from OpenAPI specs, GraphQL SDL, Express/FastAPI/Next.js routes |

### GitHub Activity

| Tool | Description |
|------|-------------|
| `grasp_commits` | Commit counts for last 7d and 30d, plus commits since a given timestamp (staleness since last analysis) |
| `grasp_ci_status` | Latest GitHub Actions run — passing/failing/in-progress, with recent run history |

### Codebase Intelligence (v2.4–v2.9)

| Tool | Description |
|------|-------------|
| `grasp_env_vars` | Scan all env var reads — cross-references .env.example, flags undocumented and test-only vars |
| `grasp_events` | Map event emitters and subscribers — detects orphaned emits (no listener) and ghost subscriptions (no emitter) |
| `grasp_stale` | Find active but abandoned files — low churn, high fan-in, no test counterpart. Returns staleness score 0–100 |
| `grasp_change_risk` | Risk score 0–100 for a set of changed files — blast radius, complexity, churn, and layer violations combined |
| `grasp_feature_flags` | Find all feature flag reads — LaunchDarkly, GrowthBook, OpenFeature, env-var flags, and custom patterns |
| `grasp_perf` | Detect N+1 queries, synchronous I/O calls, and JSON serialization inside loops |
| `grasp_license` | Scan node_modules for dependency licenses — reports permissive, copyleft, and unknown; flags violations |
| `grasp_onboard` | Ordered reading path for new engineers entering an area of the codebase — sorted by layer and fan-in |
| `grasp_types` | Type annotation coverage per file — prioritises high fan-in files lacking types |
| `grasp_diagram` | Generate Mermaid flowchart or C4 diagrams (context, container, or component level) from the dependency graph |
| `grasp_pr_review` | Post inline review comments on a GitHub PR at high-severity lines — blast radius, complexity, security |
| `grasp_suggest` | Ranked refactoring suggestions with effort-to-impact ratio — sorted best ROI first |

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

"Which npm packages are declared but never actually imported?"
  → grasp_dead_packages(session_id)

"Export this session as SARIF for GitHub Code Scanning"
  → grasp_sarif(session_id)

"Show me which files actually call each other at runtime"
  → grasp_runtime_calls(trace_json="...", session_id=session_id)

"Which database tables are touched by the most files?"
  → grasp_db_coupling(session_id)

"Plan a migration from moment.js to date-fns"
  → grasp_migration_plan(session_id, from_package="moment", to_package="date-fns")

"Map all our API endpoints across Express routes and our OpenAPI spec"
  → grasp_api_surface(session_id)

"How many commits landed in express/express in the last 7 days?"
  → grasp_commits("expressjs/express")

"Is CI passing on vuejs/vue right now?"
  → grasp_ci_status("vuejs/vue")

"How many commits landed since my last analysis at 2026-04-10T12:00:00Z?"
  → grasp_commits("owner/repo", since_timestamp="2026-04-10T12:00:00Z")
```

## GitHub Token

For large repos (>100 files), pass a GitHub PAT to avoid rate limiting:

```
grasp_analyze("owner/repo", token="ghp_...")
```

Without a token: 60 req/hour. With a token: 5,000 req/hour.

## CLI

Grasp ships a `grasp` CLI alongside the MCP server:

```bash
# Analyze a local directory
npx grasp analyze ./my-project

# Export analysis as SARIF (for GitHub Code Scanning)
npx grasp analyze ./my-project --format=sarif --output=grasp.sarif
```

## JetBrains Plugin

A JetBrains IDE plugin (IntelliJ IDEA, WebStorm, PyCharm, GoLand) is available under `jetbrains-plugin/`. It adds:

- **Tool window** — interactive dependency graph rendered in JCEF, falls back to text summary
- **Status bar widget** — live health score (e.g. `⬡ 87 B`) with click-to-open
- **Editor annotations** — inline warnings for layer violations and circular deps
- **File-save re-analysis** — automatic re-analysis on save for watched extensions
- **Settings** — configurable CLI path, annotation toggles

Build with `./gradlew buildPlugin` from `jetbrains-plugin/`.

## SaaS API Server

A lightweight hosted analysis API lives under `saas/`. It wraps Grasp analysis behind:

- **Redis/LRU cache** — identical requests served instantly, configurable TTL
- **Sliding-window rate limiter** — per-key, configurable limits
- **Async job queue** — POST returns 202 immediately; analysis runs in background
- `POST /analyze` — accepts `{ repo: "owner/repo" }` or `{ repo: "https://github.com/..." }`

```bash
cd saas && npm install && npm run build && npm start
```

## Slack / Teams Bot

Automated health alerts and weekly digests live under `slack-bot/`. Features:

- **Hourly regression alerts** — fires when score drops ≥10 points, new security issues, or new circular deps appear
- **Weekly digest** — configurable cron (default Monday 09:00) with multi-repo summary
- **Slack Block Kit** and **MS Teams Adaptive Cards** (v1.4) formatting
- Configurable via environment variables (`SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`, `GRASP_REPOS`, etc.)

```bash
cd slack-bot && npm install && npm run build && npm start
```

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push / PR to main | Build, test, lint |
| `publish.yml` | Push tag `v*` | Publish to npm |
| `grasp-sarif.yml` | Push to main | Self-analysis → SARIF → GitHub Code Scanning |
| `grasp-health.yml` | Schedule (daily) | Post health summary as commit status |

## Workflow Tip

Always call `grasp_analyze` first — it returns a `session_id` that all other tools require. Sessions are held in memory and expire when the MCP server restarts.
