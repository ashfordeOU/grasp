# Grasp Architecture

## Overview

Grasp is a multi-surface architecture intelligence platform. The same analysis pipeline powers a single-file browser app (`index.html`), a Node.js MCP server (`grasp-mcp-server`), a CLI, eight IDE extensions (VS Code, JetBrains, Zed, Neovim, Vim, Emacs, Eclipse, Continue), three browser extensions (Chrome, Firefox, Safari), and a set of CI/bot integrations. Each surface reuses a shared `~/.grasp/brain.db` (SQLite) plus `~/.grasp/graph/` (Kuzu) so a CLI `grasp index` and a browser analyse of the same repo are interchangeable.

The browser app is the simplest surface: two HTML files (`index.html`, `team-dashboard.html`) with no build step. All code runs client-side via CDN-loaded libraries.

```
Browser
  │
  ├── React 18 (CDN)     — UI rendering, state management
  ├── D3.js 7 (CDN)      — Graph and chart visualizations
  └── Babel (CDN)        — JSX transpilation at runtime

index.html
  │
  ├── <style>            CSS custom properties, all component styles
  ├── <script type="text/babel">
  │     ├── CONFIGURATION  THRESHOLDS, COLORS, LAYER_COLORS, IGNORE
  │     ├── Parser          File detection, extraction, quality analysis
  │     ├── Parser sub-objects  FileDetector, CodeExtractor, etc.
  │     ├── GitHub          API client with rate limiting
  │     ├── Utility fns     calcBlast, calcHealth, findPath, etc.
  │     ├── Modal components PrivateKeyModal, FilePreviewModal, etc.
  │     ├── OSV.dev SCA scan  parser-driven manifest scan
  │     │                     (package.json + lockfile, requirements.txt,
  │     │                      pyproject.toml, go.mod, Cargo.toml + lockfile,
  │     │                      pom.xml) — direct fetch to api.osv.dev
  │     └── App             Main React component
  └── ReactDOM.createRoot(...)
```

---

## Data Flow

```
User Input (URL or local folder)
  │
  ▼
GitHub.fetchTree()            — or —    readDirectory()
  │                                        │
  ▼                                        ▼
Array<FileMetadata>          Array<FileMetadata>
  │
  ▼
processFiles() — concurrent fetch pool (20×/5×/2× based on rate limit)
  │
  ▼
For each file:
  ├── Parser.extract(content, path)       → functions[]
  ├── Parser.calcComplexity(content, path) → {score, level}
  ├── calcNestingDepth(content)            → number
  └── Parser.detectLayer(path)             → string

finishAnalysis():
  ├── Phase 1: findCalls (parallel, precompiled patterns)
  ├── Phase 2: Build connections graph
  ├── Phase 3: Detect dead functions
  ├── Phase 4: Quality analysis
  │     ├── Parser.detectPatterns(analyzed)
  │     ├── Parser.detectSecurity(analyzed)
  │     ├── Parser.detectDuplicates(analyzed, allFns)
  │     ├── Parser.detectLayerViolations(analyzed, conns)
  │     └── applyArchitectureRules(analyzed, conns, rules)
  └── Phase 5: Build data object → setData(data)
```

---

## Key Objects

### Parser (and sub-objects)

The monolithic `Parser` object handles all code analysis. Sub-objects provide named groupings:

- **FileDetector** — extension checks, layer detection
- **CodeExtractor** — function extraction (regex + tree-sitter WASM for Python)
- **DependencyAnalyzer** — call graph construction, pattern pre-compilation
- **PatternDetector** — design patterns, security vulnerabilities
- **QualityAnalyzer** — complexity, duplicates, layer violations, LCS similarity

### GitHub

Stateless API client. Manages:
- Rate limit tracking (`rateLimit.remaining`)
- Auth headers (PAT or GitHub App JWT)
- Paginated fetching (`fetchPaginated` follows `Link: rel="next"`)
- Concurrent file fetching (20×/5×/2× pool)

### App State

Key state variables in the `App` React component:

| Variable | Type | Purpose |
|----------|------|---------|
| `data` | Object | Full analysis result |
| `selected` | string | Selected file path |
| `blastRadius` | Object | Blast radius for selected file |
| `graphConfig` | Object | Viz type, view mode, layout options |
| `colorMode` | string | Active color scheme |
| `archRules` | Array | Architecture rules (from localStorage) |

---

## Connection Graph Format

Connections represent "file A exports a function called by file B":

```js
{
    source: "src/utils/helpers.js",  // file that defines the function
    target: "src/components/App.js", // file that calls the function
    fn: "formatDate",                // function name
    count: 3                         // number of calls
}
```

