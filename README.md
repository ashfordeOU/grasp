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
Color files by commit frequency to see the hot spots in your codebase.

### 📋 **PR Impact Analysis**
Paste a PR URL to see which files it touches and calculate the blast radius of proposed changes before merging.

### 💻 **Local File Analysis**
- **Privacy First** — your code never leaves your machine
- **Offline Support** — works without internet
- **Drag & Drop** — drag files or folders straight onto the page
- **Recursive scanning** — analyze entire project structures

---

## Quick Start

### Option 1: Self-Host (30 seconds)
```bash
git clone https://github.com/ashfordeOU/grasp.git
cd grasp
open index.html
```
No build process. No dependencies. No `npm install`. **It's one HTML file.**

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
```

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

**13 tools available to agents:**

| Tool | What it answers |
|------|----------------|
| `grasp_analyze` | Full analysis of any repo or local path — run first |
| `grasp_file_deps` | What does this file depend on? |
| `grasp_dependents` | What breaks if I change this file? |
| `grasp_cycles` | Are there circular dependencies? |
| `grasp_architecture` | What layers does this codebase have? |
| `grasp_hotspots` | Which files are riskiest to touch? |
| `grasp_metrics` | Lines, complexity, fan-in/fan-out per file |
| `grasp_find_path` | How does file A connect to file B? |
| `grasp_security` | Any hardcoded secrets or injection risks? |
| `grasp_patterns` | What design patterns are in use? |
| `grasp_sessions` | List active analysis sessions |
| `grasp_diff` | Compare two analysis snapshots — what changed? |
| `grasp_suggest` | Ranked refactoring suggestions from hotspot data |
| `grasp_explain` | Plain-English explanation of any file or function |
| `grasp_watch` | Re-analyse a directory and diff against a previous run |

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

---

## Advanced Features

### ⚡ Command Palette
Press `Cmd+K` (Mac) / `Ctrl+K` (Windows) — search files, navigate to any function, or jump to issues instantly.

### 🔍 Path Finder
Select two files in the details panel to find the shortest dependency chain between them.

### 🏛️ Architecture Rule Engine
Define custom FORBIDDEN dependency rules (e.g., `utils → services` is FORBIDDEN). Violations are flagged as issues and persist across sessions.

### 📅 History & Snapshots
Every analysis is saved automatically. Click **HISTORY** in the right panel to compare health scores over time.

### 📤 Export Reports
Export as JSON, Markdown, Plain Text, or SVG. Full schema in [docs/api-schema.md](docs/api-schema.md).

---

## CI/CD Integration

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
┌──────────────────────────────────────────────────────────┐
│                        Grasp                             │
├─────────────────────────┬────────────────────────────────┤
│     Browser App         │         MCP Server             │
│     (index.html)        │         (mcp/)                 │
│                         │                                │
│  ┌─────────────────┐    │   ┌──────────────────────┐     │
│  │  Parser Engine  │◄───┼───│  parser.js (shared)  │     │
│  │  (embedded JS)  │    │   └──────────────────────┘     │
│  └────────┬────────┘    │            │                   │
│           │             │   ┌────────▼────────┐          │
│  ┌────────▼────────┐    │   │  analyzer.ts    │          │
│  │  React + D3     │    │   │  (pipeline)     │          │
│  │  Visualisation  │    │   └────────┬────────┘          │
│  └─────────────────┘    │            │                   │
│                         │   ┌────────▼────────┐          │
│  Zero install —         │   │  11 MCP Tools   │          │
│  one HTML file          │   │  (stdio server) │          │
└─────────────────────────┴───┴─────────────────┴──────────┘
```

**Browser app:** zero dependencies to install. Everything runs from CDNs: React 18, D3.js 7, Babel.

**MCP server:** Node.js 18+, `npm install` inside `mcp/`.

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
- [ ] Full tree-sitter support for JS/TS function extraction
- [x] More design pattern detection (Strategy, Command, State)
- [x] Export to PNG
- [x] MCP: `grasp_diff` tool — compare two snapshots over time
- [x] MCP: `grasp_suggest` tool — refactoring suggestions from hotspot data
- [x] MCP: `grasp_explain` tool — plain-English file/function explanation
- [x] MCP: `grasp_watch` tool — re-analyse directory and diff against prior run
- [x] CLI: `grasp ./my-project` opens browser pre-loaded (local server + `--report` for terminal)
- [x] GitHub Action: post health score as PR comment
- [x] Graph: persist pinned node positions across sessions
- [x] Graph: Cmd+K search pans to the matching node
- [x] Graph: minimap overlay for large codebases
- [x] Function-level call graph drill-down per file
- [x] Timeline scrubber in the History tab — sparkline + range slider across snapshots
- [x] VS Code extension — sidebar graph panel, auto-pans to active file (`vscode-extension/`)

---

## License

MIT License — Copyright (c) 2026 Ashforde OÜ. Free to use, modify, and distribute. Keep the copyright notice intact in all copies.

---

<div align="center">

**Built for developers who want to truly understand their codebase**

*See the code. Know the code.*

</div>
