# Grasp MCP Server

Expose Grasp's codebase analysis engine as MCP tools for Claude Code and other LLM agents.

Supports GitHub repositories and local directories. Analyzes dependency graphs, architecture layers, circular deps, security issues, design patterns, dead code, code metrics, git history, duplicate detection, cross-repo comparison, monorepo workspaces, runtime call graphs, database schema coupling, API surface maps, and migration planning.

![Grasp dependency graph](https://raw.githubusercontent.com/ashfordeOU/grasp/main/docs/screenshots/graph.png)
*Force-directed dependency graph — the same data the MCP server exposes via `grasp_analyze`, `grasp_dependents`, `graph_query`, etc.*

## Table of Contents

- [Setup](#setup)
- [Configure in Claude Code](#configure-in-claude-code)
- [Tools](#tools)
- [Example Usage](#example-usage)
- [GitHub Token](#github-token)
- [GitLab Support](#gitlab-support)
- [CLI](#cli)
- [JetBrains Plugin](#jetbrains-plugin)
- [Claude Code Slash Commands](#claude-code-slash-commands)
- [Privacy](#privacy)

---

**Current version: 3.18.0** — 130 tools + 8 MCP Resources + 2 guided Prompts.

**v3.18.0 added:** 10 new MCP tools (`grasp_hub_nodes`, `grasp_bridge_nodes`, `grasp_surprising_connections`, `grasp_knowledge_gaps`, `grasp_suggested_questions`, `grasp_minimal_context`, `grasp_traverse`, `grasp_semantic_search`, `grasp_apply_refactor`, `grasp_architecture_overview`); 3 graph export formats (`grasp_export_graphml`, `grasp_export_cypher`, `grasp_export_obsidian`); TS-config path-alias and Jedi-style Python import resolvers; Claude Code slash commands; token-reduction eval harness (`scripts/eval-token-reduction.mjs`); localized READMEs (Hindi/Japanese/Korean/Simplified Chinese).

**Recent additions** *(see [CHANGELOG.md](../CHANGELOG.md) for full history)*:

- **v3.17.1** — per-directory lockfile scoping in the OSV scanner; test-fixture manifests skipped; CWS-token rotation script.
- **v3.17.0** — OSV.dev SCA scanner (`grasp_vulnerabilities` + `grasp vulns` CLI); architecture drift detection (`grasp_snapshot` + `grasp_diff_snapshots` + `grasp drift` CLI); org-level dashboard (`grasp_org_summary` + `grasp org` CLI); test-coverage gap map; graph schema v3 (TestFile nodes, TESTS/COVERS edges).
- **v3.16.0** — PR Impact GitHub Action; Brain context tools (`grasp_diff_symbols`, `grasp_exec_flow`, `grasp_skillmd`, `grasp_hooks`, `grasp_mro`, `grasp_communities`, `grasp_contracts`); confidence scoring; wiki generator; registry tools.
- **v3.15.0** — Kuzu graph schema v2; cross-file type propagation; ORM tracker; `grasp_detect_changes`; 8 MCP Resources; 2 MCP Prompts; `grasp setup` one-command editor auto-config.

**Verticals shipped before v3.15:** aerospace/safety-critical (requirement traceability, MISRA, DO-178C, ECSS-E-ST-40C, Ada/SPARK), AI research (safety-constraint tracing, eval coverage, ML pipeline DAG, Jupyter notebooks), enterprise (SBOM CycloneDX/SPDX, DORA, AI-powered ADR, PII trace, separation of duties, finance latency / model risk), OS/kernel (subsystem boundaries, ABI stability, Kconfig, IRQ graph, patch series impact), open source (good-first-issues, fork divergence, OpenSSF scorecard, deps.dev), and a hosted SaaS API (`saas/`).

## Verify Provenance

Every release is signed. Verify before installing:

**npm package (SLSA provenance):**
```bash
npm install -g @sigstore/verify  # one-time
sigstore verify npm grasp-mcp-server@3.18.0
```

**Docker image (Cosign keyless signature):**
```bash
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/ashfordeou/grasp:v3.18.0
```

Signatures are stored transparently in the [Sigstore Rekor](https://rekor.sigstore.dev) public ledger.

---

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
| `grasp_vulnerabilities` | OSV.dev SCA scanner — known CVEs in declared dependencies (npm/PyPI/Go/Cargo/Maven). Severity-classified (CVSS), fix-version suggestions, severity filter (`all`/`critical`/`high`/`medium`/`low`). Pairs with `grasp vulns <path>` CLI (exit 1 on critical/high) — *new in v3.17.0* |

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

### Aerospace / Safety-Critical

| Tool | Description |
|------|-------------|
| `grasp_req_trace` | Requirement traceability — scan `@REQ-NNN` tags in code against a requirements CSV; returns coverage %, covered, uncovered, and unspecified files |
| `grasp_anomaly` | Anomaly investigation — callers, callees, transitive blast radius (BFS 50 files), security in call chain, plain-English summary; for incident response |
| `grasp_reuse` | Software reuse assessor — Red/Amber/Green matrix across Interface Compatibility, Dependencies, Security, and Architecture Fitness |

### AI Research / AI Safety

| Tool | Description |
|------|-------------|
| `grasp_safety_trace` | Safety constraint tracer — mark safety gates, entry points, output points; returns all entry→output paths that bypass every gate (ungated paths = critical) |
| `grasp_run_diff` | Training run diff — compare two YAML/JSON configs, find changed hyperparameters and which code files read each changed key |
| `grasp_eval_coverage` | Eval coverage map — BFS trace from eval scripts through imports; shows covered %, lists uncovered files, flags safety gates with no eval coverage |

### Enterprise / Compliance

| Tool | Description |
|------|-------------|
| `grasp_sbom` | SBOM generation — CycloneDX 1.4 or SPDX 2.3 JSON. Parses package.json, requirements.txt, Cargo.toml, go.mod, pyproject.toml. Optional CVE enrichment. |
| `grasp_dora` | DORA metrics — Deployment Frequency, Lead Time for Changes, Change Failure Rate via GitHub Actions and PR history. Elite/High/Medium/Low tier. |
| `grasp_adr` | AI-powered ADR generation — MADR-format Architecture Decision Record using codebase context + optional PR diff. Supports any AI Chat provider. |

### Multi-Repo / Platform (v3.4.x)

| Tool | Description |
|------|-------------|
| `grasp_org_graph` | Org-level multi-repo dependency graph — merge N sessions into one org view with inter-repo edges and shared libs |
| `grasp_api_diff` | Breaking API change detector — compare exported symbols between two sessions, flag removed/changed signatures |
| `grasp_plugins` | Extension-point map — detect plugin interfaces, hook points, and strategy patterns across a codebase |
| `grasp_semver` | Semantic versioning enforcer — compare two sessions and validate semver bump is correct for the change set |

### Finance / Compliance (v3.5.x)

| Tool | Description |
|------|-------------|
| `grasp_pii_trace` | PII data flow tracer — BFS downstream traversal from user-marked PII source files; shows all consumers |
| `grasp_duties` | Separation of duties validator — detects files that both initiate and approve transactions (SOX/FDA compliance) |
| `grasp_reg_impact` | Regulatory change impact mapper — keywords-to-blast-radius for GDPR/HIPAA/SOX/PCI-DSS article changes |
| `grasp_latency` | Finance/trading latency hotspot detection — blocking I/O, GC pressure, lock contention, allocation in loops |
| `grasp_model_risk` | Financial model risk auditor — hardcoded parameters, missing NaN checks, division without zero-guard |

### OS / Kernel (v3.6.x)

| Tool | Description |
|------|-------------|
| `grasp_subsystems` | Kernel/OS subsystem boundary map — directory-level groupings, cross-subsystem dependency violations |
| `grasp_abi_diff` | ABI/API stability checker — compare exported symbols between sessions, stability score 0–100 |
| `grasp_kconfig` | Kconfig/build-time conditional analysis — CONFIG_* usage map, high-risk toggles affecting >50 files |
| `grasp_irq` | IRQ/interrupt dependency graph — dynamic allocation, blocking calls, and fan-out in interrupt handlers |
| `grasp_patch_impact` | Patch series impact analyzer — rank patches by blast radius + complexity for kernel code review |

### Open Source (v3.7.x)

| Tool | Description |
|------|-------------|
| `grasp_good_first_issues` | Good first issue generator — isolated, low-complexity, untested files with GitHub issue draft text |
| `grasp_api_stability` | API stability score (0–100) between two sessions — tracks breaking change rate for library authors |
| `grasp_dependents` | Dependents in the wild — query deps.dev for public package dependent count |
| `grasp_fork_diff` | Fork divergence analysis — diverged/identical/fork-only files and merge blast radius |

### Ada / Heritage (v3.8.x)

| Tool | Description |
|------|-------------|
| `grasp_multilang` | Cross-language call graph — Ada→C pragma Import, Python ctypes/cffi, JS→WASM boundaries |
| `grasp_heritage` | Heritage software genealogy — overlay origin-mission manifest, identify zero-delta certification shortcuts |
| `grasp_icd` | ICD mapper — match Interface Control Document entries to exported functions, flag unimplemented interfaces |
| `grasp_ecss` | ECSS-E-ST-40C compliance checker — DI-01 headers, DI-04 docs, DI-07 tests, DI-10 no cycles, DI-15 no dead code |

### Graph Tools (New in v3.11.0)

| Tool | Description |
|---|---|
| `graph_query` | Run read-only Cypher queries against the Grasp function-level call graph |
| `call_chain` | Traverse callers/callees N hops from a named function |
| `type_propagation` | Find all functions returning a given type and their call neighbors |
| `function_graph` | Render a function subgraph as Mermaid, DOT, or JSON |

**Requires `grasp_brain_index` to be run first.**

Example: find all functions that eventually call anything returning `AuthToken`:
```cypher
MATCH (f:Function)-[:CALLS*1..3]->(g:Function)
WHERE g.returnType CONTAINS 'AuthToken'
RETURN f.name, g.name, g.returnType
```

### Brain & Persistent Intelligence (v3.10+)

| Tool | Description |
|---|---|
| `grasp_brain_index` | Index a repo into the persistent SQLite brain store (`~/.grasp/brain.db`) — files, functions, edges, health, security, layer. Also builds FTS index, 384D vector embeddings, and execution-flow process tags |
| `grasp_brain_status` | List all repos indexed in the brain: sources, file counts, indexed-at timestamps, health scores |
| `grasp_context` | Rich context for any file from the brain: layer, complexity, coupling, churn, grade, up to 20 deps/dependents, security issues — instant, no re-analysis |
| `grasp_arch_diff` | Compare current codebase against brain baseline: grade regressions, health delta, new security issues since last index |
| `grasp_ask` | Natural language questions against the brain store — no AI key needed. Recognises intents: complexity · coupling · security · blast-radius · layer · grade · churn · cycles. Falls back to hybrid semantic search (BM25 + vector) |
| `grasp_diff_symbols` | Map git diff hunks → functions; returns blast radius and complexity for every function touched by a PR |
| `grasp_exec_flow` | BFS execution flow from any entry point — traces call paths with STEP_IN_PROCESS edges, outputs Mermaid flowchart |
| `grasp_skillmd` | Auto-generate a SKILL.md / CLAUDE.md snippet for AI agents — layers, key files, health grade, patterns, and security findings |
| `grasp_hooks` | Generate `.claude/settings.json` PostToolUse hook and `.cursor/rules/grasp.mdc` for automatic context injection on every file edit |
| `grasp_mro` | Method Resolution Order — C3 linearisation for Python multiple inheritance, MRO for Ruby and Java hierarchies |
| `grasp_communities` | Leiden/Louvain community detection on the Kuzu graph — cohesive clusters, bounded contexts, microservice split candidates |
| `grasp_contracts` | Multi-repo contract analysis — provider exports vs consumer imports across repos, violations and coverage % |
| `grasp_confidence` | Score every cross-file connection 0–1: explicit import = 1.0 · same folder = 0.8 · cross-folder = 0.6 · low-frequency = 0.4 |
| `grasp_wiki` | Auto-generate a markdown wiki: index.md overview, one page per folder, api.md sorted by caller count |
| `grasp_registry_list` | List all repos in the Grasp Brain registry with health grade, file count, function count, active session IDs |
| `grasp_registry_status` | Registry health summary: total indexed repos, active session count, grade distribution (A/B/C/D/F) |
| `grasp_resolve_receiver` | Resolve the concrete class for every method call — Python, JavaScript, Java, Ruby self/this inference |
| `grasp_service_graph` | Build a service dependency graph from OpenTelemetry traces — nodes are services, edges are call paths with latency and error rate |
| `grasp_jira_issues` | Fetch Jira issues for the repo and map them to files — identify which files have the most open bugs |
| `grasp_deps_dev` | Query deps.dev for public dependent count, OpenSSF scorecard, and dependency health for any npm/PyPI/Go package |

### Semantic Search & Rename (v3.14+)

| Tool | Description |
|---|---|
| `grasp_search` | Hybrid semantic search (BM25 FTS5 + 384D vector embeddings merged with Reciprocal Rank Fusion) against the brain index. Results include `processes[]` field grouping matches by execution flow. Supports `@groupName` fan-out |
| `grasp_rename` | Graph-aware whole-word symbol rename across all files in the brain index. `apply: false` (default) returns a dry-run diff; `apply: true` writes changes to disk |
| `grasp_route_map` | Scan for HTTP route definitions (Express/Fastify/Hono, FastAPI/Flask, Gin) — maps each route to its handler function with file location |
| `grasp_api_impact` | Given a route or handler name, returns all callers, downstream services, and blast radius using brain graph edges |
| `grasp_tool_map` | Scan for MCP tool definitions (`server.tool` / `server.registerTool`) and gRPC service definitions — returns a service contract map |
| `grasp_shape_check` | For any function, traces parameter types and return types across all call sites from the brain index; flags call-site mismatches |
| `grasp_group_add` | Add a repo source to a named group in `~/.grasp/groups.json` for multi-repo fan-out |
| `grasp_group_list` | List all named groups and their member repos from `~/.grasp/groups.json` |

### Graph Intelligence (v3.15.0)

| Tool | Description |
|---|---|
| `grasp_graph_schema` | Kuzu schema v3 introspection — all node/edge table definitions (File, Function, Class, Interface, Method, Constructor, TestFile + 12 edge types including TESTS and COVERS) with live row counts per table |
| `grasp_type_propagation` | Cross-file type inference via topological propagation — follows import graph (Kahn's algorithm) to infer return types at every call site; returns top 20 inferred types with confidence 0–1 |
| `grasp_orm_map` | ORM query tracker — detects Prisma, TypeORM, Sequelize, SQLAlchemy patterns; results grouped by model with call sites, operations, and frequency; filter by `orm_filter` param |
| `grasp_detect_changes` | Git diff → symbol impact map. `scope`: `unstaged` · `staged` · `all` · `compare` (with `base_ref`). Returns changed files, affected functions with line ranges, impacted process flows, and risk level: `LOW` · `MEDIUM` · `HIGH` · `CRITICAL` |
| `grasp_generate_agents_md` | Generate a rich AGENTS.md in the repo root from brain session data — top 5 functional communities with key files, top 3 execution processes with entry points, health grade, top issues |
| `grasp_generate_skills` | Per-community skill files — writes `.claude/skills/generated/<community>.md` for each detected functional cluster; each skill includes key files, entry points, cross-area dependencies, and common operations |

### v3.18.0 — Graph Analytics & LLM Context

| Tool | Description |
|---|---|
| `grasp_hub_nodes` | Top-N most connected files by fan-in + fan-out (degree centrality). Identifies architectural hubs |
| `grasp_bridge_nodes` | Brandes betweenness centrality. Files that sit on the critical path between others. Auto-samples 100 sources for repos > 500 nodes |
| `grasp_surprising_connections` | Rare cross-layer edges, flagged by frequency-weighted rarity. Likely architecture violations |
| `grasp_knowledge_gaps` | Isolated files (no edges, not test/fixture), untested high-call-count hotspots, weak communities (small layers with high outgoing coupling) |
| `grasp_suggested_questions` | Auto-generates 5–10 review questions composing hubs + bridges + circular deps + duplicates + layer violations |
| `grasp_minimal_context` | Sub-100-token repo orientation. The LLM's first call before deeper queries. Returns top hubs, layer breakdown, language list, health summary |
| `grasp_traverse` | Token-budget-aware BFS from a start node. Walks file/function graph until budget or depth exhausts. Returns truncated view with remaining-budget |
| `grasp_semantic_search` | Cosine-similarity over function signatures via `@xenova/transformers` (Xenova/all-MiniLM-L6-v2). 15s embedder-load timeout race with substring keyword fallback. Capped at 2,000 sigs |
| `grasp_apply_refactor` | Executes rename ops with `dry_run` preview default. `dry_run=false` writes files back to disk for local sources |
| `grasp_architecture_overview` | Combined community + hub + question report. Single executive summary for new contributors / reviewers |
| `grasp_export_graphml` | yEd / Gephi-compatible GraphML XML export of the dependency graph |
| `grasp_export_cypher` | Neo4j CREATE statements that reproduce the full graph for offline analysis |
| `grasp_export_obsidian` | `.canvas` JSON for Obsidian Canvas with per-layer column layout |

### MCP Resources (v3.15.0)

8 live data URIs consumable directly by MCP clients without tool calls:

| Resource URI | Description |
|---|---|
| `grasp://repos` | List all repos indexed in the brain store |
| `grasp://setup` | AGENTS.md-style context block for all indexed repos |
| `grasp://repo/{repoId}/context` | Codebase stats, health grade, staleness check |
| `grasp://repo/{repoId}/clusters` | All functional communities from Louvain detection |
| `grasp://repo/{repoId}/processes` | All execution processes traced from entry points |
| `grasp://repo/{repoId}/schema` | Kuzu node/edge counts + schema definition |
| `grasp://repo/{repoId}/cluster/{clusterName}` | Deep dive into one functional community |
| `grasp://repo/{repoId}/process/{processName}` | Step-by-step execution process trace |

### MCP Prompts (v3.15.0)

| Prompt | Args | Description |
|---|---|---|
| `detect_impact` | `source`, `scope?`, `base_ref?` | Guided multi-step workflow: detect changes → identify affected symbols → trace processes → assess risk → suggest test scope |
| `generate_map` | `source?`, `format?` | Guided multi-step workflow: list repos → run grasp_analyze → architecture diagram → list communities → generate wiki |

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

"Which requirements are not covered by any code? Upload our REQ-NNN CSV."
  → grasp_req_trace(session_id, requirements=[{id:"REQ-001",desc:"Input validation",level:"A"},...])

"Which file in our codebase is most suspicious for this anomaly? Trace callers and callees."
  → grasp_anomaly(session_id, suspect_file="src/sensor/parser.c")

"Can we safely reuse the auth module from project A in project B?"
  → grasp_reuse(session_id_candidate, session_id_target, module_path="src/auth")

"Which code paths reach an output without passing through a safety gate?"
  → grasp_safety_trace(session_id, gates=["src/filters/constitutional_ai.py","src/output/sanitizer.py"])

"What changed semantically between training run A and run B?"
  → grasp_run_diff(session_id, config_a="...", config_b="...", format="yaml")

"Which parts of the model code are NOT exercised by any eval script?"
  → grasp_eval_coverage(session_id, eval_patterns=["evals/","*_eval.py"])

"Generate a CycloneDX SBOM with CVE data for this repo."
  → grasp_sbom(session_id, format="cyclonedx", include_vulns=true)

"What are our DORA metrics — deployment frequency, lead time, failure rate?"
  → grasp_dora(session_id, token="ghp_...")

"How much technical debt do we have in developer-days?"
  → grasp_adr(session_id, focus_files=["src/auth.ts","src/router.ts"], llm_provider="anthropic", api_key="sk-ant-...")
```

## GitHub Token

For large repos (>100 files), pass a GitHub PAT to avoid rate limiting:

```
grasp_analyze("owner/repo", token="ghp_...")
```

Without a token: 60 req/hour. With a token: 5,000 req/hour.

## GitLab Support

Grasp works with gitlab.com and self-hosted GitLab instances.

### Token auth (quickest)

```bash
# Set env vars — works for all MCP tools
export GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
export GITLAB_HOST=gitlab.internal.company.com   # omit for gitlab.com
```

### Self-hosted Docker bot (automated MR comments)

```bash
cd deploy
cp .env.gitlab.example .env.gitlab
# Edit .env.gitlab with your GITLAB_HOST, GITLAB_TOKEN, WEBHOOK_SECRET
docker compose -f docker-compose.gitlab.yml --env-file .env.gitlab up -d
```

Then register a GitLab webhook pointing to `http://your-host:7332/webhook` with your `WEBHOOK_SECRET`.

### Tunnel agent (internal GitLab, no inbound ports needed)

```bash
docker run ghcr.io/ashfordeou/grasp-agent:latest \
  --token=<your-agent-token> \
  --gitlab-host=gitlab.internal.company.com
```

## CLI

Grasp ships a `grasp` CLI alongside the MCP server:

```bash
# Analyze a local directory
npx grasp analyze ./my-project

# Export analysis as SARIF (for GitHub Code Scanning)
npx grasp analyze ./my-project --format=sarif --output=grasp.sarif

# Scan declared dependencies for known CVEs (OSV.dev)
# Exits 1 if any critical or high vulnerability — drop into CI as a quality gate
grasp vulns ./my-project

# Detect architecture drift vs the last snapshot — exits 1 on CRITICAL drift
grasp drift ./my-project

# Generate a multi-repo org dashboard (HTML / JSON / Markdown)
grasp org my-github-org --format=html --max=20

# One-command MCP auto-config for Claude Code, Cursor, Windsurf, Codex, OpenCode
grasp setup
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

## Claude Code Slash Commands

Three pre-built slash commands ship under `.claude/commands/` so any Claude Code workspace can invoke Grasp's most common flows in one step:

| Command | What it does |
|---------|-------------|
| `/grasp:build-graph` | Runs `grasp_analyze` on the current dir + `grasp_minimal_context` for a sub-100-token orientation |
| `/grasp:review-delta` | Detects changes since the base branch and produces a risk-scored impact report |
| `/grasp:review-pr` | Full PR review composing `grasp_detect_changes` + `grasp_suggested_questions` + `grasp_surprising_connections` + `grasp_knowledge_gaps` |

Each command is a markdown file (`.claude/commands/grasp-*.md`) with allowed-tools and a template body — edit them in-repo to customize.

## Workflow Tip

Always call `grasp_analyze` first — it returns a `session_id` that all other tools require. Sessions are held in memory and expire when the MCP server restarts.

In-app help: when running the browser app, press `?` to open a floating popover listing every shortcut, tab, and overlay. The Team Dashboard (`team-dashboard.html`) ships its own help modal.

## Privacy

Grasp does not collect any data. The MCP server runs as a local subprocess; the only outbound calls are to the GitHub/GitLab API, OSV.dev for CVE lookups, and (optionally) the AI provider you configure. Your code never passes through an Ashforde server. Full privacy policy: [PRIVACY.md](../PRIVACY.md).
