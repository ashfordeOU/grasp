<div align="center">

<img src="grasp-social.png" alt="Grasp — See the code. Know the code." width="100%"/>

<br/>


**[Report Bug](https://github.com/ashfordeOU/grasp/issues) · [Request Feature](https://github.com/ashfordeOU/grasp/issues)**

</div>

---

## Why Grasp?

Ever opened a new codebase and felt completely lost? **Grasp** turns any GitHub repository or local codebase into an interactive architecture map in seconds — no setup, no accounts, no data leaving your machine.

```
Paste URL / Select Files → See Architecture → Make Better Decisions
```

- **No installation** — runs 100% in your browser
- **No data collection** — your code never leaves your machine  
- **No accounts** — paste a URL and go
- **Works offline** — analyze local files without internet

---

## Screenshots

### 🕸️ Dependency Graph — see exactly how files connect

<img src="docs/screenshots/graph.png" alt="Grasp dependency graph view" width="100%"/>

### 🏛️ Architecture Diagram — your codebase by layer

<img src="docs/screenshots/arch.png" alt="Grasp architecture diagram view" width="100%"/>

### 📦 Treemap — files sized by line count

<img src="docs/screenshots/treemap.png" alt="Grasp treemap view" width="100%"/>

### 🏢 Team Dashboard — health across all your repos at a glance

<img src="docs/screenshots/team-dashboard.png" alt="Grasp team dashboard" width="100%"/>

---

## Features

### 🏛️ **Architecture Diagram**
Layer-by-layer diagram of your entire codebase. Components grouped by architectural layer (Config, Utils, Data, Services, Components, UI, Test) with dependency arrows between them. Pan, zoom, click any block to explore.

### 🕸️ **Interactive Dependency Graph**
Force-directed graph showing how every file connects. Click any node to highlight its dependencies. Drag, zoom, multi-select with Shift+click.

### 💥 **Blast Radius Analysis**
*"If I change this file, what breaks?"* — Select any file and see exactly how many files would be affected, highlighted directly on the graph.

### 👥 **Code Ownership**
Top contributors for any file based on git history, with line-percentage breakdowns. One-click jump to GitHub Blame.

### 🔐 **Security Scanner**
Automatic detection of:
- Hardcoded secrets & API keys
- SQL injection vulnerabilities
- Dangerous `eval()` usage
- Debug statements left in production

### 🧩 **Pattern Detection**
Automatically identifies Singleton, Factory, Observer/Event patterns, React custom hooks, and anti-patterns (God Objects, high coupling).

### 📊 **Health Score**
Instant A–F grade based on dead code percentage, circular dependencies, coupling metrics, and security issues.

### 🔥 **Activity Heatmap**
Color files by commit frequency to see the hot spots in your codebase. Works for both GitHub repos (via API) and **local repos** (via `git log` — no internet required).

### 🔍 **Graph Node Filtering**
Type in the filter bar at the top of the graph to instantly narrow 200+ nodes down to just the files you care about — matching nodes stay visible, their direct connections dim in, everything else fades out. Press `Escape` to clear.

### 🚫 **Custom Ignore Patterns**
Add your own directory exclusions (e.g. `generated/`, `__mocks__/`, `fixtures/`) via the `⋯ → 🚫 Ignore Patterns` menu. Persists across sessions. Built-in defaults (`node_modules`, `dist`, `.git`, etc.) cannot be removed.

### 📋 **PR Impact Analysis**
Paste a PR URL to see which files it touches and calculate the blast radius of proposed changes before merging.

### 📡 **Live Watch Mode**
Run `grasp . --watch` to start a local dev server with **real-time SSE sync**. Every time you save a file, the browser graph reloads automatically — no manual refresh. A `LIVE` badge appears in the top bar while connected.

### ⏮️ **Time-Travel Architecture Scrubber**
Run `grasp . --timeline` to load your last 30 git commits as a scrubber panel. Drag the slider to any commit — nodes that changed in that commit glow yellow on the graph, so you can watch your architecture evolve over time.

### 🏢 **Team Dashboard** (`team-dashboard.html`)
Track health across multiple repos in one view. Add any public (or private, with a token) GitHub repo and see score, grade, files, issues, circular deps, security findings, architectural layers, **commit activity (7d / 30d)**, **CI status (✅/❌/⏳)**, and a **commit velocity sparkline** — all in a live table with bar charts. Token is shared with the main Grasp app so you only set it once. Export the full table as CSV. Open local folders with 📁 Open Folder (File System Access API).

### 🤖 **AI Chat Panel**
Built-in AI assistant that knows your codebase. Ask questions like *"why is auth.ts a hotspot?"* or *"which files are safest to refactor?"* — it answers with direct references to your dependency graph. Supports Anthropic Claude and OpenAI GPT models. API key stays in your browser only.

### 🎨 **19 Themes**
Full theme system with hover picker and click-to-cycle: **Dark** · **Light** · **Matrix** · **Amber Terminal** · **Dracula** · **Nord** · **Tokyo Night** · **Catppuccin** · **Gruvbox** · **Obsidian Gold** · **Midnight Diamond** · **Carbon** · **Noir** · **Synthwave** · **Ocean Depth** · **Forest** · **Sunset** · **High Contrast** · **Solarized Light**. Theme choice persists across sessions and is shared between Grasp and Team Dashboard.

### 🔎 **Duplicate & Similarity Detection**
The **Dup** color mode highlights files with exact or near-duplicate code — bright red = many duplicates, orange = some, yellow = minor. The `grasp_similarity` MCP tool returns ranked duplicate clusters and code-clone groups for targeted refactoring.

### 🏢 **Monorepo & Workspace Support**
Grasp automatically detects sub-packages in monorepos (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`). A **Workspace** sidebar lets you filter the entire visualization to a single package — all graphs, treemaps, and metrics update instantly.

### 🧰 **Refactor Wizard**
The **Refactor** hints panel (click any file in the graph) shows a prioritized, step-by-step refactor plan for that file — based on fan-in, complexity, duplicate count, layer violations, and churn. The `grasp_refactor` MCP tool generates the same plan as structured output for agents.

### 🔗 **Shareable Embeds**
Click `⋯ → 🔗 Embed` for a modal with a ready-to-paste `<iframe>`, README badge (`![Health](…)`), React component snippet, and a direct link — for sharing live health reports in docs, wikis, or dashboards.

### 💻 **Local File Analysis**
- **Privacy First** — your code never leaves your machine
- **Offline Support** — works without internet
- **Drag & Drop** — drag files or folders straight onto the page
- **Recursive scanning** — analyze entire project structures

---

## Quick Start

### IDE Extensions

| IDE | Install |
|-----|---------|
| **VS Code** | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ashfordeOU.grasp-vscode) or `ext install ashfordeOU.grasp-vscode` |
| **JetBrains** (IntelliJ, WebStorm, PyCharm…) | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) — search **Grasp** in Settings → Plugins |

Both extensions require the free CLI: `npm install -g grasp-mcp-server`

> **Manual installs:** Every release ships a signed `.zip` (JetBrains) and `.vsix` (VS Code) on the [GitHub Releases page](https://github.com/ashfordeOU/grasp/releases) — useful for air-gapped or enterprise environments.

### Option 1: Self-Host (30 seconds)
```bash
git clone https://github.com/ashfordeOU/grasp.git
cd grasp
open index.html           # Main app
open team-dashboard.html  # Team Dashboard (track multiple repos)
```
No build process. No dependencies. No `npm install`. **Two HTML files.**

### Option 2: Analyze Local Files
1. Open `index.html` in your browser
2. Click **📁 Open Folder**
3. Select the folder to analyze
4. Everything processes entirely in your browser

### Option 3: CLI (terminal)
```bash
npm install -g grasp-mcp-server   # Install once
grasp ./my-project                 # Analyse a local folder
grasp facebook/react               # Analyse a GitHub repo
grasp .                            # Analyse current directory
```
Outputs a colour-coded health report and writes `grasp-report.json`.  
Exit code `0` = CI pass, `1` = issues found.

```bash
# One-off with npx
npx --package=grasp-mcp-server grasp .

# Watch mode — browser reloads live on every file save
grasp . --watch

# Time-travel — load last 30 commits as a scrubber
grasp . --timeline

# PR comment output — print markdown report to stdout
grasp . --pr-comment

# Enforce grasp.yml architecture rules — exit 1 on violations
grasp . --check

# Export SARIF for GitHub Code Scanning upload
grasp . --format=sarif
```

### Architecture Rules (`grasp.yml`)

Add a `grasp.yml` file to your repo to enforce architecture standards in CI:

```yaml
rules:
  - min_health_score: 70          # fail if score drops below 70
  - max_blast_radius: 20          # flag any file that affects 20+ others
```

Run locally with `grasp . --check`, or drop the [GitHub Actions template](docs/examples/grasp-check.yml) into `.github/workflows/`.

### Health Badge

Once the GitHub App is installed, embed a live health badge in your README:

```markdown
![Grasp Health](https://grasp.ashforde.org/badge/owner/repo.svg)
```

### @grasp-bot in PRs

Comment `@grasp-bot analyze` on any PR or issue — Grasp will post a full health report inline.

---

## For LLM Agents & AI Tools — MCP Server

Grasp ships a **Model Context Protocol (MCP) server** that exposes the full analysis engine as callable tools for Claude Code, Cursor, and any MCP-compatible agent.

```bash
cd mcp && npm install && npm run build
```

Then add to `~/.claude/claude_mcp_settings.json`:

```json
{
  "mcpServers": {
    "grasp": {
      "command": "node",
      "args": ["/path/to/grasp/mcp/dist/index.js"]
    }
  }
}
```

Or run without installing:

```bash
npx grasp-mcp-server
```

**47 tools available to agents:**

| Tool | What it answers |
|------|----------------|
| `grasp_analyze` | Full analysis of any repo or local path — run first, returns `session_id` |
| `grasp_file_deps` | What does this file depend on? |
| `grasp_dependents` | What breaks if I change this file? |
| `grasp_cycles` | Are there circular dependencies? |
| `grasp_architecture` | What layers does this codebase have? |
| `grasp_hotspots` | Which files are riskiest to touch? |
| `grasp_metrics` | Lines, complexity, fan-in/fan-out per file |
| `grasp_find_path` | How does file A connect to file B? |
| `grasp_security` | Any hardcoded secrets or injection risks? |
| `grasp_patterns` | What design patterns are in use? |
| `grasp_unused` | Which functions are dead code — defined but never called? |
| `grasp_sessions` | List active analysis sessions (survive restarts, expire after 7 days) |
| `grasp_diff` | Compare two analysis snapshots — what changed? |
| `grasp_suggest` | Ranked refactoring suggestions sorted by effort-to-impact ratio |
| `grasp_explain` | Plain-English explanation of any file or function |
| `grasp_watch` | Re-analyse a directory and diff against a previous run |
| `grasp_rules_check` | Run architecture rules and report violations |
| `grasp_refactor` | Step-by-step refactor plan for a file or entire session |
| `grasp_coverage` | Test coverage overlay — which files lack tests? |
| `grasp_issues` | Map GitHub Issues to the files they mention |
| `grasp_contributors` | Per-file ownership, bus-factor, top contributors |
| `grasp_bundle` | Bundle size treemap — largest files by size category |
| `grasp_dep_impact` | Impact of upgrading a dependency across all files |
| `grasp_timeline` | Last N commits with per-commit changed files + co-change matrix |
| `grasp_pr_comment` | Generate PR health comment with blast radius for changed files |
| `grasp_embed` | Generate iframe, README badge, React snippet for sharing |
| `grasp_cross_repo` | Compare two sessions — shared files, diverged functions |
| `grasp_similarity` | Ranked duplicate clusters, code clones, naming clashes |
| `grasp_dead_packages` | npm deps declared in package.json but never actually imported |
| `grasp_sarif` | Export analysis as SARIF 2.1.0 for GitHub Code Scanning |
| `grasp_runtime_calls` | Merge a runtime trace with static edges — actual call paths and hot files |
| `grasp_db_coupling` | ORM/SQL-to-table coupling map — god tables, high-coupling files |
| `grasp_migration_plan` | Phased, topologically-ordered plan for replacing a package/module |
| `grasp_api_surface` | Unified API surface map from OpenAPI, GraphQL SDL, Express/FastAPI routes |
| `grasp_commits` | Commit counts for last 7d and 30d, plus commits since a given timestamp |
| `grasp_ci_status` | Latest GitHub Actions run — passing/failing/in-progress, with recent run history |
| `grasp_env_vars` | Scan all env var reads — flags undocumented and test-only vars vs .env.example |
| `grasp_events` | Map event emitters and subscribers — detect orphaned emits and ghost subscriptions |
| `grasp_stale` | Find active but abandoned files — low churn, high fan-in, no test counterpart |
| `grasp_change_risk` | Risk score 0–100 for a set of changed files — blast radius, complexity, churn combined |
| `grasp_feature_flags` | Find all feature flag reads — LaunchDarkly, GrowthBook, OpenFeature, env-var flags |
| `grasp_perf` | Detect N+1 queries, synchronous I/O calls, and JSON serialization inside loops |
| `grasp_license` | Scan node_modules for dependency licenses — flags copyleft and unknown licenses |
| `grasp_onboard` | Ordered reading path for new engineers entering an area of the codebase |
| `grasp_types` | Type annotation coverage per file — prioritises high fan-in files lacking types |
| `grasp_diagram` | Generate Mermaid flowchart or C4 diagrams from the dependency graph |
| `grasp_pr_review` | Post inline review comments on a GitHub PR at high-severity lines |
| `grasp_config_check` | Validate a session against `grasp.yml` architecture rules — returns violations |

Works with GitHub repos and local directories. See [`mcp/README.md`](mcp/README.md) for full setup.

---

## Usage

### Public Repositories
```
Just paste:   facebook/react
Or full URL:  https://github.com/facebook/react
```

### Private Repositories
1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope
2. Select **Token** from the auth dropdown and paste it in
3. Analyze your private repos — token stays in memory only

### Shareable Links
After analysis, click 🔗 to copy a link anyone can use to re-run the same analysis.

---

## Visualization Modes

### Graph Types

| Type | Description |
|------|-------------|
| 🕸️ **Graph** | Force-directed dependency graph — drag, zoom, click to explore |
| 🔮 **3D Graph** | Three-dimensional force graph — rotate, pan, zoom through your architecture |
| 🏛️ **Arch** | Layer-by-layer architecture diagram with zoom/pan |
| 📦 **Treemap** | Files sized by line count, grouped by folder |
| 📊 **Matrix** | Adjacency matrix showing all file dependencies |
| 🌳 **Tree** | Hierarchical cluster dendrogram |
| 🌊 **Flow** | Folder-level dependency flow (Sankey diagram) |
| 🎯 **Bundle** | Circular layout with arc-based connections |
| 🔮 **Cluster** | Separated force graphs per folder |

### Color Modes

| Mode | Description |
|------|-------------|
| 📁 **Folder** | Color by directory structure |
| 🏗️ **Layer** | Color by architectural layer (UI, Services, Utils, etc.) |
| 🔥 **Churn** | Color by commit frequency — red = most-changed hot spots |
| 🌊 **Depth** | Color by max brace-nesting depth |
| ⚡ **Complexity** | Color by cyclomatic complexity (green → yellow → red) |
| 💥 **Blast** | Color by blast radius impact for a selected file |
| 🔎 **Dup** | Color by duplicate code density — red = many clones, yellow = minor |
| 👤 **Owner** | Color by top contributor — spot bus-factor risks at a glance |
| 🐛 **Issues** | Color by number of linked GitHub Issues mentioning each file |
| 🧪 **Coverage** | Color by test coverage — highlight files with no test counterpart |
| 📦 **Bundle** | Color by bundle size contribution |
| 🌐 **API Surface** | Color by API endpoint exposure — highlight public-facing files |
| ⚡ **Runtime** | Color by actual runtime call frequency from a live trace |

---

## Advanced Features

### ⚡ Command Palette
Press `Cmd+K` (Mac) / `Ctrl+K` (Windows) — search files, navigate to any function, or jump to issues instantly. Selecting a result pans the graph to that node.

### 🔍 Path Finder
Select two files in the details panel to find the shortest dependency chain between them.

### 🏛️ Architecture Rule Engine
Define custom FORBIDDEN dependency rules (e.g., `utils → services` is FORBIDDEN). Violations are flagged as issues and persist across sessions.

### 📅 History & Snapshots
Every analysis is saved automatically. Click **HISTORY** in the right panel to compare health scores over time with a D3 sparkline and range slider.

### 📤 Export Reports
Export as JSON, Markdown, Plain Text, or SVG. Full schema in [docs/api-schema.md](docs/api-schema.md).

### 🧩 IDE Extensions (VS Code & JetBrains)
Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ashfordeOU.grasp-vscode) or [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) for a live dependency graph in your sidebar. VS Code features:
- Auto-analyses workspace on startup, re-analyses on file save (2s debounce)
- Status bar shows `↑ N deps  ↓ M dependents` for the active file
- Pans to the active file on every editor switch
- Surfaces security issues and arch violations in the **Problems panel** (squiggly lines)
- 4 color mode buttons in the panel header: Layer / Folder / Churn / Complexity
- Health score badge displayed in the panel header
- Double-click any node to open the file in the editor
- Right-click any file in Explorer or Editor → **Grasp: Analyze File** for instant details
- Directed links: blue = outgoing imports, green = incoming dependents
- Rich tooltips showing complexity, churn count, and top contributor per file

---

## Version & Auto-Update

Both `index.html` and `team-dashboard.html` display the current version (`v3.1.0`) in the footer. On load, they silently check the npm registry for a newer `grasp-mcp-server` release. If one is found, a dismissible toast appears:

- **Update Now** — fetches the new HTML from GitHub, downloads it to your machine, and applies it in the current tab immediately
- **Later** — snoozes for 24 hours

No server, no background process. The update check is a single npm registry fetch.

---

## CI/CD Integration

### GitHub Actions — Automatic PR Comments

Add this workflow to get an automatic health report on every PR:

```yaml
# .github/workflows/grasp.yml
name: Grasp Health Check
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  health:
    uses: ashfordeOU/grasp/.github/workflows/grasp-health.yml@main
```

The workflow posts (and updates) a comment like this on every PR:

| Metric | Value |
|--------|-------|
| **Health Score** | `████████░░` **82/100** |
| **Grade** | 🟢 **A** |
| **Files** | 142 (891 functions) |
| **Architecture Issues** | 3 |
| **Circular Deps** | 0 ✓ |
| **Security** | 0 |
| **Changed Files** | 5 code files in this PR |

### CLI-based CI Gate

```yaml
- name: Check Grasp health
  run: |
    PASSED=$(cat grasp-report.json | jq '.ci.passed')
    SCORE=$(cat grasp-report.json | jq '.ci.score')
    echo "Health score: $SCORE"
    if [ "$PASSED" != "true" ]; then
      echo "Grasp CI check failed"
      cat grasp-report.json | jq '.ci.failures'
      exit 1
    fi
```

See [docs/api-schema.md](docs/api-schema.md) for the full export schema.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Analyze repository |
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `+` / `-` | Zoom in/out |
| `Shift+click` | Multi-select nodes |
| `Escape` | Close modal / command palette |
| `T` | Cycle through themes |
| `?` | Open help modal |

---

## Supported Languages

JavaScript · TypeScript · Python · Go · Java · Rust · C/C++ · C# · Ruby · PHP · Swift · Kotlin · Scala · Vue · Svelte · Dart · Elixir · Erlang · Haskell · Lua · R · Julia · Perl · Shell · PowerShell · F# · OCaml · Clojure · Elm · VBA · Groovy

---

## Privacy & Security

**Your code stays on your machine.**

**Browser app:**
- Runs 100% in the browser — no server, no proxy
- GitHub API calls go directly from your browser to GitHub
- Your token (if used) lives in `localStorage` only — never sent anywhere except the GitHub API
- No analytics, no tracking, no accounts
- The entire app is [one open-source HTML file](index.html) — audit it yourself

**MCP server:**
- Runs locally as a subprocess — no outbound connections except the GitHub API
- No telemetry, no data collection
- Local directory analysis never leaves your machine — files are read and discarded in memory

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Grasp v3.1.0                            │
├─────────────────────┬──────────────────┬────────────┬───────────────┤
│    Browser App      │  Team Dashboard  │ MCP Server │  VS Code Ext  │
│    (index.html)     │(team-dashboard   │  (mcp/)    │(vscode-ext/)  │
│                     │      .html)      │            │               │
│  ┌─────────────┐    │  ┌───────────┐   │ ┌────────┐ │ ┌───────────┐ │
│  │Parser Engine│◄───┼──│parser.js  │   │ │parser  │ │ │Webview    │ │
│  │(embedded JS)│    │  └─────┬─────┘   │ └───┬────┘ │ │(D3 graph) │ │
│  └──────┬──────┘    │        │         │     │      │ └─────┬─────┘ │
│         │           │  ┌─────▼──────┐  │ ┌───▼────┐ │       │       │
│  ┌──────▼──────┐    │  │Multi-repo  │  │ │analyze │ │ ┌─────▼─────┐ │
│  │React+D3     │    │  │health table│  │ └───┬────┘ │ │FileWatcher│ │
│  │19 themes    │    │  │score charts│  │     │      │ │Status Bar │ │
│  │AI Chat      │    │  │CSV export  │  │ ┌───▼────┐ │ │Diagnostics│ │
│  │3D Graph     │    │  └────────────┘  │ │47 Tools│ │ └───────────┘ │
│  │Timeline     │    │                  │ │(stdio) │ │               │
│  │Workspaces   │    │  Shared token &  │ └────────┘ │               │
│  └─────────────┘    │  theme via       │            │               │
│                     │  localStorage    │ + CLI      │ + context menu│
│  Zero install —     │                  │            │               │
│  one HTML file      │  one HTML file   │            │               │
└─────────────────────┴──────────────────┴────────────┴───────────────┘
```

**Browser app:** zero dependencies to install. Everything runs from CDNs: React 18, D3.js 7, Babel.

**MCP server:** Node.js 18+, `npm install` inside `mcp/`.

**VS Code extension:** `vsce package` inside `vscode-extension/`.

---

## GitHub API Limits

| Auth | Requests/hour |
|------|--------------|
| No token | 60 |
| Personal Access Token | 5,000 |
| GitHub App | 5,000 per installation |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code structure, and PR checklist.

Ideas welcome:
- [x] More languages (Zig, V, Nim, Crystal)
- [x] Full tree-sitter / AST support for JS/TS function extraction (MCP + CLI now use acorn in Node.js)
- [x] More design pattern detection (Strategy, Command, State)
- [x] Export to PNG
- [x] 3D force graph visualization mode
- [x] 19-theme system with hover picker — Matrix, Synthwave, Dracula, Nord, Tokyo Night, Catppuccin, Gruvbox, Obsidian Gold, Midnight Diamond, Carbon, Noir, Amber Terminal, Ocean Depth, Forest, Sunset, High Contrast, Solarized Light
- [x] Team Dashboard (`team-dashboard.html`) — multi-repo health tracking, commit activity (7d/30d), CI status badges, commit velocity sparkline, CSV export, shared token/theme, Open Folder
- [x] AI Chat panel — ask questions about the dependency graph, Claude + OpenAI support
- [x] Auto-update system — version check via npm registry, in-tab update + file download
- [x] MCP: 47 tools total — added `grasp_dead_packages`, `grasp_sarif`, `grasp_runtime_calls`, `grasp_db_coupling`, `grasp_migration_plan`, `grasp_api_surface`, `grasp_commits`, `grasp_ci_status`, `grasp_env_vars`, `grasp_events`, `grasp_stale`, `grasp_change_risk`, `grasp_feature_flags`, `grasp_perf`, `grasp_license`, `grasp_onboard`, `grasp_types`, `grasp_diagram`, `grasp_pr_review`
- [x] MCP: `grasp_diff` tool — compare two snapshots over time
- [x] MCP: `grasp_suggest` tool — refactoring suggestions from hotspot data
- [x] MCP: `grasp_explain` tool — plain-English file/function explanation
- [x] MCP: `grasp_watch` tool — re-analyse directory and diff against prior run
- [x] MCP: `grasp_unused` tool — dead code detection for agents
- [x] MCP: `grasp_rules_check` tool — architecture rule violations
- [x] MCP: `grasp_issues` tool — GitHub Issues → file mention mapping
- [x] MCP: `grasp_contributors` tool — per-file ownership and bus-factor
- [x] MCP: `grasp_bundle` tool — bundle size treemap
- [x] MCP: `grasp_dep_impact` tool — dependency upgrade impact analysis
- [x] MCP: `grasp_coverage` tool — test file coverage overlay
- [x] MCP: `grasp_timeline` tool — git history with co-change matrix
- [x] MCP: `grasp_pr_comment` tool — PR health comment with blast radius
- [x] MCP: `grasp_embed` tool — shareable iframe, badge, React snippet
- [x] MCP: `grasp_refactor` tool — step-by-step refactor plan
- [x] MCP: `grasp_cross_repo` tool — compare two sessions / monorepo support
- [x] MCP: `grasp_similarity` tool — duplicate clusters and code clones
- [x] MCP: `grasp_dead_packages` — npm deps declared but never imported
- [x] MCP: `grasp_sarif` — SARIF 2.1.0 export for GitHub Code Scanning
- [x] MCP: `grasp_runtime_calls` — merge live trace with static graph
- [x] MCP: `grasp_db_coupling` — ORM/SQL table coupling map
- [x] MCP: `grasp_migration_plan` — phased package migration plan
- [x] MCP: `grasp_api_surface` — unified API surface from OpenAPI, GraphQL, Express/FastAPI routes
- [x] CLI: `grasp ./my-project` opens browser pre-loaded (local server + `--report` for terminal)
- [x] CLI: `grasp . --watch` — live SSE browser sync, LIVE badge in UI
- [x] CLI: `grasp . --timeline` — inject last 30 commits as time-travel scrubber
- [x] CLI: `grasp . --pr-comment` — print PR comment markdown to stdout
- [x] GitHub Action: post health score as PR comment, updates on re-push
- [x] Graph: Color modes for Duplicate density, Code Ownership, GitHub Issues, Coverage, Bundle, API Surface, Runtime
- [x] Graph: Workspace sidebar for monorepo sub-package filtering
- [x] Graph: Refactor hints panel per selected file
- [x] Graph: Shareable embed modal (iframe, badge, direct link)
- [x] Graph: Timeline scrubber — yellow glow on changed nodes per commit
- [x] Graph: persist pinned node positions across sessions
- [x] Graph: Cmd+K search pans to the matching node
- [x] Graph: minimap overlay for large codebases
- [x] Function-level call graph drill-down per file
- [x] VS Code: auto-reanalyse on file save (2s debounce)
- [x] VS Code: 4 color mode buttons in panel header
- [x] VS Code: health score badge in panel header
- [x] VS Code: double-click node to open file in editor
- [x] VS Code: right-click → Grasp: Analyze File context menu
- [x] VS Code: directed link colors (blue = outgoing, green = incoming)
- [x] VS Code: rich node tooltips (complexity, churn, contributor)
- [x] VS Code: status bar item showing deps/dependents for active file
- [x] VS Code: Problems panel integration — security + arch violations as diagnostics
- [x] Custom ignore patterns UI — add/remove directory exclusions, persists in localStorage
- [x] Local git history — churn heatmap works for local repos via `git log`
- [x] GitLab repository support (gitlab.com + self-hosted)
- [x] Pro tier API keys (gsp_ prefix, tier-based rate limits)
- [x] Analysis history store (90-day rolling window, sparkline chart)
- [x] Team Dashboard leaderboard ranked by health score
- [x] Slack Block Kit interactive digest with per-repo action buttons
- [x] Cursor IDE integration (MCP config template, 47-tool guide)
- [x] GitHub Marketplace listing assets (description, pricing, screenshots)
- [x] Automated npm publish on git tags via GitHub Actions

---

## License

**Elastic License 2.0** — Copyright (c) 2026 Ashforde OÜ.

You may use, modify, and distribute this software. You may **not** offer it as a hosted/managed service to third parties, remove copyright notices, or rebrand it for redistribution. See [LICENSE](LICENSE) for full terms.

---

<div align="center">

**Built for developers who want to truly understand their codebase**

*See the code. Know the code.*

</div>
