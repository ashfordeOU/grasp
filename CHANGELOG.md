# Changelog

All notable changes to Grasp are documented here.

---

## [3.13.0] — 2026-04-25

### Added
- `grasp_confidence` — confidence scoring (0–1) on all cross-file connections (explicit import=1.0, same folder=0.8, cross-folder count≥3=0.6, low-freq=0.4)
- `grasp_wiki` — auto-generated markdown wiki (index + per-folder + API reference pages)
- `grasp_registry_list` — list all Brain-indexed repos with health, file counts, active sessions
- `grasp_registry_status` — registry health: indexed count, session count, health distribution
- `grasp_resolve_receiver` — self/this receiver type inference across Python, JS, Java, Ruby
- **index.html**: confidence edge overlay + filter slider in force graph
- **index.html**: 🔍 graph query modal — search files, functions, edges in-browser
- **index.html**: ƒ() function-level canvas mode toggle
- **index.html**: 🗄️ DB coupling tab — ORM/SQL table references surfaced from file content
- **index.html**: 🎯 Good First Issues tab — isolated, low-complexity, untested files
- **index.html**: PII detection + security subcategory filter (ALL/SECRETS/INJECTION/PII/EVAL)
- **team-dashboard.html**: patterns, env vars, feature flag columns in repo table
- **team-dashboard.html**: DORA metrics mini-card per repo (expandable row)
- **team-dashboard.html**: 🗂️ Registry panel — all Brain-indexed repos with live status
- `/api/v1/registry` HTTP endpoint on MCP server (no session_id required)

---

## [3.12.0] — 2026-04-25

### Added
- `grasp_diff_symbols` — map git diff hunks to functions, compute blast radius
- `grasp_exec_flow` — trace execution flow from entry point with STEP_IN_PROCESS edges + Mermaid flowchart
- `grasp_skillmd` — auto-generate SKILL.md / CLAUDE.md snippet from analysis
- `grasp_hooks` — generate Claude Code `.claude/settings.json` + Cursor `.cursor/rules/grasp.mdc` hooks
- `grasp_mro` — C3 linearization (Python) and MRO for Ruby/Java class hierarchies
- `grasp_communities` — Leiden/Louvain community detection on file connection graph
- `grasp_contracts` — multi-repo contract analysis: provider exports vs consumer usage

---

## [3.11.0] — 2026-04-25