---

## Architecture Rule Engine

Rules are stored in `localStorage` under `grasp_arch_rules`. Format:

```json
[
  { "from": "config", "to": "ui", "type": "FORBIDDEN", "reason": "Config should not depend on UI" }
]
```

`from` and `to` match `Parser.detectLayer()` output values: `config`, `utils`, `data`, `services`, `modules`, `components`, `ui`, `test`.

---

## Performance Notes

- **LCS cap**: The LCS algorithm is capped at 1M DP cells (`THRESHOLDS.lcsMaxCells`) to prevent freezing
- **Regex pre-compilation**: `prepareCallPatterns()` compiles all RegExps once per analysis run
- **Concurrent fetching**: 20× parallel GitHub API calls when rate limit allows
- **Node clustering**: Force graph clusters folders when >500 nodes
- **LOD**: Labels and hull outlines are hidden at low zoom levels
- **D3 sim pause**: Force simulation stops when not on the graph view

---

## MCP Server (mcp/src/)

The MCP server (`grasp-mcp-server`) is a separate Node.js process that exposes Grasp's analysis engine as 130 MCP tools over stdio. The current version is v3.18.0 — added 9 new tools in `graph-analytics.ts` (split into `graph-hubs.ts`, `graph-bridges.ts`, `graph-surprising.ts`, `graph-knowledge-gaps.ts`, `graph-suggested-questions.ts`), `llm-context-tools.ts`, and `graph-exporters.ts`.

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `index.ts` | MCP server entry — registers all 130 tools, 8 Resources, 2 Prompts, HTTP server |
| `analyzer.ts` | Repo analysis pipeline — GitHub/GitLab fetch, AST parse, graph build |
| `pipeline.ts` | Phased orchestration around `analyzer.ts` — scan → parse → resolvers → routes → tools → orm → scope → types → coverage → communities → processes → analytics → vulns |
| `parser.js` | tree-sitter-backed AST extraction + OSV.dev SCA scan (npm/PyPI/Go/Cargo/Maven manifests) |
| `brain.ts` | SQLite brain store — file index, FTS5, vector embeddings, snapshots, `org_summary` |
| `graph.ts` | Kuzu graph DB — schema v3, Cypher queries, test coverage edges |
| `graph-test-edges.ts` | Test coverage edge builder — detects test files, TESTS/COVERS edges |
| `graph-hubs.ts` | Degree centrality — top-N most connected files (fan-in + fan-out) |
| `graph-bridges.ts` | Brandes betweenness centrality — files on the critical path between others |
| `graph-surprising.ts` | Frequency-weighted rarity scorer for cross-layer edges |
| `graph-knowledge-gaps.ts` | Isolated files, untested hotspots, weak communities |
| `graph-suggested-questions.ts` | Auto-generated review questions composing hubs + bridges + cycles + duplicates |
| `graph-exporters.ts` | yEd/Gephi GraphML, Neo4j Cypher CREATE statements, Obsidian Canvas `.canvas` JSON |
| `tsconfig-resolver.ts` | TS-config path-alias resolution (`@/components` → `src/components`) |
| `python-resolver.ts` | Jedi-style Python relative imports + `__init__.py` resolution |
| `llm-context-tools.ts` | `grasp_minimal_context`, `grasp_traverse`, `grasp_semantic_search`, `grasp_apply_refactor`, `grasp_architecture_overview` |
| `cli.ts` | CLI entry — `index`, `context`, `setup`, `diff`, `daemon`, `drift`, `org`, `vulns` |

### Kuzu Graph Schema v3

```
Node tables:  File, Function, Class, Interface, Method, Constructor, TestFile
Rel tables:   IMPORTS (File→File), CALLS (Function→Function),
              EXTENDS (Class→Class), IMPLEMENTS (Class→Interface),
              HAS_METHOD (Class→Method), HAS_CONSTRUCTOR (Class→Constructor),
              OVERRIDES (Method→Method), MEMBER_OF (Function→Class),
              STEP_IN_PROCESS (Function→Function), QUERIES (Function→File),
              TESTS (TestFile→File), COVERS (TestFile→Function)
```

### BrainStore Snapshots Table

Architecture snapshots persist graph state for drift detection:

```sql
CREATE TABLE snapshots (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  repo_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data      TEXT NOT NULL   -- JSON: SnapshotData
)
```

`SnapshotData` includes: `healthScore`, `nodeCountByType`, `edgeCountByType`, `circularDepCount`, `avgDepDepth`, `topCoupledFiles[10]`.
