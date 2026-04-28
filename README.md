<div align="center">

<img src="grasp-social-v2.png" alt="Grasp — Code Architecture Suite" width="100%"/>

<br/>
<br/>

<a href="https://github.com/ashfordeOU/grasp/actions/workflows/ci.yml" target="_blank"><img src="https://github.com/ashfordeOU/grasp/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank"><img src="https://img.shields.io/npm/v/grasp-mcp-server?label=MCP%20Server&color=00d4aa&style=flat-square&logo=npm" alt="npm"/></a>
<a href="LICENSE" target="_blank"><img src="https://img.shields.io/badge/license-ELv2-4d9fff?style=flat-square" alt="License"/></a>
<a href="https://ashfordeou.github.io/grasp" target="_blank"><img src="https://img.shields.io/badge/browser%20app-live-00d4aa?style=flat-square&logo=github" alt="GitHub Pages"/></a>

<br/>

**121 MCP tools + 8 Resources + 2 Prompts · 35 languages · 12 AI providers · 10 graph views · zero data collection**

<br/>

<a href="https://ashfordeou.github.io/grasp" target="_blank"><img src="https://img.shields.io/badge/▶%20Browser%20App-ashfordeou.github.io%2Fgrasp-0f2a2a?style=for-the-badge&color=0f2a2a&logoColor=00d4aa" alt="Browser App"/></a>
&nbsp;
<a href="https://github.com/ashfordeOU/grasp/releases/latest" target="_blank"><img src="https://img.shields.io/badge/VS%20Code-Install%20(.vsix)-007ACC?style=for-the-badge&logo=visual-studio-code" alt="VS Code"/></a>
&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank"><img src="https://img.shields.io/badge/MCP%20Server-npm-CB3837?style=for-the-badge&logo=npm" alt="MCP Server"/></a>
&nbsp;
<a href="https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer" target="_blank"><img src="https://img.shields.io/badge/JetBrains-Marketplace-000000?style=for-the-badge&logo=jetbrains" alt="JetBrains"/></a>
&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/grasp-code-architecture" target="_blank"><img src="https://img.shields.io/badge/Firefox-Add--ons-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" alt="Firefox Add-ons"/></a>
&nbsp;
<a href="https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj" target="_blank"><img src="https://img.shields.io/badge/Chrome-Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Web Store"/></a>
&nbsp;
<a href="https://github.com/ashfordeOU/grasp/releases" target="_blank"><img src="https://img.shields.io/badge/Safari-Sideload%20(macOS%2013%2B)-0D96F6?style=for-the-badge&logo=safari&logoColor=white" alt="Safari sideload"/></a>
&nbsp;
<a href="https://www.raycast.com/ashfordeOU/grasp" target="_blank"><img src="https://img.shields.io/badge/Raycast-Store-FF6363?style=for-the-badge&logo=raycast&logoColor=white" alt="Raycast Store"/></a>
&nbsp;
<a href="https://zed.dev/extensions?query=grasp" target="_blank"><img src="https://img.shields.io/badge/Zed-Extension-084CCF?style=for-the-badge&logoColor=white" alt="Zed Extension"/></a>

<br/>

<a href="https://ashfordeou.github.io/grasp" target="_blank">🌐 Browser App</a> &nbsp;·&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank">📦 MCP Server</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">🐛 Report Bug</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">✨ Request Feature</a> &nbsp;·&nbsp;
<a href="https://ashfordeou.github.io/grasp/docs/privacy.html" target="_blank">🔒 Privacy</a>

</div>

---

## What is Grasp?

**Grasp** turns any GitHub or GitLab repository — cloud or self-hosted — or local codebase into an interactive architecture map in seconds. **121 MCP tools** (plus 8 Resources and 2 guided Prompts) expose the full analysis engine to Claude Code, Cursor, and any MCP-compatible agent.

```
Paste URL / Open Folder  →  AST Analysis Engine  →  Architecture Map + 121 MCP Tools
```

| | |
|---|---|
| **No installation** | Runs 100% in your browser — two HTML files, no build step |
| **No data collection** | Your code never leaves your machine |
| **No accounts** | Paste a URL and go |
| **Works offline** | Analyse local folders without internet |
| **35 languages** | JS/TS, Python, Go, Java, Rust, C/C++, C#, Ruby, Swift, Kotlin, Scala, Dart, Elixir, Erlang, Haskell, OCaml, F#, Clojure, Julia, Lua, R, Perl, Shell, PowerShell, Groovy, Zig, V, Nim, Crystal, VBA, Ada/SPARK, Vue, Svelte, PHP |
| **121 MCP tools** | Dependency graphs, security, **OSV.dev SCA vulnerability scanning**, DORA, brain store, Kuzu graph schema v3, communities, ORM tracker, git change impact, architecture drift detection, test coverage gap map, org dashboard, PR impact action, MCP Resources/Prompts, `grasp setup` editor auto-config |
| **12 AI providers** | Anthropic Claude, OpenAI GPT-4o, Google Gemini, Mistral, Groq, DeepSeek, Ollama, OpenRouter, Together, Azure OpenAI, LM Studio, plus any local OpenAI-compatible endpoint |
| **10 graph views** | Force graph, 3D, arch, treemap, matrix, tree (dendrogram), flow (sankey), bundle, cluster (disjoint), heatmap |
| **Grasp Brain** | SQLite + Kuzu persistent store — index once, query instantly. FTS5 + 384D vector embeddings + Cypher graph queries |
| **Supply chain signed** | SLSA Level 2 npm provenance + Cosign keyless Docker signing on every release |

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

## Quick Start

### Option 1 — Browser (zero setup)

```bash
git clone https://github.com/ashfordeOU/grasp.git
open index.html           # Main app
open team-dashboard.html  # Team Dashboard
```

No build step. No `npm install`. **Two HTML files.**

### Option 2 — CLI

```bash
npm install -g grasp-mcp-server

grasp ./my-project        # Analyse a local folder
grasp facebook/react      # Analyse a GitHub repo
grasp .                   # Analyse current directory
grasp . --watch           # Live mode — browser reloads on every file save
grasp . --timeline        # Time-travel — last 30 commits as a scrubber
grasp . --report          # Terminal-only report + JSON output
grasp . --format=sarif    # Export SARIF for GitHub Code Scanning
grasp . --pr-comment      # Print GitHub PR comment markdown to stdout
grasp . --check           # Enforce grasp.yml architecture rules (CI gate)
```

### Option 3 — IDE Extensions