### Added
- **Graph Core** — persistent Kuzu graph database at `~/.grasp/graph/` populated automatically when running `grasp_brain_index`
- **`graph_query` MCP tool** — execute read-only Cypher queries against the function-level call graph
- **`call_chain` MCP tool** — traverse callers or callees N hops deep from any named function
- **`type_propagation` MCP tool** — find all functions that return a given type and their call neighbors
- **`function_graph` MCP tool** — render a subgraph around a function as Mermaid, DOT, or JSON
- **Return type extraction** — all 11 typed-language extractors (TypeScript, Python, Java, Go, Rust, C#, Kotlin, Swift, PHP, Scala, TSX) now emit `returnType` on function definitions
- **`SAME_RETURN_TYPE` edges** — functions sharing an identical return type string are connected in the graph, enabling type-centric traversal

---

## [3.10.0] — 2026-04-24

### Added
- **Grasp Brain** (`~/.grasp/brain.db`) — persistent SQLite index with repos, files, functions, and edges tables
- **`grasp_brain_index` MCP tool** — index any repo or local path into the brain
- **`grasp_brain_status` MCP tool** — list all indexed repos with health stats
- **`grasp_context` MCP tool** — health-aware file context (grade, complexity, blast radius, security) for agent hooks
- **`grasp_arch_diff` MCP tool** — compare current analysis against brain baseline, detect grade degradations
- **`grasp_ask` MCP tool** — natural language architecture Q&A over brain data (8 intent patterns)
- **`grasp index`** CLI subcommand — index a repo or path into the brain
- **`grasp context`** CLI subcommand — print file architectural context
- **`grasp setup`** CLI subcommand — detect editors, install hooks, write CLAUDE.md/AGENTS.md
- **`grasp diff`** CLI subcommand — show architectural regression vs brain baseline
- **`grasp daemon`** CLI subcommand — watch a directory and auto-re-index on file changes
- **Ask Grasp panel** in the browser UI — keyword search over live analysis data (complexity, security, coupling, churn, grade)
- Swift, PHP, Scala, Zig tree-sitter WASM grammar support

---

## [3.9.7] — 2026-04-24

### Added
- AST-backed cyclomatic complexity for all 16 tree-sitter languages: Python, Go, Java, Kotlin, Rust, C, C++, C#, Ruby, JavaScript, TypeScript, TSX, Swift, PHP, Scala, and Zig
- `countBranches()` method on every extractor counts decision-point AST nodes — `if`, loops, `switch` cases, `catch`, ternaries, `&&`/`||` — without false positives from string literals or comments
- `calcComplexity()` in parser.js now uses AST-backed branch counting when a grammar is loaded, falling back to regex for unsupported file types

### Changed
- bundle.ts and build.mjs include Swift, PHP, Scala, and Zig grammars so the bundle wires all languages end-to-end
- `Extractor` interface gains optional `countBranches?` method

---

## [3.9.6] — 2026-04-24

### Added
- AST-backed function extraction for Go, Java, Kotlin, Rust, C, C++, C#, and Ruby via tree-sitter
- Browser app loads tree-sitter WASM grammars lazily from CDN with IndexedDB caching
- AST confidence indicators: badge in file detail panel, `~` prefix for regex-backed function counts, languages note in health ring
- `astBacked: true` field on function definitions extracted via AST (zero false positives from strings/comments)

### Changed
- MCP server: function extraction for 8 languages now uses native tree-sitter bindings (falls back to regex if grammars unavailable)
- Browser analysis: `preloadGrammars()` pre-fetches all needed WASM files before the parse loop begins

---

## [3.9.5] — 2026-04-24

### Added
- Multi-provider authentication: Bitbucket (username + app password), Azure DevOps (PAT), GitHub Enterprise Server (token + host), and Gitea (token + host) are now fully wired end-to-end
- `detectProvider()` in the browser app shows the correct auth fields for each provider automatically
- `grasp_analyze` MCP tool now accepts `bitbucket_username`, `bitbucket_password`, `azure_pat`, `ghe_token`, `ghe_host`, `gitea_token`, `gitea_host` parameters
- URL detection for all 4 new providers in `parseUrl()` with provider-specific MCP command hints
- 8 new `parseSource()` tests covering Bitbucket, Azure, GHE, and Gitea URL detection and auth passthrough

---

## v3.9.4 — Bug Fixes & E2E Smoke Tests

### Bug Fixes
- `better-sqlite3` native binding now correctly excluded from esbuild bundle (server no longer crashes at startup)
- Renamed duplicate MCP tool `grasp_dependents` → `grasp_deps_dev` for the deps.dev ecosystem lookup
- `SessionStore` constructor now accepts `(dbDir?, ttlDays?, maxSessions?)` parameters for test isolation
- `SessionStore.prune()` now uses SQLite `unixepoch()` comparison instead of file-based expiry

### Testing
- New E2E smoke test suite (`mcp/tests/smoke-new-tools.test.ts`) exercises all 22 enterprise MCP tools via stdio JSON-RPC

---

## v3.9.3 — Grasp Cloud Complete

### New Features
- SQLite persistent session storage (sessions survive server restarts, 30-day TTL)
- GitHub OAuth flow: `/auth/github` → `/auth/github/callback`  
- Org workspace sync: `GET/PUT /api/workspace?room=X`
- Billing: Stripe Checkout redirect at `/billing/checkout`
- Async job queue: `POST /api/v1/analyze`, `GET /api/v1/jobs/:id`
- CI webhooks: GitHub App posts commit status (pending → success) on push
- Cloud deployment: `deploy/docker-compose.cloud.yml`

---

## v3.8.2 — Aerospace Vertical, Phase 3

### New MCP Tools
- `grasp_ecss` — ECSS-E-ST-40C compliance checker (DI-01, DI-04, DI-07, DI-10, DI-15)

### New Features
- VS Code: inline fan-in decorations on import lines, health score in status bar, re-analyse on save command

---

## v3.8.1 — Aerospace Vertical, Phase 2

### New MCP Tools
- `grasp_heritage` — Heritage software genealogy overlay (certification shortcut identification)
- `grasp_icd` — ICD mapper: match Interface Control Document entries to code functions

---

## v3.8.0 — Aerospace Vertical, Phase 1

### New MCP Tools
- `grasp_multilang` — Cross-language call graph (Ada→C, Python→C, JS→WASM)

### New Features
- Ada/SPARK parser: `.adb`/`.ads` support, SPARK Unchecked_Conversion/Deallocation detection

---

## v3.7.2 — Open Source Vertical, Part 3

### New MCP Tools
- `grasp_fork_diff` — Fork divergence analysis with merge blast radius estimation

### New Features
- OpenSSF Scorecard: auto-fetched after GitHub repo analysis (stored in session)
- Contributor impact score: weighted by fan-in of owned files

---

## v3.7.1 — Open Source Vertical, Part 2

### New MCP Tools
- `grasp_api_stability` — API stability score (0-100) between two sessions
- `grasp_dependents` — deps.dev integration: public dependents count for your package

---

## v3.7.0 — Open Source Vertical, Part 1

### New MCP Tools
- `grasp_good_first_issues` — Good first issue generator (isolated + untested + low-complexity files)

### New Features
- GitHub App webhook handler: push + PR event processing on port 3001
- ⋯ menu: Good First Issues entry

---

## v3.6.2 — OS / Kernel Vertical, Part 2

### New MCP Tools
- `grasp_kconfig` — Kconfig/build-time conditional analysis (CONFIG_* usage map, high-risk toggles)
- `grasp_irq` — IRQ/interrupt dependency graph (dynamic alloc detection, blocking call detection)
- `grasp_patch_impact` — Patch series blast radius ranking for kernel/OS code review

### New Features
- Security tab: IRQ/Interrupts section (shown for C/C++ repos)
- Architecture tab: Subsystems section (shown for C/C++ repos)
- ⋯ menu: Patch Impact entry

---

## v3.6.0 — OS / Kernel Vertical, Part 1

### New MCP Tools
- `grasp_subsystems` — Kernel/OS subsystem boundary map with cross-subsystem dependency detection
- `grasp_abi_diff` — ABI/API stability checker: compare exported symbols between sessions, detect breaking changes

### New Features
- Architecture tab: Subsystems section (shown for C/C++ repos)

---

## v3.5.2 — Finance Vertical + Compliance REST API

### New MCP Tools
- `grasp_pii_trace` — PII data flow tracer with BFS downstream traversal
- `grasp_duties` — Separation of duties validator (SOX/FDA/security compliance)
- `grasp_reg_impact` — Regulatory change impact mapper (GDPR/HIPAA/SOX/PCI-DSS)
- `grasp_latency` — Finance/trading latency hotspot detection (blocking I/O, GC, lock contention)
- `grasp_model_risk` — Financial model risk auditor (hardcoded params, NaN checks, div-by-zero)

### New Features
- Compliance REST API: `--http` flag starts HTTP server on :7332 with `/report/sbom|dora|do178c|pii-audit|model-risk` endpoints
- PII source nodes highlighted in graph (purple `#a855f7`)
- "Mark as PII Source" toggle in node Details panel

---

## [3.4.2] — 2026-04-23

### Elastic / Platform Vertical — Org Graph, API Diff, Plugins, SemVer

- **🏢 Org-Level Multi-Repo Graph:** Load 2+ sessions → Sessions panel → 🏢 Org View. Unified graph showing all repos, inter-repo edges, shared libraries. `grasp_org_graph` MCP tool.
- **🔍 Breaking API Change Detector:** Compare two sessions to detect removed exports (critical) and signature changes (high). Sorts by caller count. `grasp_api_diff` MCP tool.
- **🔌 Plugin Extension-Point Map:** Detect extension points (registerPlugin, use(), addHook etc.) and plugin implementations. Flags tightly-coupled extension points. `grasp_plugins` MCP tool.
- **📐 Semantic Versioning Enforcer:** Validates that version bumps match API surface changes — breach (breaking + patch bump), underbump (new exports + patch bump), or ok. `grasp_semver` MCP tool.
- **🔍 Compare APIs button:** In Sessions panel when exactly 2 sessions loaded — shows copyable grasp_api_diff command.

## [3.3.20] — 2026-04-23

### AI Chat — Multi-provider, conversation memory, markdown rendering

- **🤖 Massively expanded provider list:** Anthropic (Opus 4.7, Sonnet 4.6, Haiku 4.5), OpenAI (GPT-4o, GPT-4o mini, o3-mini, o1), Google Gemini (2.0 Flash, 1.5 Pro, 1.5 Flash), Mistral (Small, Large), Groq (Llama 3.3 70B, 3.1 8B, Gemma 2 9B), DeepSeek (Chat, Reasoner), OpenRouter (any model slug), Together AI (any model slug), Ollama (local), LM Studio (local), and fully custom endpoints.
- **💬 Multi-turn conversation memory:** Full conversation history is accumulated across turns (last 30 turns sent to the API). History persists across page refreshes via `localStorage` (`grasp_chat_history`). Clear button wipes both UI and storage.
- **📎 Selected-file context:** When a file is selected in the graph, its path, layer, fan-in/out, complexity, functions, and issues are added to the AI context automatically.
- **🧠 Richer system prompt:** Up to 80 files with full metadata, all architecture issues, all security findings, circular dependencies, layer breakdown, dead function count — giving the AI a complete picture.
- **📝 Markdown rendering:** Assistant responses render full markdown — headers, bold/italic, inline code, fenced code blocks with language hints, bullet/numbered lists, horizontal rules.
- **⧉ Copy button:** Each assistant message has a copy-to-clipboard button.
- **🔧 Custom endpoint support:** OpenRouter and Together AI show a model-slug input. LM Studio and Custom show a base-URL input so you can point to any self-hosted inference server.
- **🔒 Gemini API:** Uses the native `generativelanguage.googleapis.com` endpoint with `systemInstruction` and `model`/`user` role names.
- **🌐 CSP updated:** New `connect-src` entries for Gemini, DeepSeek, OpenRouter, Together AI, and common local ports (1234, 8000, 8080).

---

## [3.3.19] — 2026-04-23

### Team Dashboard Live Collaboration — WebSocket sync, LAN hosting, Export/Import

- **🔄 Live Collaboration Sync:** `Sync` button in Team Dashboard topbar — opens connection panel. Connect to a Grasp server on your LAN/company network via WebSocket. Rooms provide isolation between teams. Workspace changes (repos, status tags, notes, ownership) propagate to all connected clients in real time.
- **🌐 LAN / Remote Hosting:** New `--host=<ip>` CLI flag (also `GRASP_HOST` env var). Run `npx grasp --host=0.0.0.0` to bind the server to all interfaces; team members access `http://server-ip:7331/dashboard`.
- **📊 Serve Team Dashboard from CLI:** CLI now serves `team-dashboard.html` at `/dashboard` on the same port as the main analyser. No separate server needed.
- **🏠 Room Isolation:** Named rooms (`?sync_room=backend-team`) provide per-team workspace isolation. Different teams can run separate rooms on the same server.
- **👥 Presence Indicators:** Live "Online (N)" list in the Sync panel showing who is connected to the room and their display names.
- **🔗 Share Links:** "⎘ Copy team link" and "👁 Copy read-only link" buttons generate URLs that auto-connect others to the room.
- **👁 Read-Only Links:** `?readonly=1` URL parameter puts the dashboard in observer mode — sees all live changes but cannot push edits. Read-only banner shown at the top.
- **🔒 Room Passwords:** `--room-secrets=room1:pass1,room2:pass2` CLI flag password-protects specific rooms. Wrong password triggers a `WRONG_PASSWORD` error from the server.
- **📤 Export JSON:** New "⬇ JSON" button exports the active workspace (repo list + team fields) as a structured JSON file for backup or sharing.
- **⬆ Import JSON:** New "⬆ Import" button loads a JSON workspace file and creates a new workspace from it.
- **🔌 REST API:** `GET /api/health` · `GET /api/rooms` · `GET/PUT /api/workspace/:room` — programmatic access for monitoring and CI/CD integration.
- **Toast notifications:** Non-blocking toast messages for import success, sync connect/disconnect, and incoming workspace updates.

---

## [3.3.18] — 2026-04-23

### Enterprise Vertical — SBOM + DORA + Technical Debt + ADR Generation

- **📋 SBOM Generation:** ⋯ → SBOM (CycloneDX/SPDX) or 📤 Export → SBOM. Parses `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pyproject.toml`. Outputs CycloneDX 1.4 or SPDX 2.3 JSON. Required for SOC2, supply chain security, government contracts. `grasp_sbom` MCP tool.
- **📊 DORA Metrics:** ⋯ → DORA Metrics. Fetches 30-day GitHub Actions runs and PR data to compute Deployment Frequency, Lead Time, and Change Failure Rate. Shows DORA tier (Elite/High/Medium/Low) with per-metric tier badges. `grasp_dora` MCP tool.
- **📊 Technical Debt Quantification:** ⚡ Actions tab → Technical Debt Estimate card (auto-shown when debt > 0). Converts architectural issues to developer-days: circular deps 4h/cycle, god files 16h, security critical 8h, high coupling 6h, dead code 0.5h/fn, arch violations 3h, high complexity 12h. Breakdown by category. ~Nd badge shown in health panel.
- **📝 ADR Generation:** ⋯ → Generate ADR. Opens modal to generate Architecture Decision Records (MADR format). With Anthropic API key → Claude-powered ADR. Without → structured MADR template. Copy or download as .md. `grasp_adr` MCP tool.
- **Team Dashboard:** Debt (days) column added per repo.

---

## [3.3.17] — 2026-04-23

### AI Research Vertical Part 2 — Training Run Diff + Eval Coverage + ML Pipeline DAG

- **⚙️ Training Run Diff:** ⋯ → Run Diff. Paste two training configs (JSON or YAML). Grasp computes the flat key diff, then scans the codebase for files that read each changed key via pattern matching (`config.key`, `args.key`, `hparams['key']`, `FLAGS.key`, etc). Highlights data pipeline, model, and eval file changes. Export as JSON. `grasp_run_diff` MCP tool for CI integration.
- **🧪 Eval Coverage Map:** ⋯ → Eval Coverage. BFS trace from detected eval scripts (eval/, evals/, assessments/, benchmarks/, *_eval.py) through import connections. Shows covered %, lists uncovered files per click. `grasp_eval_coverage` MCP tool.
- **🤖 ML Pipeline DAG:** ⋯ → ML Pipeline. Detects PyTorch, TensorFlow, JAX, HuggingFace, and Lightning patterns. Renders a 5-stage pipeline: Data → Model → Training → Eval → Checkpointing. Flags potential data leakage (eval scripts importing training-only data). Only shown when ML imports are detected.

---

## [3.3.16] — 2026-04-23

### AI Research Vertical — Safety Constraint Tracer + Research/Prod Boundary + Jupyter Notebooks

- **🔒 Safety Constraint Tracer:** Mark files as Safety Gates (🔒), Entry Points (🚪), or Output Points in the Details panel. Grasp traces every entry→output path and flags any path that bypasses all safety gates as an ungated path (Critical issue). New `Safety` color mode shows green=gated, red=ungated, orange=gate file, blue=entry. `grasp_safety_trace` MCP tool for CI integration. Gates and points persist in localStorage (`grasp_safety_gates`, `grasp_entry_points`, `grasp_output_points`).
- **🧪 Research/Production Boundary Enforcer:** Detects production code importing from research/experimental modules (cross-boundary violations). New `boundary` color mode (yellow=violators, blue=production, red=research). Violation count shown in ⋯ menu item. Configurable research/prod folder patterns via `grasp_boundary_rules` localStorage key.
- **📓 Jupyter Notebook (.ipynb) Support:** Notebooks are now first-class citizens: code cells extracted as pseudo-functions, Python imports resolved, layer shown as `notebook` (orange) in Layer color mode. Reproducibility issues auto-detected: missing random seed, non-portable absolute paths, runtime `!pip install`, `%run` magic — appear in Issues tab under 📓 Notebook Reproducibility.

---

## [3.3.15] — 2026-04-23

### Aerospace Vertical, Part 2 — Anomaly Investigation + Software Reuse Assessor

- **🔍 Anomaly Investigation:** Select any file in the Details panel → click 🔍 Anomaly Investigation to build a structured investigation package showing callers, callees, transitive blast radius (BFS up to 50 files), security issues in the call chain, and a plain-English summary. Export as JSON for incident reports. Also available as `grasp_anomaly` MCP tool.
- **🔁 Software Reuse Assessor:** In Sessions panel, enable Compare Mode, select exactly 2 sessions, and click 🔁 Assess Reuse. Produces a Red/Amber/Green compatibility matrix across: Interface Compatibility (% of exported functions used by target), Dependency Coverage (all imports satisfied), Security (no critical/high issues), and Architecture Fitness (health score). Verdict: Safe / Needs adaptation / Do not reuse. Also available as `grasp_reuse` MCP tool.

---

## [3.3.14] — 2026-04-23

### Aerospace Vertical — Requirement Traceability, MISRA Detection, Certification Export

- **📋 Compliance tab:** New right-panel tab for DO-178C / ECSS safety-critical software compliance. Upload a requirements CSV (ID, description, level) — Grasp scans your codebase for `@REQ-NNN` comment tags and shows covered, uncovered, and unspecified (no tag) files.
- **Requirements CSV loader:** Drag-and-drop or paste mode; configurable prefix (default `REQ`); stored in localStorage (`grasp_requirements`); re-scans automatically when a new analysis runs.
- **`grasp_req_trace` MCP tool:** Programmatic requirement traceability from Claude Code — pass a list of `{id, desc, level}` requirement objects, get back coverage percentage, covered/uncovered lists, and unspecified files.
- **🔧 Safety Mode:** Toggle via ⋯ menu to enable MISRA C / ECSS heuristic checks for C, C++, and Ada files. Detects: dynamic memory allocation (Rule 20.4/20.9), recursive functions (Rule 17.2), goto statements (Rule 15.1), multiple returns in long functions (Rule 15.5), unsafe process termination (abort/exit), formatted output in mission code (printf family), and Ada.Unchecked_Conversion / Ada.Unchecked_Deallocation.
- **MISRA section in Security tab:** Appears automatically when C/C++/Ada files are detected; shows rule violations with severity badges; clickable for full details.
- **🏛️ Compliance Report (DO-178C / ECSS):** One-click certification evidence export via ⋯ → Compliance Report or 📤 Export → Cert Report. Generates HTML (printable, suitable for PDF export) or JSON (machine-readable for tool chains) with 8 sections: Software Inventory, Requirement Traceability Matrix, Complexity Analysis, Circular Dependencies, Security Findings, Dead Code, MISRA Violations, and Health Assessment with pass/fail verdict.

---

## [3.3.13] — 2026-04-23

### Patterns Tab — Pattern Suggestions

- **Suggested patterns section:** The Patterns tab now splits into three sections — Detected, Anti-Patterns, and Suggested. Suggested patterns are high-confidence recommendations inferred from live file content during analysis.
- **Three reliable suggestion detectors:** Strategy (4+ else-if branches on a type/mode/action variable), Factory (same constructor called across 4+ files), Observer (4+ `.then()` chains or callback nesting depth ≥ 5).
- **How-to guidance box:** Each suggested pattern card shows a concise implementation hint so developers know exactly what to add.
- **Factual detected descriptions:** Detected pattern descriptions now state what was found (e.g., "Factory functions found in 3 files") rather than generic advice, so Detected and Suggested sections read clearly without confusion.
- **"N 💡" badge count:** The Patterns tab badge shows detected count + a separate suggested count so users can see at a glance whether suggestions are available.
- **Suggestions only during live analysis:** File content is required for the detectors; cached/stored analyses with no content correctly show no suggestions (not a bug).

---

## [3.3.12] — 2026-04-23

### Bug Fixes — Force Graph Auto Fit

- **`simCancelled` flag prevents premature fit on React re-renders:** React's `useEffect` cleanup calls `sim.stop()`, which fires the D3 `'end'` event mid-explosion. A `simCancelled` flag is now set to `true` in the cleanup function *before* `sim.stop()` is called, so any `'end'` event triggered by cleanup is ignored. Only the final simulation — where cleanup never runs before natural completion — triggers the fit.
- **Node positions reset on each render:** D3 modifies node objects in place (`node.x`, `node.y`). When the same node objects were reused across React re-renders, the simulation resumed from explosion positions (~±4600 px) and ended immediately, causing auto-fit to zoom out to scale 0.045 (unreadable dots). Positions are now reset to a small random cluster near the canvas centre before each simulation.
- **Adaptive charge strength for large repos:** `forceManyBody` strength is now scaled inversely with node count — `max(20, min(spacing, 4000/nodeCount))` — so 200+ node repos produce a compact layout (~±400 px spread, fit scale ~0.6×) rather than an explosion layout (~±4600 px spread, fit scale 0.045×).
- **Stronger centering force for large graphs:** `forceX`/`forceY` strength raised from 0.15 → 0.25 for graphs with more than 80 nodes, pulling clusters back toward their folder centres.
- **Fallback timer extended 1500 ms → 2500 ms:** The `setTimeout` fallback now fires after the simulation is guaranteed to have settled (D3 with `alphaDecay=0.05` completes in ~2.25 s for large graphs).

---

## [3.3.11] — 2026-04-23

### Bug Fixes — Auto Fit & Fit Button
- **Auto fit-to-view now reliably fires:** The previous `sim.on('end')` approach was cancelled by React's cleanup function on re-renders before the simulation finished. Replaced with a tick-based trigger (`tickCount === 40`) that always fires during the simulation regardless of re-renders.
- **Fit button restored to correct behaviour:** The `Math.max(scale, 0.6)` floor introduced in v3.3.10 was too high — for large repos the correct zoom-out scale can be as low as 0.27, so the floor was preventing full fit and leaving half the graph off-screen. Removed the floor; fit now always shows all nodes.

---

## [3.3.10] — 2026-04-23

### Graph UX — Auto Fit & Minimap Default On
- **Auto fit-to-view on load:** Force graph fits after simulation settles (`sim.on('end')`); architecture diagram fits immediately after render; 3D graph calls `zoomToFit` 2.5s after init.
- **Minimap on by default:** The minimap overlay is now enabled when the app loads — no need to toggle it manually.
- **Smarter fit scale:** `fitView` now clamps the zoom between 0.6× and 2.5×, and centers on the node centroid so the densest part of the graph stays visible even for large repos that can't fit at 0.6×.
- **Larger nodes by default:** Minimum node radius increased from 8px to 10px; maximum from 24px to 28px; scaling formula adjusted for better proportional sizing.

---

## [3.3.9] — 2026-04-23

### Analysis Accuracy — False Positive Elimination
- **Import-aware circular dependency detection:** JS/TS connections are now only created when the calling file explicitly imports from the source file via `import … from` or `require()`. Cross-file function-name collisions can no longer produce phantom circular dependency chains.
- **Language-family + package filtering for non-JS/TS:** Kotlin, Java, Go, Rust, Python, Ruby, Swift, Lua, and shell files only produce connections when caller and callee share both the same language family and the same top-level package directory.
- **Entry-point exemption for god-file detection:** `index.[jt]sx?` files are structural aggregators and are no longer penalised for having many functions regardless of count.
- **Raised thresholds:** god-file limit raised from 15 → 50 functions; high-coupling limit raised from 8 → 30 fan-in connections.
- **Console.log in CLI/server files excluded from debug-statement detector:** `cli.[jt]sx?`, `server.[jt]sx?`, and files under `cli/` or `bin/` directories intentionally use console.log as their output mechanism — they are no longer flagged.
- **TODO/FIXME detector counts comment lines only:** the detector now requires matches to appear on lines starting with `//`, `*`, or `#` — scanner code containing `TODO` inside regex literals is no longer self-flagged.
- **`grasp_suggest` tool uses THRESHOLDS constants:** god-file and coupling suggestions now use the same thresholds as the analysis engine (no more hardcoded mismatches).
- **Verified:** self-analysis of the Grasp repo now scores `100/A`, with 0 cycles, 0 security issues, and no critical or high suggestions.

---

## [3.3.8] — 2026-04-23

### Security Scanner — Self-Analysis False Positive Fixes
- **eval() in description strings no longer triggers Dynamic Code Execution:** zero-argument `eval()` references appearing in scanner description strings or comments are excluded — only actual `eval(someExpression)` calls are flagged
- **Function Constructor detector uses line-by-line gate:** the `Function(` string appearing inside `.includes()` calls or string literals in the scanner code itself no longer produces false findings; a real `new Function(…)` call must be present
- **XSS detector uses line-by-line gate:** `innerHTML =` references inside regex literals or `.includes()` expressions in the scanner code are excluded; only direct DOM assignment lines are flagged
- **Replaced `innerHTML` with safe DOM methods:** two `innerHTML` assignments in the app (`auto-fetch error link` and `coupling tooltip`) replaced with `createElement`/`textContent` to eliminate real XSS risk from file-path data and repo URL parameters

---

## [3.3.7] — 2026-04-23

### Security Scanner — False Positive Fixes
- **Shell env-var references no longer flagged as hardcoded secrets:** lines like `-d client_secret="$CHROME_CLIENT_SECRET"` use shell variable expansion, not literal credentials — the detector now correctly ignores quoted `$VAR` patterns
- **Documentation files excluded from secret and eval() scans:** `.md` and `.txt` files (README, CLAUDE.md, docs) were triggering false positives when they described security features or showed example tokens; they are now skipped
- **eval() detector no longer flags string-content checks:** lines like `f.content.includes('eval(')` or `.findIndex(l => l.includes('eval('))` are pattern-matching strings, not eval() invocations — the detector now requires `eval(` to appear as an actual call outside a string literal
- **No issue pushed when no real eval() call exists:** previously a file that passed the content check but had zero real eval() calls would still generate a finding; now the issue is only raised when at least one genuine call is found

### CI — Integrations Workflow Refactor
- **Split `integrations.yml` into two focused files** to reduce per-file complexity (was 309 lines / score 47):
  - `integrations-core.yml` — shared infra + phases 1–4 (Docker, Homebrew, GitHub Action, GitLab CI, bots, MCP sources, Gitea E2E)
  - `integrations-plugins.yml` — phases 5–10 (browser extension, Raycast, AI platforms, editors, issue trackers, AI coding tools)
- Both workflows trigger on the same branches (`main`, `feature/integrations-*`) and PRs as before

---

## [3.3.6] — 2026-04-22

### Safari Extension (Sideloadable)
- **Sideload on macOS 13+:** download `grasp-safari-extension.zip` from GitHub Releases, move `Grasp.app` to `/Applications`, open it once, then enable in Safari Settings → Extensions; no App Store or Apple account required
- **MV3 service worker:** uses the same MV3 manifest format as Chrome (minus `"type": "module"` which Safari doesn't support yet); `manifest.safari.json` is the dedicated Safari manifest
- **Zero new TS code:** all three browsers (Chrome, Firefox, Safari) share the same compiled `background.js`, `content.js`, and `popup.js` output — three browsers, one TypeScript source
- **Xcode project:** `safari-extension/Grasp/` — generated by `xcrun safari-web-extension-converter`, references `browser-extension/dist-safari/`
- **Local dev:** `npm run build:safari` compiles and assembles `dist-safari/`, then open `safari-extension/Grasp/Grasp.xcodeproj` in Xcode
- **CI:** `build-safari` job on `macos-latest`; builds unsigned `.app`, zips it, attaches to GitHub Release (App Store submission skipped unless Apple secrets are configured)

---

## [3.3.4] — 2026-04-22

### JetBrains — IDE 253 Compatibility
- **Removed `until-build` restriction:** plugin now compatible with JetBrains IDE 253 and all future releases — no version ceiling

---

## [3.3.3] — 2026-04-22

### Chrome Extension — Self-Hosted GitLab & Enterprise Browsers
- **Self-hosted GitLab support:** paste `gitlab.internal.example.com/org/repo` (or any custom instance URL) in the popup — parsed correctly, opens Grasp with the right host
- **"Enable Grasp on this site" button:** when opened on a custom Git host (self-hosted GitLab, GitHub Enterprise, Gitea, etc.), popup detects the hostname and offers a one-click permission grant; after approval, the floating Grasp button is injected immediately AND registered for all future visits to that host
- **`optional_host_permissions`:** extension requests host access per-site on demand — no broad permissions at install time
- **Enterprise/managed browsers:** once Chrome Web Store–approved, IT admins can force-install via Google Admin Console → `ExtensionInstallForcelist` policy; the `.crx` from GitHub Releases also supports self-hosted enterprise deployment without CWS

---

## [3.3.2] — 2026-04-22

### Rate Limit Dialog
- **Add token inline:** paste a GitHub Personal Access Token directly in the rate limit dialog — no need to dismiss and find the auth panel
- **Save & Analyze:** submitting a token immediately applies it, saves to localStorage, and continues at 5,000 req/hr — no page reload needed
- **Privacy note:** "Stored locally in your browser · never sent to us" shown next to the input
- **Create a token →** link opens GitHub's token page with `repo` scope pre-selected
- Three-button layout: Cancel · Continue (X remaining) · Save & Analyze →

---

## [3.3.1] — 2026-04-22

### Chrome Extension
- **Fix:** "Open Grasp App" button was silently broken — MV3 Content Security Policy blocks inline `<script>` in extension pages; popup logic moved to compiled `dist/popup.js`
- **Smart popup:** detects current GitHub/GitLab repo automatically and shows one-click "Analyze this repo →"; falls back to URL input when not on a repo page
- **Polished floating button:** pill shape, small graph icon, hover lift animation, smoother shadow
- **Fix:** GitLab repos now open with `gitlab.com/` prefix so the app auto-detects correctly

### Docs
- Privacy policy contact email updated to `contact@ashforde.org`

---

## [3.3.0] — 2026-04-20

### Full GitLab Parity
- **MCP/CLI analysis**: `fetchGitLabChurn` (Commits API per-file), `fetchGitLabOwnership` (Blame API), `fetchGitLabCiStatus` (Pipelines API), `fetchGitLabIssues` — dual-header auth (PRIVATE-TOKEN / Bearer), 20-worker concurrent fetch pool, 500-file default limit
- **`GITLAB_TOKEN` env var + `--gitlab-host` flag** in CLI — works for gitlab.com and any self-hosted instance
- **GitLab bot server** (`gitlab-app/`) — Express :7332, webhook signature verification (timing-safe), MR comment poster, commit status updater, Push + Merge Request hook handlers, OAuth2 flow with CSRF state tokens
- **Tunnel agent** (`gitlab-agent/`) — lightweight Go binary (~5MB), WebSocket reconnect with exponential backoff, webhook proxy, URL security guard, scratch Dockerfile, systemd service template
- **Docker deployment** — `gitlab-app/Dockerfile` (multi-stage node:20-alpine), `deploy/docker-compose.gitlab.yml`, `deploy/.env.gitlab.example`
- **SaaS API** — `normalizeRepo()` discriminated union supports GitLab URLs (cloud + self-hosted + subgroups), `analyzeRepo` routes GitLab vs GitHub
- **Frontend** — GitLab URL detection in repo input; token + host fields auto-appear for GitLab URLs; localStorage persistence
- **CI pipeline** — `publish-gitlab-app-image` + `publish-gitlab-agent` jobs in release workflow
- **Documentation** — GitLab Bot card in both help modals, `GITLAB_TOKEN`/`GITLAB_HOST` instructions, mcp/package.json + server.json updated

---

## [3.2.1] — 2026-04-20

### Pipeline
- Release pipeline now owns releases fully: delete + recreate on each tag, grouped feat/fix notes, always marked Latest
- Release notes filter `feat:` and `fix:` commits only — no internal chore/ci noise
- Fixed: releases no longer left as drafts on re-tag
- Fixed: `mcp-publisher` now installed from GitHub releases binary (not npm)
- Fixed: Docker Hub login made optional (skips gracefully if secret missing)
- Fixed: `secrets` context not allowed in step `if:` conditions — moved to env var check

### Fixes
- All version strings synced to 3.2.1 across all packages, manifests, HTML files, and docs

---

## [3.2.0] — 2026-04-19

### New Tools (MCP)
- **`grasp_jira_issues`** — maps Jira Cloud issues to source files by filename stem; supports JQL queries and ADF description parsing
- **`grasp_service_graph`** — builds distributed service dependency graph from OTEL/GraspTracer runtime traces
- **`grasp_runtime_calls`** — now auto-detects OTEL and GraspTracer trace formats (two-stage fallback)

### New Features
- **Enterprise license keys** — HMAC-signed `gsp-<tier>-<payload>-<sig>` format; `generateLicenseKey` / `validateLicenseKey` with timing-safe comparison
- **Audit logging** — rolling 10,000-entry event store; enterprise-only `/audit` endpoint with repo/date filtering
- **LLM provider abstraction** — Mistral, Groq, Ollama added to AI chat panel alongside OpenAI and Anthropic; system prompt preserved across all providers
- **Cross-repo search** — term-based inverted index across multiple repositories; deduplicates by `(repo, file)` key
- **Real-time collaboration** — WebSocket collab rooms with broadcast and client tracking
- **Self-hosted Docker Compose** — `deploy/docker-compose.yml` with grasp-saas, grasp-github-app, and Redis; `deploy/.env.example` and step-by-step `deploy/README.md`

### CI / Automation
- Publish pipeline (`publish.yml`) fully automated: npm, MCP registry (OIDC), VS Code Marketplace, JetBrains, Docker multi-arch, GitHub Release
- GitHub Release creation is idempotent — skips if tag already exists, uploads artifacts only
- Phase 2A CI fix: `github-action run()` guarded by `require.main === module` to prevent execution during Jest import
- Phase 7 CI fix: lockfiles generated for `continue-provider`, `copilot-extension`, `gpt-actions`, `amazon-q-plugin`
- Removed all third-party attribution from pipeline-generated commits and release notes

### Fixes
- Footer version no longer shows stale `2.9.1`; uses `window.GRASP_VERSION` consistently
- MCP registry description trimmed to 100-char limit (was 187, caused 422 on publish)
- System prompt was silently dropped in provider body builders — restored
- Search results deduplicated (same file could appear multiple times across term matches)

---

## [3.1.2] — 2026-04-19

### New Tools
- `grasp_config_validate` — validates `grasp.yml` rule files
- `grasp_refactor_plan`, `grasp_circular_deps`, `grasp_blast_radius`, `grasp_duplicate_symbols`
- `grasp_runtime_calls` — runtime trace analysis (GraspTracer format)
- `grasp_dependency_graph`, `grasp_health_score`, `grasp_layer_map` — core analysis tools

### Infrastructure
- GitHub Pages deployment workflow
- VS Code extension with real Grasp icons
- Browser extension (Chrome/Firefox) with MCP connectivity
- JetBrains plugin (Kotlin)
- Neovim, Vim, Emacs, Zed editor plugins
- Slack, Teams, Discord bots
- Linear, Jira integration stubs
- Raycast extension
- Continue, Copilot, GPT Actions, Amazon Q provider integrations
- AI coding tool MCP configs (Claude Code, Cursor, Cline, Roo Code, Kilo Code, OpenCode, Trae, Grok CLI, Codex CLI, Droid)
- Docker multi-arch image (`linux/amd64`, `linux/arm64`)
- Homebrew formula
- Bitbucket Pipe, CircleCI Orb, GitLab CI component

---

## [3.1.1] — 2026-04-18

- Version bumps and package metadata updates

---

## [3.1.0] — 2026-04-17

- Initial public release on npm as `grasp-mcp-server`
- Core MCP tools: dependency graph, health score, layer map, blast radius
- GitHub App for PR analysis
- SaaS API foundation

---

## [2.9.1] and earlier

Internal development versions. Not publicly released.
