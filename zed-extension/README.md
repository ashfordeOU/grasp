# Grasp — Code Architecture · Zed Extension

> **130+ MCP tools** for dependency graphs, health scoring, security scanning, and architecture intelligence — integrated directly into Zed's AI assistant.

[![Extension](https://img.shields.io/badge/Zed-Extension-blue)](https://zed.dev/extensions)
[![npm](https://img.shields.io/npm/v/grasp-mcp-server)](https://www.npmjs.com/package/grasp-mcp-server)
[![Version](https://img.shields.io/badge/version-3.19.0-teal)](https://github.com/ashfordeOU/grasp/releases/tag/v3.19.0)

---

## What is Grasp?

Grasp is an open-source code architecture visualizer and analysis platform. Paste any GitHub or GitLab URL — or point it at a local directory — and get an interactive dependency graph, architecture health score, security scan, and a full suite of AI-ready analysis tools. **No data leaves your machine.**

This Zed extension wires Grasp's MCP server into Zed as a **context server**, giving Zed's AI assistant (and any MCP-compatible agent) instant architecture awareness of whatever codebase you're working in.

**Links:** [Browser App](https://ashfordeou.github.io/grasp) · [Main Repo](https://github.com/ashfordeOU/grasp) · [npm Package](https://www.npmjs.com/package/grasp-mcp-server) · [Team Dashboard](https://ashfordeou.github.io/grasp/team-dashboard.html)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Zed Editor                                                  │
│                                                              │
│  ┌──────────────┐    MCP Protocol    ┌───────────────────┐  │
│  │  AI Assistant│◄──────────────────►│  grasp-mcp-server │  │
│  │  (Claude,    │                    │  (Node.js, local) │  │
│  │   GPT, etc.) │                    └─────────┬─────────┘  │
│  └──────────────┘                              │            │
│                                                │ analyzes   │
│  ┌──────────────────────────────────────────┐  │            │
│  │  Your Codebase / GitHub / GitLab repo    │◄─┘            │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

1. **Extension installs** `grasp-mcp-server` from npm automatically — no manual setup needed.
2. **Zed starts** the server via `node node_modules/grasp-mcp-server/dist/index.js` when a project opens.
3. **The server** exposes 130+ tools and 8 MCP Resources over the MCP stdio transport.
4. **Zed's AI assistant** can call any tool to get architecture context, run analysis, or answer questions about the code.
5. **Results** are returned as structured JSON — never sent to a third party.

### Architecture Components

| Component | Description |
|-----------|-------------|
| **WASM Extension** | Thin Rust shim compiled to `wasm32-wasip1`. Manages npm package lifecycle and spawns the server process. |
| **grasp-mcp-server** | Node.js MCP server. The actual analysis engine — parses files, builds graphs, runs scans. |
| **Grasp Brain** | Optional persistent SQLite store at `~/.grasp/brain.db` + Kuzu graph DB at `~/.grasp/graph/`. Index once, query instantly across sessions. |
| **MCP Resources** | 8 live data URIs (`grasp://repos`, `grasp://repo/{id}/context`, etc.) providing structured architecture state. |
| **MCP Prompts** | 2 guided multi-step workflows: `detect_impact` and `generate_map`. |

---

## Installation

### From the Zed Extension Marketplace

1. Open Zed → `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P` (Linux)
2. Run **Extensions: Install Extension**
3. Search **Grasp Code Architecture** → click **Install**

The extension automatically installs and updates `grasp-mcp-server` from npm. No manual steps required.

### As a Dev Extension (Manual)

```bash
git clone https://github.com/ashfordeOU/grasp.git
```

In Zed: Command Palette → **Extensions: Install Dev Extension** → select the `zed-extension/` directory.

---

## Using Grasp in Zed

Once installed, Zed's AI assistant has access to all Grasp tools. Example prompts:

```
"What are the most complex files in this repo?"
"Show me circular dependencies in the auth module."
"Which files would break if I change utils/parser.ts?"
"Generate an architecture overview of this codebase."
"Are there any hardcoded secrets or SQL injection risks?"
"What's the blast radius of this PR?"
"Create an ADR for moving from REST to GraphQL."
```

Grasp answers using static analysis — no AI key needed for most tools. For `grasp_adr` and `grasp_explain`, your configured AI provider is used.

---

## Tools (130+)

### Analysis & Health
| Tool | Description |
|------|-------------|
| `grasp_analyze` | Full codebase analysis — dependency graph, health score (0–100 / A–F), issues, security, patterns |
| `grasp_hotspots` | Files with highest coupling, complexity, and churn — the most dangerous files to touch |
| `grasp_cycles` | All circular dependency chains with severity ranking |
| `grasp_patterns` | Detected design patterns (Singleton, Factory, Observer, etc.) and anti-patterns |
| `grasp_suggest` | Refactoring suggestions ranked by effort-to-impact ratio |
| `grasp_metrics` | Cyclomatic complexity, fan-in/out, LOC, churn per file |
| `grasp_security` | Hardcoded secrets, SQL injection, dangerous `eval()`, debug leaks |
| `grasp_vulnerabilities` | OSV.dev SCA scan — declared dependencies (npm/PyPI/Go/Cargo/Maven) vs public CVE database |
| `grasp_architecture` | Layer-by-layer architecture view (UI → Services → Data → Config) with violation detection |
| `grasp_architecture_overview` | Combined executive summary: communities + hub nodes + review questions |

### Graph Intelligence
| Tool | Description |
|------|-------------|
| `graph_query` | Cypher queries against the persistent Kuzu graph DB |
| `call_chain` | Full transitive caller/callee tree from any function |
| `function_graph` | Function-level dependency graph for any file — Mermaid or JSON |
| `type_propagation` | Cross-file return type inference via topological propagation |
| `grasp_graph_schema` | Schema v3 introspection — node/edge tables with live row counts |
| `grasp_communities` | Leiden/Louvain community detection — bounded contexts and microservice split candidates |
| `grasp_hub_nodes` | Top-N most connected files by degree centrality |
| `grasp_bridge_nodes` | Brandes betweenness centrality — architectural chokepoints |
| `grasp_surprising_connections` | Rare cross-layer edges flagged by frequency-weighted rarity |
| `grasp_knowledge_gaps` | Isolated files, untested hotspots, weak communities |
| `grasp_confidence` | Score every cross-file connection 0–1 by resolution quality |

### Brain & Persistent Intelligence
| Tool | Description |
|------|-------------|
| `grasp_brain_index` | Index a repo to `~/.grasp/brain.db` — fast subsequent queries, no re-analysis |
| `grasp_brain_status` | List indexed repos: file counts, timestamps, health scores |
| `grasp_context` | Rich context for any file from the brain: layer, complexity, coupling, churn, dependents |
| `grasp_ask` | Natural language queries against the brain — no AI key needed |
| `grasp_minimal_context` | Sub-100-token repo orientation — the LLM's first call before deeper queries |
| `grasp_traverse` | Token-budget-aware BFS from a start node |
| `grasp_semantic_search` | Cosine-similarity over function signatures via 384D Xenova embeddings |
| `grasp_arch_diff` | Compare current codebase vs brain baseline — catch regressions before release |

### Impact & Blast Radius
| Tool | Description |
|------|-------------|
| `grasp_dep_impact` | Transitive blast radius for any file change |
| `grasp_change_risk` | Risk score 0–100 for a set of changed files |
| `grasp_detect_changes` | Git diff → affected symbols + process flows + risk level (LOW/MEDIUM/HIGH/CRITICAL) |
| `grasp_diff_symbols` | Map git diff hunks to exact functions changed, with blast radius per function |
| `grasp_patch_impact` | Impact of a patch before applying it |
| `grasp_find_path` | Shortest import chain between any two files |
| `grasp_contracts` | Multi-repo contract analysis — provider exports vs consumer imports |
| `grasp_api_diff` | API surface diff between two versions |
| `grasp_api_stability` | Track API surface changes over time |
| `grasp_semver` | Recommended semver bump based on API diff (patch/minor/major) |
| `grasp_abi_diff` | ABI compatibility check — detects breaking binary interface changes |

### Security & Safety
| Tool | Description |
|------|-------------|
| `grasp_safety_trace` | Safety constraint tracer — finds paths that bypass safety gates (DO-178C / ECSS) |
| `grasp_pii_trace` | PII data flow — traces personal data from source to sink |
| `grasp_sbom` | Software Bill of Materials — CycloneDX 1.4 or SPDX 2.3 |
| `grasp_sarif` | SARIF 2.1.0 export for GitHub Code Scanning integration |
| `grasp_duties` | 4-eyes / segregation of duties analysis |
| `grasp_reg_impact` | Regulatory change impact — maps regulation changes to affected code |
| `grasp_ecss` | ECSS-E-ST-40C / MISRA C/C++ heuristic checks for safety-critical software |
| `grasp_req_trace` | Requirement traceability matrix — covered/uncovered requirements |

### Export & Visualization
| Tool | Description |
|------|-------------|
| `grasp_export_dot` | DOT / Graphviz — renders in GitHub, VS Code, IntelliJ, CLI |
| `grasp_export_mermaid` | Mermaid flowchart — GitHub, GitLab, Notion, Confluence |
| `grasp_export_d` | D2 (Terrastruct) — renders to SVG/PNG via `d2` CLI |
| `grasp_export_plantuml` | PlantUML — Confluence, Jira, IntelliJ, VS Code |
| `grasp_export_dgml` | Visual Studio Directed Graph — opens natively in VS Architecture tab |
| `grasp_export_gexf` | GEXF — Gephi's native format with rich node/edge attributes |
| `grasp_export_graphml` | GraphML — yEd / Gephi compatible |
| `grasp_export_cypher` | Neo4j CREATE statements |
| `grasp_export_drawio` | draw.io / diagrams.net XML |
| `grasp_export_csv` | CSV bundle: files / connections / issues sheets |
| `grasp_diagram` | Mermaid flowchart or C4 context/container/component diagram |
| `grasp_embed` | iframe / React embed snippet for any public repo |

### Refactoring & Code Quality
| Tool | Description |
|------|-------------|
| `grasp_refactor` | Refactoring plan with effort estimates |
| `grasp_rename` | Graph-aware whole-word symbol rename — dry-run by default |
| `grasp_apply_refactor` | Execute rename ops, `dry_run=false` writes to disk |
| `grasp_unused` | Dead code — functions defined but never called |
| `grasp_dead_packages` | npm/PyPI packages installed but never imported |
| `grasp_stale` | Active but abandoned files — low churn, high fan-in, no tests |
| `grasp_similarity` | Clone detection — similar function pairs across files |
| `grasp_migration_plan` | Step-by-step migration plan for architectural changes |
| `grasp_types` | Type annotation coverage per file, prioritised by fan-in |
| `grasp_mro` | Method Resolution Order — C3 linearization (Python), Java/Ruby hierarchies |
| `grasp_resolve_receiver` | Resolve `self`/`this` to concrete class at every call site |
| `grasp_shape_check` | Parameter/return type mismatches across all call sites |

### Team & DevOps
| Tool | Description |
|------|-------------|
| `grasp_dora` | DORA metrics — Deployment Frequency, Lead Time, Change Failure Rate, MTTR |
| `grasp_contributors` | Top contributors per file and per module |
| `grasp_commits` | Commit velocity per file (7d / 30d) |
| `grasp_ci_status` | Latest CI run status from GitHub Actions or GitLab Pipelines |
| `grasp_org_summary` | Org-level health — up to 20 repos, grade distribution, security totals |
| `grasp_org_graph` | Multi-session org-level dependency graph |
| `grasp_pr_comment` | Post architecture insights as a GitHub PR comment |
| `grasp_pr_review` | Inline review comments at high-severity lines |
| `grasp_issues` | Open GitHub Issues mapped to source files |
| `grasp_good_first_issues` | Files suitable for new contributors (low complexity, well-tested) |
| `grasp_jira_issues` | Jira Cloud issues mapped to source files by filename stem |
| `grasp_diff` | Diff two analyses — score delta, resolved vs new issues |
| `grasp_fork_diff` | Compare fork against upstream |
| `grasp_timeline` | 30-commit scrubber — health score over time |
| `grasp_watch` | Poll repo for new commits — triggers re-analysis on change |
| `grasp_snapshot` | Save named architecture snapshot to brain.db |
| `grasp_diff_snapshots` | Compare two snapshots — drift level: STABLE / DEGRADED / CRITICAL |

### Documentation & Knowledge
| Tool | Description |
|------|-------------|
| `grasp_wiki` | Auto-generate markdown wiki: index + per-folder pages + api.md |
| `grasp_skillmd` | Generate SKILL.md / CLAUDE.md / AGENTS.md for AI agents |
| `grasp_hooks` | Generate Claude Code / Cursor hooks for automatic context injection |
| `grasp_generate_agents_md` | Rich AGENTS.md from brain session — communities, processes, health |
| `grasp_generate_skills` | Per-community Claude skill files |
| `grasp_onboard` | Ordered reading path for new engineers entering an area |
| `grasp_adr` | MADR-format Architecture Decision Record from codebase context |
| `grasp_explain` | Plain-English explanation of any file or module |
| `grasp_heritage` | Trace the origin and evolution of a file or function over git history |

### Dependency Scanning
| Tool | Description |
|------|-------------|
| `grasp_license` | Dependency license audit — permissive / copyleft / unknown |
| `grasp_deps_dev` | deps.dev integration — vulnerability and license metadata |
| `grasp_env_vars` | Env var reads cross-referenced against `.env.example` |
| `grasp_feature_flags` | Feature flag reads — LaunchDarkly, GrowthBook, OpenFeature, custom |
| `grasp_config_check` | Configuration file consistency across environments |

### Service & Runtime
| Tool | Description |
|------|-------------|
| `grasp_service_graph` | Distributed service dependency graph from OTEL/GraspTracer traces |
| `grasp_runtime_calls` | Merge runtime traces with static edges — actual hot call paths |
| `grasp_orm_map` | ORM query tracker — Prisma, TypeORM, Sequelize, SQLAlchemy |
| `grasp_route_map` | HTTP route definitions — Express/FastAPI/Flask/Gin mapped to handlers |
| `grasp_api_impact` | Blast radius for a route or handler change |
| `grasp_tool_map` | MCP tool definitions and gRPC service contracts |
| `grasp_db_coupling` | Files with high database coupling — query hotspots |
| `grasp_perf` | N+1 queries, sync I/O, JSON serialization inside loops |
| `grasp_latency` | Latency hotspot analysis from trace data |
| `grasp_events` | Event emitters/subscribers — orphaned and ghost events |
| `grasp_exec_flow` | BFS execution flow from any entry point — Mermaid flowchart |

### ML & AI Codebases
| Tool | Description |
|------|-------------|
| `grasp_eval_coverage` | Traces which model/training files are reached by eval scripts |
| `grasp_run_diff` | Training config diff — changed hyperparameters + affected code files |
| `grasp_model_risk` | ML model risk findings — data leakage, missing seeds, unsafe patterns |

### Embedded / Safety-Critical
| Tool | Description |
|------|-------------|
| `grasp_icd` | Interface Control Document extraction from headers and specs |
| `grasp_irq` | Interrupt handler graph — ISR chains and latency paths |
| `grasp_kconfig` | Kconfig symbol usage — kernel/firmware config dependency map |
| `grasp_subsystems` | Subsystem map — RTOS task boundaries and shared resource access |

### Groups & Registry
| Tool | Description |
|------|-------------|
| `grasp_group_add` | Add a repo to a named group — fan out any tool across all members |
| `grasp_group_list` | List named groups from `~/.grasp/groups.json` |
| `grasp_registry_list` | All brain-indexed repos with health grade and file counts |
| `grasp_registry_status` | Grade distribution across all indexed repos |
| `grasp_sessions` | Active analysis sessions and their metadata |

### MCP Resources (8)

Live data URIs readable by any MCP client:

| Resource | Description |
|----------|-------------|
| `grasp://repos` | All indexed repos |
| `grasp://setup` | Auto-configuration guide |
| `grasp://repo/{id}/context` | Full context for a repo |
| `grasp://repo/{id}/clusters` | Community clusters |
| `grasp://repo/{id}/processes` | Execution processes |
| `grasp://repo/{id}/schema` | Graph schema |
| `grasp://repo/{id}/cluster/{name}` | Single cluster detail |
| `grasp://repo/{id}/process/{name}` | Single process detail |

### MCP Prompts (2)

Guided multi-step workflows:

- **`detect_impact`** — detect changes → affected symbols → process traces → risk assessment → test scope
- **`generate_map`** — list repos → analyze → architecture diagram → communities → wiki

---

## Configuration

The context server starts automatically. No configuration is required for basic use.

To set a GitHub token (for private repos or to raise rate limits to 5,000 req/hr), add to your Zed `settings.json`:

```json
{
  "context_servers": {
    "grasp-code-architecture": {
      "settings": {}
    }
  }
}
```

Environment variables passed to the server (set in your shell profile):

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT — enables private repos and 5,000 req/hr |
| `GITLAB_TOKEN` | GitLab personal access token (`glpat-…`) |
| `GITLAB_HOST` | GitLab self-hosted base URL (e.g. `https://gitlab.corp.com`) |
| `GRASP_DISABLE_EMBEDDINGS=1` | Disable vector embeddings (faster startup, disables semantic search) |
| `GRASP_EMBED_INIT_TIMEOUT_MS` | Override 15s embedding init timeout |

---

## Building from Source

Requires Rust with the `wasm32-wasip1` target:

```bash
rustup target add wasm32-wasip1
cd zed-extension
cargo build --target wasm32-wasip1 --release
```

To load as a dev extension in Zed: Command Palette → **Extensions: Install Dev Extension** → select this directory.

---

## Privacy

- All analysis runs locally — no data sent to any Grasp server.
- GitHub/GitLab API calls go directly from the MCP server to `api.github.com` / your GitLab instance.
- Tokens are stored in your shell environment and never transmitted to third parties.

---

## License

Elastic License 2.0 — see [LICENSE](LICENSE).

The underlying `grasp-mcp-server` npm package is also distributed under the Elastic License 2.0.