| IDE | Install |
|-----|---------|
| **VS Code** | [Install (.vsix)](https://github.com/ashfordeOU/grasp/releases/latest) — download `grasp-vscode-3.17.1.vsix` and run **Extensions: Install from VSIX…** (`Cmd+Shift+P`) |
| **JetBrains** | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) — search **Grasp** in Settings → Plugins |
| **Raycast** | [Raycast Store](https://www.raycast.com/ashfordeOU/grasp) — or search **Grasp** in the Raycast extension store |
| **Zed** | [Zed Extensions](https://zed.dev/extensions?query=grasp) — or search **grasp** in Zed → Extensions |

### Option 4 — Browser Extension

| Browser | Install |
|---------|---------|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) — ID: `grasp@ashforde.org` |
| **Safari** | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) — see [sideload instructions](#safari-sideload) |

A floating **Grasp** button appears on every GitHub and GitLab page. Supports self-hosted GitLab, GitHub Enterprise, and any custom host via on-demand permission grants.

---

### Distribution at a Glance

Every tagged release auto-publishes to all channels:

| Channel | Status | Link |
|---------|--------|------|
| **npm** (`grasp-mcp-server`) | [![npm](https://img.shields.io/npm/v/grasp-mcp-server?style=flat-square)](https://www.npmjs.com/package/grasp-mcp-server) | `npm install -g grasp-mcp-server` |
| **MCP Registry** | Listed | [modelcontextprotocol.io](https://mcpregistry.com) |
| **Docker** (`ghcr.io/ashfordeou/grasp`) | [![ghcr](https://img.shields.io/badge/ghcr.io-latest-blue?style=flat-square)](https://github.com/ashfordeOU/grasp/pkgs/container/grasp) | `docker pull ghcr.io/ashfordeou/grasp:latest` |
| **VS Code** | `.vsix` on Releases | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest) |
| **JetBrains** | Marketplace | [Plugin ID 31362](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) |
| **Raycast** | Store (PR submitted) | [raycast.com/ashfordeOU/grasp](https://www.raycast.com/ashfordeOU/grasp) |
| **Zed** | Extension (PR submitted) | [zed.dev/extensions](https://zed.dev/extensions?query=grasp) |
| **Chrome** | Web Store | [CWS listing](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | AMO (listed) | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) |
| **Safari** | Sideload (macOS 13+) | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitLab bot image** | `ghcr.io/ashfordeou/grasp-gitlab-bot` | Auto-pushed per release |
| **GitLab tunnel agent** | Binary on Releases | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitHub Release** | Signed + checksums | [Releases page](https://github.com/ashfordeOU/grasp/releases) |

<details>
<summary id="safari-sideload">🧭 Safari Sideload Instructions</summary>

```bash
curl -sL https://github.com/ashfordeOU/grasp/releases/latest/download/grasp-safari-extension.zip \
  -o /tmp/grasp-safari.zip \
  && unzip -q /tmp/grasp-safari.zip -d /tmp/grasp-safari \
  && mv /tmp/grasp-safari/Grasp.app /Applications/ \
  && open /Applications/Grasp.app
```

Then in Safari: **Settings → Extensions → enable Grasp**. If it doesn't appear, enable **Safari → Develop → Allow Unsigned Extensions** first.

</details>

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│  Input                                                            │
│  github.com/owner/repo  ·  gitlab.com/ns/proj  ·  ./local/path   │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Analysis Pipeline  (mcp/src/)                                    │
│                                                                   │
│  1. scan        file enumeration + gitignore                      │
│  2. parse       tree-sitter AST · 35 languages · 16 native        │
│  3. routes      HTTP route detection (Express/FastAPI/Gin)        │
│  4. tools       MCP/gRPC tool definition detection                │
│  5. orm         ORM query tracking (Prisma/TypeORM/Sequelize/SA)  │
│  6. scope       3-tier call resolver  (0.95 → 0.90 → 0.50)       │
│  7. types       cross-file type propagation  (Kahn topo-sort)     │
│  8. coverage    test-file detection → TESTS/COVERS edges (v3)     │
│  9. communities Louvain community detection on import graph       │
│ 10. processes   BFS execution-flow tracing from entry points      │
└───────────┬──────────────────────────┬────────────────────────────┘
            │                          │
    ┌───────▼────────┐      ┌──────────▼──────────┐
    │  Browser App   │      │   MCP Server (CLI)   │
    │  index.html    │      │   grasp-mcp-server   │
    │                │      │                      │
    │  10 graph views│      │  121 tools           │
    │  16 color modes│      │  8 Resources         │
    │  AI Chat       │      │  2 guided Prompts    │
    │  Ask Grasp     │      │  Brain + Kuzu v3     │
    │  Coverage Ovly │      │  grasp setup (5 eds) │
    │  VULN tab      │      │  grasp vulns / drift │
    └────────────────┘      └──────────────────────┘
```

---

## Visualizations

### Graph Types

| View | Description |
|------|-------------|
| 🕸️ **Graph** | Force-directed dependency graph — drag, zoom, multi-select |
| 🔮 **3D Graph** | Three-dimensional force graph — rotate, pan, zoom |
| 🏛️ **Arch** | Layer-by-layer architecture diagram |
| 📦 **Treemap** | Files sized by line count, grouped by folder |
| 📊 **Matrix** | Adjacency matrix showing all dependencies |
| 🌳 **Tree** | Hierarchical cluster dendrogram |
| 🌊 **Flow** | Folder-level Sankey dependency flow |
| 🎯 **Bundle** | Circular layout with arc-based connections |
| 🔮 **Cluster** | Separated force graphs per folder |

### Color Modes

| Mode | What it shows |
|------|---------------|
| 📁 **Folder** | Directory structure |
| 🏗️ **Layer** | Architectural layer (UI, Services, Utils, etc.) |
| 🔥 **Churn** | Commit frequency — red = most-changed hot spots |
| ⚡ **Complexity** | Cyclomatic complexity (green → yellow → red) |
| 💥 **Blast** | Blast radius impact for a selected file |
| 🌊 **Depth** | Max brace-nesting depth |
| 🔎 **Dup** | Duplicate code density — red = many clones |
| 👤 **Owner** | Top contributor — spot bus-factor risks |
| 🐛 **Issues** | Linked GitHub Issues per file |
| 🧪 **Coverage** | Test coverage — highlight untested files |
| 📦 **Bundle** | Bundle size contribution |
| 🌐 **API Surface** | Public-facing file exposure |
| ⚡ **Runtime** | Actual call frequency from a live trace |
| 🔒 **Safety** | Safety gate coverage (green = gated, red = ungated) |
| 🧪 **Boundary** | Research/production boundary drift |
| 🧪 **Eval Coverage** | Coverage from eval/test scripts |

---

## Code Intelligence

### 📊 Health Score
Instant **A–F grade** based on dead code, circular dependencies, coupling metrics, and security issues. Displayed as a score (0–100) with a visual bar.

### 🔐 Security Scanner
Automatic detection of hardcoded secrets & API keys, SQL injection risks, dangerous `eval()` usage, and debug statements left in production.

### 🛡️ Dependency Vulnerability Scanner *(v3.17.0)*
Scans declared dependencies against the [OSV.dev](https://osv.dev) free public CVE database — every analysis. Supports `package.json` (with `package-lock.json` resolution), `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml` (with `Cargo.lock` resolution), and `pom.xml`. Severity-classified results with CVSS scores and fix-version suggestions. New **VULN** tab in the right panel; new `grasp_vulnerabilities` MCP tool; new `grasp vulns <path>` CLI that exits 1 on critical/high findings (CI-friendly). Health score deducts –5 per critical and –3 per high. **100% client-side** — OSV requests go directly from your browser to OSV.dev, never through a Grasp server. 24-hour localStorage cache; degrades silently on network failure.

### 🧩 Pattern Detection
Identifies Singleton, Factory, Observer/Event patterns, React hooks, and anti-patterns (God Objects, high coupling) — automatically.

### 💥 Blast Radius Analysis
*"If I change this file, what breaks?"* — select any file and see every downstream file that would be affected, highlighted on the graph.

### 🔥 Activity Heatmap
Colors files by commit frequency. Works for GitHub repos (via API) and **local repos** (via `git log` — no internet required).

### 🔎 Duplicate & Similarity Detection
The **Dup** color mode highlights files with exact or near-duplicate code. The `grasp_similarity` MCP tool returns ranked duplicate clusters for targeted refactoring.

### 👥 Code Ownership
Top contributors per file from git history, with line-percentage breakdowns. One-click jump to GitHub Blame.

### 📋 PR Impact Analysis
Paste a PR URL to see which files it touches and calculate the blast radius of proposed changes before merging.

### 💰 Technical Debt Quantification
Converts every architectural issue into developer-hours using configurable estimates — circular dep = 4h, god file = 16h, critical security = 8h — with a coupling multiplier. Shown in the health panel and Team Dashboard.

### 🔗 Shareable Embeds
Click `⋯ → 🔗 Embed` for a ready-to-paste `<iframe>`, README badge, React snippet, and direct link — share live health reports in docs, wikis, or dashboards.

### 🎯 Connection Confidence Scoring *(v3.16.0)*
Every cross-file connection is scored 0–1: explicit static imports = 1.0, same-folder = 0.8, cross-folder inferred = 0.6, low-frequency = 0.4. The force graph overlays confidence as edge opacity — use the slider in ⚙ settings to filter out low-confidence edges.

### 🔍 Graph Query Modal *(v3.16.0)*
Click the 🔍 toolbar button to search files, functions, and edges in-browser without leaving the graph. Matches update live — click any file result to jump to it on the graph.

### ƒ() Function-Level Canvas *(v3.16.0)*
Toggle the `ƒ()` button to switch the force graph from file-level to function-level nodes — see individual function call relationships, capped at 300 nodes for performance.

### 🗄️ DB Coupling Tab *(v3.16.0)*
The right panel **🗄️ DB** tab scans file content for ORM patterns (Django, TypeORM, raw SQL), mapping which files reference which tables. Instantly spot god-tables and high-coupling files.

### 🎯 Good First Issues Tab *(v3.16.0)*
The **🎯 GFI** tab surfaces isolated, low-complexity, untested files — ideal contribution targets for new engineers or AI coding agents.

### 🔐 PII Detection & Security Subcategories *(v3.16.0)*
The Security tab now has subcategory pills — **ALL / SECRETS / INJECTION / PII / EVAL** — to filter findings. The PII pill scans file content for email, phone, SSN, credit card, and API key patterns in source files.

### 📸 Architecture Drift Detection *(v3.17.0)*
Snapshot your codebase architecture and detect drift over time — automatically.

```bash
grasp snapshot ./my-project --name before-refactor
# ... make changes ...
grasp drift ./my-project          # exits 1 if drift is CRITICAL (CI-friendly)
```

| MCP Tool | Description |
|----------|-------------|
| `grasp_snapshot` | Save current health score, coupling metrics, circular deps, and top-10 hotspots as a named snapshot |
| `grasp_diff_snapshots` | Compare any two snapshots — returns health delta, new circular deps, files whose coupling increased >20%, drift level (STABLE / DEGRADED / CRITICAL) |

Snapshots are stored in `~/.grasp/brain.db` and persist across analysis sessions.

### 🧪 Test Coverage Gap Map *(v3.17.0)*
Find the functions most likely to cause production incidents — highest call count, zero test coverage.

```bash
grasp_coverage_gaps  # via MCP — returns uncovered_functions sorted by call_count DESC
```

The dependency graph gains a **🧪 Coverage overlay** toggle — uncovered functions render in red, partially-covered in amber, covered in green. Coverage is estimated by static analysis: Grasp detects test files (`*.test.*`, `*.spec.*`, `test_*`, `*_test.*`) and traces which source functions they reference.

| MCP Tool | Description |
|----------|-------------|
| `grasp_coverage_gaps` | Returns `uncovered_functions` (sorted by call count), `risky_uncovered` (high churn + no tests), `coverage_by_module` per directory, and `overall_coverage_estimate` |

### 🏢 Org-Level Dashboard *(v3.17.0)*
Analyse an entire GitHub organisation in one command:

```bash
grasp org my-github-org --token ghp_xxx --format html   # Self-contained HTML dashboard
grasp org my-github-org --format json                   # CI-consumable JSON
grasp org my-github-org --format md                     # Markdown for wikis
```

Aggregates health grades, security findings, most-churned files, and language distribution across all repos (up to 500, 5 concurrent). The HTML output embeds Chart.js inline — no external dependencies.

| MCP Tool | Description |
|----------|-------------|
| `grasp_org_summary` | Analyse up to 20 top repos in an org — returns aggregate health grade, grade distribution, total security findings by severity, top churned files, language breakdown |

### 🤖 PR Impact GitHub Action *(v3.17.0)*
Add automated architectural impact analysis to every pull request:

```yaml
# .github/workflows/grasp-pr-impact.yml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-risk-to-comment: LOW      # LOW / MEDIUM / HIGH / CRITICAL
    fail-on-risk: CRITICAL        # fail the CI check at this risk level
```

The action posts a structured PR comment showing:
- **Risk badge** (LOW / MEDIUM / HIGH / CRITICAL) with colour coding
- Changed files with function-level blast radius
- Affected execution processes (with step counts)
- Suggested reviewers from `git blame` (top 2 contributors per affected file)
- Test coverage gaps: which changed functions have no test file touching them

---

## AI Chat — 15 Providers

Built-in AI assistant that knows your entire codebase. Ask *"why is auth.ts a hotspot?"*, *"which files are safest to refactor?"*, or *"explain the security issues in this call chain"* — answers reference your live dependency graph, security findings, and architectural layers.

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-4o, GPT-4o mini, o3-mini, o1 |
| **Google Gemini** | Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash |
| **Mistral** | Mistral Small, Mistral Large |
| **Groq** | Llama 3.3 70B, 3.1 8B, Gemma 2 9B |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner |
| **OpenRouter** | Any model slug (100+ models via one key) |
| **Together AI** | Any model slug |
| **Ollama** | Local models (no key needed) |
| **LM Studio** | Local models on any port |
| **Custom** | Any OpenAI-compatible base URL |

**Features:**
- Multi-turn conversation memory — persisted in `localStorage` across page refreshes
- Selected-file context — layer, functions, complexity, and issues injected automatically when a file is selected
- Rich codebase context — top 80 files with metadata, all issues, security findings, circular deps, layer breakdown
- Markdown rendering with syntax-highlighted code blocks
- API key stays in your browser only, never sent anywhere except the chosen provider

---

## Grasp Brain — Persistent Architecture Intelligence *(v3.16.0)*

Grasp Brain combines two persistent stores that work together:

- **SQLite Brain** (`~/.grasp/brain.db`) — file metadata, coupling, security, and issue index. Includes a FTS5 full-text index over functions and an in-process 384D vector embedding store (Xenova/all-MiniLM-L6-v2 — no cloud dependency). Index once, query instantly.
- **Kuzu Graph DB** (`~/.grasp/graph/`) — native graph database with Cypher query support. Stores the full function call graph, file imports, and type relationships as a traversable property graph.

Index once, then query instantly — no re-analysis needed. Every function is tagged with the execution processes it participates in (BFS from entry points), so search results include a `processes[]` field grouping matches by flow.

### How it works

```
grasp index ./my-project    →  analysis stored in ~/.grasp/brain.db
grasp context src/api.ts    →  instant file context from the stored index
grasp diff ./my-project     →  compare current state vs stored baseline
grasp daemon ./my-project   →  watch for changes, re-index automatically
```

### CLI Subcommands

```bash
grasp index <path>           # Analyse and persist a repo to the brain
grasp context <src> <file>   # Get rich context for any file
grasp setup [path]           # Install hooks in Claude Code / Cursor / Windsurf
grasp diff <path>            # Compare current analysis vs brain baseline
grasp daemon <path>          # Watch directory and auto-reindex on changes
grasp drift [path]           # Snapshot + diff vs last snapshot; exits 1 on CRITICAL
grasp org <github-org>       # Org-level dashboard (--format json|html|md --token ghp_xxx)
```

### Ask Grasp — Natural Language Architecture Queries

Both the browser app (Ask Grasp panel) and `grasp_ask` MCP tool support plain-English questions about your codebase. `grasp_ask` recognises structural intents directly; for open-ended queries it falls back to **hybrid semantic search** — BM25 full-text + 384D vector embeddings merged with Reciprocal Rank Fusion.

For pure semantic search without the question-answering layer, use `grasp_search` directly — results include a `processes[]` field showing which execution flows each match belongs to.

| Question | What you get |
|----------|--------------|
| *"What are the most complex files?"* | Files ranked by cyclomatic complexity |
| *"Show me coupling hotspots"* | Files with highest combined fan-in + fan-out |
| *"Any security issues?"* | All security findings across the codebase |
| *"What's the blast radius of auth.ts?"* | Full transitive impact list |
| *"What layer handles data access?"* | Layer breakdown with file examples |
| *"What's the overall grade?"* | Health score, grade, issue summary |
| *"Which files have the most churn?"* | Commit frequency ranking |
| *"Are there circular dependencies?"* | Cycle list with severity |

### Registry — All Indexed Repos

`grasp_registry_list` and `grasp_registry_status` expose the full Brain index:

```bash
# Via MCP
grasp_registry_list          # all repos: health grade, files, functions, active sessions
grasp_registry_status        # aggregate: indexed count, session count, grade distribution

# Via HTTP (when MCP server runs with --http)
curl http://localhost:7332/api/v1/registry
```

The Team Dashboard **🗂️ Registry panel** auto-fetches this on load — no session_id needed.

### Arch Diff

`grasp diff` (and `grasp_arch_diff` MCP tool) compares your current codebase against the stored brain baseline and surfaces:
- Grade degradations (files that got worse: A→B, B→C, etc.)
- Health score delta
- New security issues introduced since baseline

### Editor Hooks (`grasp setup`)

Detects `.claude/`, `.cursor/`, `.windsurf/` in your repo and installs a pre-tool-use hook that automatically gives your AI coding assistant codebase context before every action. Also writes `CLAUDE.md` and `AGENTS.md` with architecture summaries.

---

## Team & Collaboration

### 🏢 Team Dashboard

Track health across multiple repos in one view. Add any public (or private, with a token) GitHub repo and see:

- Health score, grade, files, issues, circular deps, security findings, architectural layers
- **Pattern count, Env var issues, Feature flag count** — new v3.13.0 columns
- **DORA metrics mini-card** — Deploy Frequency, Lead Time, Change Fail Rate, MTTR per repo (expandable row)
- **🗂️ Registry panel** — all Brain-indexed repos with live health grades and session status
- Commit activity (7d / 30d) and CI status (✅/❌/⏳)
- Commit velocity sparkline, Technical debt in developer-days
- Export the full table as **CSV or JSON**. Open local folders with 📁 Open Folder (File System Access API).

### 🔄 Live Team Collaboration

Grasp's CLI hosts a real-time collaboration server for your whole team:

```bash
npx grasp --host=0.0.0.0 --room-secrets=backend:pass1,frontend:pass2
#   → main app:       http://server-ip:7331/
#   → team dashboard: http://server-ip:7331/dashboard
#   → health check:   http://server-ip:7331/api/health
```

- **WebSocket sync** — workspace changes propagate to all connected team members instantly
- **Named rooms** — `?sync_room=backend-team` isolates each team's workspace
- **Presence indicators** — see who's online in the Sync panel
- **Share links** — ⎘ Copy team link or 👁 Copy read-only link
- **Read-only mode** — `?readonly=1` for observers
- **Password protection** — `--room-secrets=room:password`
- **REST API** — `GET /api/health` · `GET /api/rooms` · `GET/PUT /api/workspace/:room`

> **LAN hosting:** anyone on the same network accesses `http://server-ip:7331/dashboard` — no cloud needed.

### 🏢 Monorepo & Workspace Support

Grasp automatically detects sub-packages in monorepos (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`). A **Workspace** sidebar lets you filter to a single package — all graphs, treemaps, and metrics update instantly.

### ⏮️ Time-Travel Architecture Scrubber

Run `grasp . --timeline` to load your last 30 git commits as a scrubber panel. Drag the slider to any commit — changed nodes glow yellow on the graph so you can watch your architecture evolve over time.

### 📡 Live Watch Mode

Run `grasp . --watch` for a local dev server with real-time SSE sync. Every file save reloads the browser graph automatically — a `LIVE` badge appears while connected.

---

## Industry Verticals

### ✈️ Aerospace / Safety-Critical

| Feature | Description |
|---------|-------------|
| **Requirement Traceability** | Upload a requirements CSV — Grasp scans for `@REQ-NNN` tags and shows coverage %, missing, and unspecified files. One-click compliance matrix export. |
| **MISRA / Safety Mode** | `⋯ → 🔧 Safety Mode` — detect MISRA C/C++ and Ada violations: dynamic allocation after init, recursive calls, `goto`, `abort()`/`exit()`. |
| **DO-178C / ECSS Certification Export** | One-click certification evidence package: inventory, traceability matrix, complexity, MISRA violations, security findings — JSON and printable HTML. |
| **Anomaly Investigation** | Select file → 🔍 Anomaly Investigation — callers, callees, transitive blast radius, recent commits, security in call path, plain-English summary. |
| **Software Reuse Assessor** | Traffic-light matrix across Interface Compatibility, Dependencies, Safety Level, Architecture Fitness, Security, Complexity. |
| **Cross-language Call Graph** | Ada→C `pragma Import`, Python `ctypes`/`cffi`, JS→WASM boundaries. |
| **Heritage Software Genealogy** | Overlay an origin-mission manifest, identify zero-delta certification shortcuts. |
| **ICD Mapper** | Match Interface Control Document entries to exported functions, flag unimplemented interfaces. |
| **ECSS-E-ST-40C Compliance** | Check DI-01, DI-04, DI-07, DI-10, DI-15 compliance requirements. |

### 🧠 AI Research

| Feature | Description |
|---------|-------------|
| **Safety Constraint Tracer** | Mark safety gates (filters, sanitizers) — trace every entry→output path and flag any that bypass all gates. New **Safety** color mode. |
| **Research/Production Boundary** | Define research vs production folders — flags production files that import from research code. |
| **Jupyter Notebook Support** | `.ipynb` in the dependency graph — extracts code cells, parses imports, flags reproducibility issues. |
| **Training Run Diff** | Upload two YAML/JSON configs — diff hyperparameters and find which files read each changed key. |
| **Eval Coverage Map** | Auto-detects eval scripts and traces which model/training code they exercise. Safety gates with no eval coverage flagged as critical. |
| **ML Pipeline DAG** | Detects PyTorch, TensorFlow, JAX, HuggingFace patterns — renders Data→Model→Training→Eval→Checkpoint DAG. |

### 🏢 Enterprise

| Feature | Description |
|---------|-------------|
| **SBOM Generation** | CycloneDX 1.4 or SPDX 2.3 JSON for npm, pip, Cargo, Go modules. Optional CVE enrichment via OSV API. |
| **DORA Metrics** | Deployment Frequency, Lead Time, Change Failure Rate, MTTR from GitHub Actions. Elite/High/Medium/Low classification. |
| **AI-Powered ADR Generation** | One-click MADR-format Architecture Decision Records using codebase context + optional PR diff. |
| **PII Data Flow Tracer** | BFS from user-marked PII source files — shows all downstream consumers. |
| **Separation of Duties** | Detects files that both initiate and approve transactions (SOX/FDA compliance). |
| **Regulatory Change Impact** | Keywords-to-blast-radius for GDPR/HIPAA/SOX/PCI-DSS article changes. |
| **Finance / Trading** | Latency hotspot detection — blocking I/O, GC pressure, lock contention, allocation in loops. |
| **Financial Model Risk** | Hardcoded parameters, missing NaN checks, division without zero-guard. |

---

## For AI Agents — MCP Server

Grasp ships a **Model Context Protocol (MCP) server** that exposes the full analysis engine as callable tools for Claude Code, Cursor, and any MCP-compatible agent.

### Setup

```bash
# Install
npm install -g grasp-mcp-server

# Or run without installing
npx grasp-mcp-server
```

Add to `~/.claude/claude_mcp_settings.json`:

```json
{
  "mcpServers": {
    "grasp": {
      "command": "npx",
      "args": ["-y", "grasp-mcp-server"]
    }
  }
}
```

Works with GitHub repos and local directories. See [`mcp/README.md`](mcp/README.md) for GitLab, Docker, and self-hosted options.

### Tools Reference

**Core Analysis**

| Tool | What it does |
|------|-------------|
| `grasp_analyze` | Full analysis of any repo or local path — returns `session_id` for follow-up queries |
| `grasp_sessions` | List active sessions (persist 7 days, survive restarts) |
| `grasp_diff` | Compare two snapshots — what changed between analyses? |
| `grasp_watch` | Re-analyse a directory and diff against a prior run |
| `grasp_rules_check` | Run `grasp.yml` architecture rules and report violations |
| `grasp_config_check` | Validate a session against architecture rules — returns violations |

**File & Code Intelligence**

| Tool | What it does |
|------|-------------|
| `grasp_file_deps` | What does this file depend on? |
| `grasp_dependents` | What breaks if I change this file? |
| `grasp_cycles` | Are there circular dependencies? |
| `grasp_architecture` | What layers does this codebase have? |
| `grasp_hotspots` | Which files are riskiest to touch? |
| `grasp_metrics` | Lines, complexity, fan-in/fan-out per file |
| `grasp_find_path` | How does file A connect to file B? |
| `grasp_patterns` | What design patterns are in use? |
| `grasp_unused` | Dead code — defined but never called |
| `grasp_explain` | Plain-English explanation of any file or function |
| `grasp_refactor` | Step-by-step refactor plan for a file or session |
| `grasp_suggest` | Ranked refactoring suggestions by effort-to-impact ratio |
| `grasp_onboard` | Ordered reading path for new engineers entering a codebase area |
| `grasp_types` | Type annotation coverage — prioritises high fan-in files lacking types |
| `grasp_similarity` | Ranked duplicate clusters and code-clone groups |
| `grasp_stale` | Active but abandoned files — low churn, high fan-in, no test counterpart |
| `grasp_change_risk` | Risk score 0–100 for a set of changed files |

**Security & Compliance**

| Tool | What it does |
|------|-------------|
| `grasp_security` | Hardcoded secrets, injection risks, dangerous patterns |
| `grasp_sbom` | SBOM in CycloneDX 1.4 or SPDX 2.3 JSON |
| `grasp_sarif` | SARIF 2.1.0 export for GitHub Code Scanning |
| `grasp_license` | Dependency licenses — flags copyleft and unknown |
| `grasp_pii_trace` | BFS trace from PII source files to all consumers |
| `grasp_duties` | Separation of duties — files that both initiate and approve |
| `grasp_reg_impact` | Regulatory change blast radius (GDPR/HIPAA/SOX/PCI-DSS) |
| `grasp_env_vars` | All env var reads — flags undocumented and test-only vars |
| `grasp_feature_flags` | All feature flag reads (LaunchDarkly, GrowthBook, env-var flags) |

**Team & DevOps**

| Tool | What it does |
|------|-------------|
| `grasp_pr_comment` | Generate PR health comment with blast radius for changed files |
| `grasp_pr_review` | Post inline review comments on a GitHub PR at high-severity lines |
| `grasp_commits` | Commit counts for last 7d and 30d |
| `grasp_ci_status` | Latest GitHub Actions run — passing/failing/in-progress |
| `grasp_dora` | DORA metrics — Deployment Frequency, Lead Time, CFR, MTTR |
| `grasp_adr` | AI-powered MADR-format Architecture Decision Record |
| `grasp_embed` | Generate iframe, README badge, React snippet for sharing |
| `grasp_timeline` | Last N commits with per-commit changed files + co-change matrix |
| `grasp_contributors` | Per-file ownership, bus-factor, top contributors |
| `grasp_coverage` | Test coverage overlay — which files lack tests? |
| `grasp_issues` | Map GitHub Issues to the files they mention |
| `grasp_jira_issues` | Map Jira issues to source files via project key |
| `grasp_service_graph` | Service-level dependency graph from OTEL / custom trace JSON |
| `grasp_deps_dev` | Ecosystem dependents via deps.dev — how many packages depend on this repo |

**Brain / Intelligence** *(v3.16.0)*

| Tool | What it does |
|------|-------------|
| `grasp_brain_index` | Analyse and persist a repo to the local SQLite brain |
| `grasp_brain_status` | What's indexed in the brain and when? |
| `grasp_context` | Rich file context — layer, complexity, coupling, security, dependents, dependencies |
| `grasp_arch_diff` | Compare current state vs brain baseline — detect degradations |
| `grasp_ask` | Ask a natural language question about your architecture |

**Graph Core** *(Kuzu — v3.16.0)*

| Tool | What it does |
|------|-------------|
| `graph_query` | Run read-only Cypher queries against the persistent function/file call graph |
| `call_chain` | Trace caller and callee chains for any function, up to configurable depth |
| `type_propagation` | Find all functions sharing a return type and their call neighbors |
| `function_graph` | Render a Mermaid / DOT / JSON subgraph centred on any named function |

**Advanced Analysis**

| Tool | What it does |
|------|-------------|
| `grasp_dead_packages` | npm deps in `package.json` but never imported |
| `grasp_runtime_calls` | Merge a live runtime trace with static edges — actual hot paths |
| `grasp_db_coupling` | ORM/SQL-to-table coupling map — god tables, high-coupling files |
| `grasp_migration_plan` | Phased topologically-ordered plan for replacing a package/module |
| `grasp_api_surface` | Unified API surface from OpenAPI, GraphQL, Express/FastAPI routes |
| `grasp_events` | Event emitters and subscribers — orphaned emits, ghost subscriptions |
| `grasp_perf` | N+1 queries, synchronous I/O, JSON serialization in loops |
| `grasp_bundle` | Bundle size treemap — largest files by size category |
| `grasp_dep_impact` | Impact of upgrading a dependency across all files |
| `grasp_cross_repo` | Compare two sessions — shared files, diverged functions |
| `grasp_diagram` | Generate Mermaid flowchart or C4 diagrams from the dependency graph |

**Aerospace / Safety-Critical Vertical**

| Tool | What it does |
|------|-------------|
| `grasp_req_trace` | Requirement traceability — scan `@REQ-NNN` tags against a CSV |
| `grasp_anomaly` | Anomaly investigation — BFS blast radius, security in call chain, plain-English summary |
| `grasp_reuse` | Software reuse assessor — Red/Amber/Green compatibility matrix |
| `grasp_safety_trace` | Safety constraint tracer — finds paths that bypass all safety gates |
| `grasp_multilang` | Cross-language call graph (Ada→C, Python→C, JS→WASM) |
| `grasp_heritage` | Heritage software genealogy — zero-delta certification shortcuts |
| `grasp_icd` | ICD mapper — match Interface Control Document entries to code |
| `grasp_ecss` | ECSS-E-ST-40C compliance checker (DI-01, DI-04, DI-07, DI-10, DI-15) |

**AI Research Vertical**

| Tool | What it does |
|------|-------------|
| `grasp_run_diff` | Training run diff — changed hyperparameters and affected code |
| `grasp_eval_coverage` | Eval coverage map — safety gates with no eval coverage flagged critical |

**Multi-Repo / Platform**

| Tool | What it does |
|------|-------------|
| `grasp_org_graph` | Org-level multi-repo dependency graph with inter-repo edges |
| `grasp_api_diff` | Breaking API change detector — removed/changed exported symbols |
| `grasp_plugins` | Extension-point map — plugin interfaces, hook points, strategy patterns |
| `grasp_semver` | Semantic versioning enforcer — validate semver bump for the change set |
| `grasp_abi_diff` | ABI/API stability checker — stability score 0–100 |
| `grasp_subsystems` | Kernel/OS subsystem boundary map |
| `grasp_kconfig` | Kconfig/build-time conditional analysis — CONFIG_* usage map |
| `grasp_irq` | IRQ/interrupt dependency graph — blocking calls, allocation in handlers |
| `grasp_patch_impact` | Patch series impact analyzer — rank patches by blast radius + complexity |
| `grasp_good_first_issues` | Good first issue generator — isolated, low-complexity, untested files |
| `grasp_api_stability` | API stability score (0–100) between two sessions |
| `grasp_fork_diff` | Fork divergence analysis — diverged/identical/fork-only files |
| `grasp_latency` | Finance/trading latency hotspot detection |
| `grasp_model_risk` | Financial model risk auditor |

**Code Intelligence *(v3.16.0)***

| Tool | What it does |
|------|-------------|
| `grasp_diff_symbols` | Map `git diff` hunks to functions — blast radius of a PR before merge |
| `grasp_exec_flow` | BFS execution flow from any entry point with STEP_IN_PROCESS edges + Mermaid chart |
| `grasp_skillmd` | Auto-generate `SKILL.md` / `CLAUDE.md` snippet from the analysis session |
| `grasp_hooks` | Generate `.claude/settings.json` PostToolUse hook + `.cursor/rules/grasp.mdc` |
| `grasp_mro` | Method Resolution Order — C3 linearization (Python), MRO for Ruby/Java hierarchies |
| `grasp_communities` | Leiden/Louvain community detection — identify bounded contexts and microservice candidates |
| `grasp_contracts` | Multi-repo contract analysis — provider exports vs consumer usage, violations + coverage % |

**Analysis Intelligence *(v3.16.0)***

| Tool | What it does |
|------|-------------|
| `grasp_confidence` | Score every cross-file connection 0–1 (explicit import=1.0, same-folder=0.8, cross-folder=0.6, low-freq=0.4) |
| `grasp_wiki` | Auto-generate a markdown wiki: index.md + per-folder pages + api.md sorted by caller count |
| `grasp_registry_list` | List all Brain-indexed repos with health grade, file/function counts, and active session IDs |
| `grasp_registry_status` | Registry health: indexed count, session count, grade distribution |
| `grasp_resolve_receiver` | Resolve the concrete class for every class method — what `self`/`this` refers to across Python, JS, Java, Ruby |

**Semantic Search, Rename & Routes *(v3.16.0)***

| Tool | What it does |
|------|-------------|
| `grasp_search` | Hybrid semantic search — BM25 FTS5 + 384D vector embeddings (Xenova/all-MiniLM-L6-v2) merged with Reciprocal Rank Fusion. Results include `processes[]` grouping by execution flow. Supports `@groupName` fan-out across multiple repos |
| `grasp_rename` | Graph-aware whole-codebase symbol rename using brain store edges to find every reference. `apply: false` (default) returns a dry-run diff; `apply: true` writes changes to disk |
| `grasp_route_map` | Scan for HTTP route definitions (Express/Fastify/Hono, FastAPI/Flask, Gin) — maps each route to its handler function with file location |
| `grasp_api_impact` | Given a route or handler name, returns all callers, downstream services, and blast radius using brain graph edges |
| `grasp_tool_map` | Scan for MCP tool definitions (`server.tool` / `server.registerTool`) and gRPC service definitions — returns a service contract map |
| `grasp_shape_check` | For any function, traces parameter types and return types across all call sites from the brain index; flags call-site mismatches |
| `grasp_group_add` | Add a repo source to a named group in `~/.grasp/groups.json` for multi-repo `@groupName` fan-out |
| `grasp_group_list` | List all named groups and their member repos from `~/.grasp/groups.json` |

**Graph Intelligence *(v3.16.0)***

| Tool | Description |
|---|---|
| `grasp_graph_schema` | Kuzu schema v2 introspection — node/edge table definitions (Class, Interface, Method, Constructor + 10 edge types) with live row counts |
| `grasp_type_propagation` | Cross-file type inference via Kahn topological sort over import graph; returns top inferred types with confidence 0–1 |
| `grasp_orm_map` | ORM query tracker — Prisma, TypeORM, Sequelize, SQLAlchemy; results grouped by model with call sites, operations, frequency |
| `grasp_detect_changes` | Git diff → symbol impact: changed files, affected functions, impacted process flows, risk level `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` |
| `grasp_generate_agents_md` | Generate rich AGENTS.md from brain session — functional communities, execution processes, health grade, top issues |
| `grasp_generate_skills` | Per-community `.claude/skills/generated/<community>.md` files — key files, entry points, cross-area deps |

**MCP Resources *(v3.16.0)*** — 8 live `grasp://` URIs for direct resource access: `grasp://repos` · `grasp://setup` · `grasp://repo/{id}/context` · `grasp://repo/{id}/clusters` · `grasp://repo/{id}/processes` · `grasp://repo/{id}/schema` · `grasp://repo/{id}/cluster/{name}` · `grasp://repo/{id}/process/{name}`

**MCP Prompts *(v3.16.0)*** — `detect_impact` (changes → symbols → processes → risk → test scope) · `generate_map` (repos → analyze → diagram → communities → wiki)

---

## CI/CD Integration

### GitHub Actions — Automatic PR Comments

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

The workflow posts and updates a comment on every PR:

| Metric | Value |
|--------|-------|
| **Health Score** | `████████░░` **82/100** |
| **Grade** | 🟢 **A** |
| **Files** | 142 (891 functions) |
| **Architecture Issues** | 3 |
| **Circular Deps** | 0 ✓ |
| **Security** | 0 ✓ |
| **Changed Files** | 5 code files in this PR |

### Architecture Rules (`grasp.yml`)

```yaml
rules:
  - min_health_score: 70       # fail CI if score drops below 70
  - max_blast_radius: 20       # flag any file affecting 20+ others
```

Run locally with `grasp . --check`, or use the [GitHub Actions template](docs/examples/grasp-check.yml).

### CLI-based CI Gate

```bash
grasp . --report   # Writes grasp-report.json, exit 0 = pass, exit 1 = fail
```

```yaml
- name: Grasp health gate
  run: |
    PASSED=$(cat grasp-report.json | jq '.ci.passed')
    SCORE=$(cat grasp-report.json | jq '.ci.score')
    echo "Health score: $SCORE"
    if [ "$PASSED" != "true" ]; then
      cat grasp-report.json | jq '.ci.failures'
      exit 1
    fi
```

See [docs/api-schema.md](docs/api-schema.md) for the full export schema.

### SARIF Upload (GitHub Code Scanning)

```bash
grasp . --format=sarif   # Writes grasp-results.sarif
```

```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: grasp-results.sarif
```

---

## Advanced Features

### ⚡ Command Palette
`Cmd+K` (Mac) / `Ctrl+K` (Windows) — search files, jump to functions, navigate to issues. Selecting a result pans the graph to that node.

### 🔍 Path Finder
Select two files in the details panel to find the shortest dependency chain between them.

### 🏛️ Architecture Rule Engine
Define custom `FORBIDDEN` dependency rules (e.g., `utils → services` is FORBIDDEN). Violations are flagged as issues and persist across sessions.

### 📅 History & Snapshots
Every analysis is saved automatically. Click **HISTORY** in the right panel to compare health scores over time with a D3 sparkline and range slider.

### 🚫 Custom Ignore Patterns
`⋯ → 🚫 Ignore Patterns` — add directory exclusions (e.g., `generated/`, `__mocks__/`). Persists across sessions. Built-in defaults (`node_modules`, `dist`, `.git`) cannot be removed.

### 📤 Export Reports
JSON, Markdown, Plain Text, SVG, SARIF 2.1.0. Full schema in [docs/api-schema.md](docs/api-schema.md).

### 🤖 AI Coding Tool Support
Grasp works via MCP with all major AI coding tools: **Claude Code, Cursor, Cline, Roo Code, Kilo Code, OpenCode, Trae, Grok CLI, Codex CLI, Droid**

See [`ai-tools/`](./ai-tools/) for per-tool setup guides.

### 🔖 Health Badge

```markdown
![Grasp Health](https://grasp.ashforde.org/badge/owner/repo.svg)
```

### @grasp-bot in PRs
Comment `@grasp-bot analyze` on any PR — Grasp posts a full health report inline.

---

## VS Code Extension

> **Install:** Download `grasp-vscode-3.17.1.vsix` from [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest), then in VS Code run **Extensions: Install from VSIX…** (`Cmd+Shift+P`).

- Auto-analyses workspace on startup, re-analyses on file save (2s debounce)
- Status bar shows `↑ N deps  ↓ M dependents` for the active file
- Pans to the active file on every editor switch
- Surfaces security issues and arch violations in the **Problems panel** (squiggly lines)
- 4 color mode buttons in the panel header: Layer / Folder / Churn / Complexity
- Health score badge in the panel header
- Double-click any node to open the file in the editor
- Right-click any file → **Grasp: Analyze File** for instant details
- Directed links: blue = outgoing imports, green = incoming dependents
- Rich tooltips: complexity, churn count, top contributor per file

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

## 19 Themes

Full theme system with hover picker and click-to-cycle:

**Dark** · **Light** · **Matrix** · **Amber Terminal** · **Dracula** · **Nord** · **Tokyo Night** · **Catppuccin** · **Gruvbox** · **Obsidian Gold** · **Midnight Diamond** · **Carbon** · **Noir** · **Synthwave** · **Ocean Depth** · **Forest** · **Sunset** · **High Contrast** · **Solarized Light**

Theme choice persists across sessions and is shared between Grasp and Team Dashboard.

---

## Supported Languages

JavaScript · TypeScript · Python · Go · Java · Rust · C · C++ · C# · Ruby · PHP · Swift · Kotlin · Scala · Vue · Svelte · Dart · Elixir · Erlang · Haskell · Lua · R · Julia · Perl · Shell · PowerShell · F# · OCaml · Clojure · Elm · VBA · Groovy · Ada · Zig

---

## GitHub API Rate Limits

| Auth | Requests/hour |
|------|--------------|
| No token | 60 |
| Personal Access Token | 5,000 |
| GitHub App | 5,000 per installation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Analysis Engine  (mcp/src/)                    │
│                                                                         │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐   │
│  │  AST Parser          │   │  Analyzer + Pipeline                 │   │
│  │  tree-sitter WASM    │   │  · Dependency extraction             │   │
│  │  35 languages        │   │  · Cyclomatic complexity             │   │
│  │  native bindings     │   │  · Layer classification              │   │
│  └──────────────────────┘   │  · Security pattern detection        │   │
│                              │  · Dead code & duplicate analysis    │   │
│  ┌──────────────────────┐   │  · Scope resolver (3-tier, 0.95→0.50)│   │
│  │  Source Adapters     │   │  · Type propagator (Kahn topo-sort)  │   │
│  │  GitHub  · GitLab    │   │  · ORM tracker (Prisma/TypeORM/SA)   │   │
│  │  Azure   · Bitbucket │   └──────────────────────────────────────┘   │
│  │  Gitea   · Local FS  │                                               │
│  └──────────────────────┘   ┌──────────────────────────────────────┐   │
│                              │  Brain Store  (~/.grasp/brain.db)    │   │
│                              │  SQLite · repos / files / edges      │   │
│                              │  FTS5 full-text · 384D vectors       │   │
│                              │  Execution process tags (BFS)        │   │
│                              └──────────────────────────────────────┘   │
│                              ┌──────────────────────────────────────┐   │
│                              │  Graph Store  (~/.grasp/graph/)      │   │
│                              │  Kuzu  —  Schema v2                  │   │
│                              │  Nodes: File · Function · Class      │   │
│                              │         Interface · Method           │   │
│                              │         Constructor                  │   │
│                              │  Edges: CALLS(conf) · IMPORTS        │   │
│                              │         EXTENDS · IMPLEMENTS         │   │
│                              │         HAS_METHOD · OVERRIDES       │   │
│                              │         QUERIES · STEP_IN_PROCESS    │   │
│                              │  Read-only Cypher via graph_query    │   │
│                              └──────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐  ┌───────────────────────┐  ┌──────────────────────┐
│    Browser Apps     │  │   MCP Server + CLI    │  │   IDE Extensions     │
│                     │  │   (grasp-mcp-server)  │  │                      │
│  index.html         │  │                       │  │  VS Code             │
│  · React + D3       │  │  121 tools            │  │  JetBrains           │
│  · 10 graph views   │  │  8 MCP Resources      │  │  Zed                 │
│  · AI Chat (12 prov)│  │  2 guided Prompts     │  │  Neovim · Vim        │
│  · Confidence overlay│  │  Brain (SQLite+Kuzu)  │  │  Emacs               │
│  · Graph query modal│  │  Hybrid search        │  │  Eclipse · Continue  │
│  · Fn-level canvas  │  │  ORM map · Change risk│  │                      │
│  · DB coupling tab  │  │  Route/API map        │  │  Browser Extensions  │
│  · PII detection    │  │  @group fan-out       │  │  Chrome · Firefox    │
│  · 19 themes        │  │  Arch diff · Hooks    │  │  Safari              │
│                     │  │  grasp setup          │  │                      │
│  team-dashboard.html│  │  (Claude/Cursor/      │  │  Setup auto-config   │
│  · Multi-repo health│  │   Windsurf/Codex/     │  │  grasp setup [path]  │
│  · DORA + sparklines│  │   OpenCode)           │  │  writes mcp.json +   │
│  · Patterns/Env/Flags│  │  --watch --timeline  │  │  hooks for all       │
│  · Registry panel   │  │  --format=sarif       │  │  detected editors    │
│  · WebSocket rooms  │  │  --pr-comment         │  │                      │
└─────────────────────┘  └───────────────────────┘  └──────────────────────┘
           │                         │                         │
           └─────────────────────────┴─────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                           Integrations                                  │
│                                                                         │
│  CI/CD             Bots & Alerts       AI Coding Tools   Project Mgmt  │
│  GitHub Action     Slack Bot           Claude Code       Jira          │
│  GitLab CI         Discord Bot         Cursor            Linear        │
│  Bitbucket Pipe    Teams Bot           Windsurf · Codex  Raycast       │
│  CircleCI Orb      @grasp-bot          Copilot Extension               │
│  Jenkins Plugin                        Amazon Q · Cline                │
│                                        GPT Actions · Roo               │
│                                                                         │
│  SaaS / Cloud: grasp.dev API · badge service · GitHub OAuth           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Browser app:** zero dependencies to install. React 18, D3.js 7, Babel from CDNs. Tree-sitter WASM grammars load lazily and cache in IndexedDB.

**MCP server:** Node.js 18+. Native tree-sitter bindings for AST-backed function extraction and cyclomatic complexity across 16 languages: Python, Go, Java, Kotlin, Rust, C, C++, C#, Ruby, JavaScript, TypeScript, TSX, Swift, PHP, Scala, Zig.

**Brain store:** two persistent stores — SQLite at `~/.grasp/brain.db` (file metadata, coupling, security) and Kuzu graph DB at `~/.grasp/graph/` (function call graph, imports, return-type edges — queryable via Cypher).

**IDE extensions:** VS Code (`vscode-extension/`), JetBrains (`jetbrains-plugin/`), Zed, Neovim, Vim, Emacs, Eclipse, Continue — all backed by the same MCP server.

**Browser extensions:** Chrome, Firefox, and Safari (`browser-extension/`, `safari-extension/`) — MV3, inject a floating Grasp button on GitHub and GitLab pages.

---

## Version & Auto-Update

Both `index.html` and `team-dashboard.html` display the current version (`v3.17.1`) in the footer. On load, they silently check the npm registry for a newer release. If found, a dismissible toast appears:

- **Update Now** — fetches the new HTML from GitHub, downloads it, and applies it immediately
- **Later** — snoozes for 24 hours

No server, no background process.

---

## Privacy & Security

**Your code stays on your machine.**

**Browser app:**
- Runs 100% in the browser — no server, no proxy
- GitHub/GitLab API calls go directly from your browser to the provider
- Your token lives in `localStorage` only — never sent anywhere except the chosen Git provider
- No analytics, no tracking, no accounts
- The entire app is [one open-source HTML file](index.html) — audit it yourself

**MCP server:**
- Runs locally as a subprocess — no outbound connections except the GitHub/GitLab API
- No telemetry, no data collection
- Local directory analysis is read and discarded in memory; Brain store stays on your machine at `~/.grasp/brain.db`

**Supply chain:**
- Every npm release is signed with [SLSA provenance](https://slsa.dev) (Level 2) via GitHub Actions OIDC
- Every Docker image (`ghcr.io/ashfordeou/grasp`) is signed with Cosign keyless signatures, recorded in the [Sigstore Rekor](https://rekor.sigstore.dev) public ledger

Verify before installing:

```bash
# npm package
npm install -g @sigstore/verify  # one-time
sigstore verify npm grasp-mcp-server@3.17.1

# Docker image
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/ashfordeou/grasp:v3.17.1
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code structure, and PR checklist.

**Found a bug?** [Open an issue](https://github.com/ashfordeOU/grasp/issues)

**Adding a language?** Tree-sitter grammar sources are in `mcp/src/extractors/` — follow the existing pattern for a new language file.

**Adding an MCP tool?** Register in `mcp/src/index.ts` following the existing `server.registerTool` pattern. Add tests in `mcp/tests/`.

---

## License

**Elastic License 2.0** — Copyright (c) 2026 Ashforde OÜ.

Free to use, modify, and self-host. You may not offer Grasp as a hosted or managed service, strip copyright notices, or redistribute it under a different brand. See [LICENSE](LICENSE) for full terms.

---

<div align="center">

**121 MCP tools · 35 languages · 12 AI providers · zero install · zero data collection**

*Dependency graphs, security scanner, DORA metrics, and Grasp Brain — everywhere you write code.*

</div>
