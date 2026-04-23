# Grasp — Enterprise Verticals v2 Design
# v3.3.20 → v3.9.3 across 18 releases

## Context

Grasp has shipped three org verticals (ESA, AI Research, Enterprise) across v3.3.14–v3.3.18 and an AI Chat overhaul in v3.3.20. This plan adds six more phases covering four new industry verticals (Elastic/Platform, Finance, OS/Kernel, Open Source) plus ESA Part 2 and a Grasp Cloud capstone — 29 features total across 18 version bumps.

### Interleaved principle
Each phase ships one vertical **plus** one cross-cutting feature that all subsequent phases benefit from. No cross-cutting work is deferred to the end.

---

## Version Map

| Version | Vertical | Features |
|---------|----------|----------|
| v3.4.0 | Elastic / Platform | Org-level multi-repo graph |
| v3.4.1 | Elastic / Platform | Breaking API change detector + Plugin extension-point map |
| v3.4.2 | Elastic / Platform | Semantic versioning enforcer |
| v3.5.0 | Finance | PII / sensitive data flow tracer + Separation of duties validator |
| v3.5.1 | Finance | Regulatory change impact mapper + Latency hotspot detection |
| v3.5.2 | Finance + cross-cutting | Model risk audit + Compliance REST API |
| v3.6.0 | OS / Kernel + cross-cutting | Kernel subsystem boundary map + ABI stability checker |
| v3.6.1 | OS / Kernel | Kconfig analysis + IRQ dependency graph |
| v3.6.2 | OS / Kernel | Patch series impact |
| v3.7.0 | Open Source + cross-cutting | GitHub App auto-analysis + Good first issue generator |
| v3.7.1 | Open Source | API stability score + Dependents-in-the-wild |
| v3.7.2 | Open Source | Fork divergence + OpenSSF Scorecard + Contributor impact score |
| v3.8.0 | ESA Part 2 | Ada / SPARK deep support + Multi-language call graph |
| v3.8.1 | ESA Part 2 | Heritage software genealogy + ICD mapper |
| v3.8.2 | ESA Part 2 + cross-cutting | ECSS-E-ST-40C compliance checker + VS Code inline health extension |
| v3.9.0 | Grasp Cloud | Persistent session storage layer |
| v3.9.1 | Grasp Cloud | Auth (GitHub OAuth) + org workspace |
| v3.9.2 | Grasp Cloud | Billing tier + SaaS API |
| v3.9.3 | Grasp Cloud | CI webhooks + hosted auto-analysis |

**Total: 18 version bumps, ~38 tasks, v3.3.20 → v3.9.3**

---

## Phase 1 — Elastic / Platform Vertical (v3.4.0–v3.4.2)

### T1: Org-Level Multi-Repo Dependency Graph (v3.4.0)

**What it is:** Today `grasp_cross_repo` compares exactly two sessions. This scales to 50+ repos with a unified graph — one node per repo, edges = inter-repo imports and API calls. The foundational feature that all subsequent phases build on.

**Design:**

**Multi-session analysis:**
- New `grasp_org_graph` MCP tool: accepts array of session IDs (or `owner/*` wildcard for all sessions matching a GitHub org)
- Merges individual session graphs: each repo = super-node, edges derived from cross-repo import patterns and shared package names
- Detects inter-repo edges by: matching imported package names against other repos' `package.json` names, shared GitHub Actions workflow refs, and explicit monorepo workspace entries

**Graph rendering:**
- New "Org View" toggle in ⋯ menu (only available when 2+ sessions exist)
- Super-nodes sized by total file count, colored by health grade (A=green → F=red)
- Edges colored by type: package dep (blue), API call (orange), shared infra (grey)
- Click a super-node → drill down into that repo's full graph
- Back button returns to org view

**Data shape:**
```javascript
data.orgGraph = {
  repos: [{session_id, name, health, fileCount, grade}],
  edges: [{from, to, type: 'package'|'api'|'infra', weight}],
  sharedLibs: [{name, usedBy:[session_id]}]
}
```

**UI:** New "🏢 Org View" button in Sessions panel when 2+ sessions loaded.

**MCP tool: `grasp_org_graph`**
```
Input: { session_ids: string[], include_shared_libs?: boolean }
Output: { repos, edges, shared_libs, health_summary }
```

**Files:** `index.html` (OrgGraphView component, org toggle), `mcp/src/index.ts` (grasp_org_graph)

---

### T2: Breaking API Change Detector + Plugin Extension-Point Map (v3.4.1)

**Breaking API change detector:**
- Compares two sessions (old vs new) for a repo
- Detects: exported function signature changes, removed exports, parameter count changes, return type changes (inferred from JSDoc/TypeScript annotations)
- Flags: "BREAKING: `auth(user, pass)` → `auth(credentials)` — 14 callers affected"
- New `grasp_api_diff` MCP tool
- UI: new section in `grasp_diff` output + Issues tab "⚠️ Breaking Changes" when comparing sessions

**Plugin extension-point map:**
- Detects plugin pattern: files that export a registration function (`registerPlugin`, `use()`, `extend()`, `addHook()`)
- Maps: which files ARE extension points, which files are plugins (implement the interface), coupling between plugin and core
- Flags: extension points with >N direct dependencies (tightly coupled, hard to plugin against)
- New `grasp_plugins` MCP tool
- UI: new "🔌 Plugins" section in Architecture tab (only shown when plugin pattern detected)

**MCP tools: `grasp_api_diff`, `grasp_plugins`**

---

### T3: Semantic Versioning Enforcer (v3.4.2)

**What it is:** Compares two sessions and determines whether the version bump in `package.json` is semantically correct: breaking changes require major/minor bump, new exports require minor, fixes only = patch.

**Logic:**
```
Breaking API changes detected → must be minor or major bump
  Current bump is patch → VIOLATION: semver breach
New exports added → must be minor bump
  Current bump is patch → WARNING: semver underbump  
No API surface changes → patch is correct → OK
```

**UI:** Shown in `grasp_diff` output as a semver verdict card. New `grasp_semver` MCP tool.
Also shown as a PR comment section when using `grasp_pr_comment`.

**MCP tool: `grasp_semver`**
```
Input: { session_id_old, session_id_new }
Output: { verdict: 'ok'|'underbump'|'breach', required_bump, actual_bump, reasons }
```

---

## Phase 2 — Finance Vertical (v3.5.0–v3.5.2)

### T4: PII / Sensitive Data Flow Tracer + Separation of Duties Validator (v3.5.0)

**PII tracer:**
- User marks "source" files/functions as PII entry points (e.g. `getUserInput()`, `readCreditCard()`) via Details panel → "🔒 Mark as PII Source"
- Traces all code paths that touch marked sources using BFS on the call graph
- Flags: PII reaching a logging function, PII in a non-encrypted storage write, PII in a URL parameter
- Color mode: "Data Flow" — red = PII-touching files, green = clean
- `localStorage` key: `grasp_pii_sources`
- MCP tool: `grasp_pii_trace`

**Separation of duties validator:**
- User defines "duty boundaries" in Rules tab: `{name:'Order Entry', paths:['src/orders/']}, {name:'Settlement', paths:['src/settlement/']}`
- Grasp checks `grasp_contributors` data: flags any contributor who appears in top-3 for BOTH sides of a boundary
- `localStorage` key: `grasp_duty_boundaries`
- MCP tool: `grasp_duties`

---

### T5: Regulatory Change Impact Mapper + Latency Hotspot Detection (v3.5.1)

**Regulatory change impact mapper:**
- User pastes a regulation change description (free text) or uploads a diff document
- Grasp extracts key terms (entity names, process terms) and maps them to code files via keyword + function name matching
- Returns: "These 12 files likely need review for this regulation change" with confidence score
- Extends `grasp_explain` approach — no external AI call needed, pure text matching
- MCP tool: `grasp_reg_impact`

**Latency hotspot detection (trading):**
- Extends existing `grasp_perf` with finance-specific patterns:
  - Synchronous I/O (`readFileSync`, `execSync`) in functions with >3 callers
  - Object allocation in functions called from tight loops
  - Mutex/lock patterns (`synchronized`, `lock()`, `mutex`) in hot-path functions
  - `setTimeout`/`setInterval` with <1ms intervals (busy-wait pattern)
  - Database calls without connection pooling
- Severity-ranked output: Critical (in hot path), High (in moderate-traffic path), Medium
- MCP tool: `grasp_latency`

---

### T6: Model Risk Audit + Compliance REST API (v3.5.2)

**Model risk audit:**
- Detects financial model patterns: functions with hardcoded numeric constants (magic numbers in financial context), functions that read config for model parameters, functions that produce output used in financial decisions
- Flags: untested model paths (no test file calls this function), hardcoded assumptions (magic numbers), undocumented parameters (no JSDoc/comment on model input)
- Outputs structured "Model Risk Report": model entry points, their test coverage, hardcoded constants, documentation gaps
- MCP tool: `grasp_model_risk`

**Compliance REST API (cross-cutting):**
- Extends the existing CLI server with new REST endpoints:
  - `GET /report/sbom?session_id=X&format=cyclonedx` — returns SBOM JSON
  - `GET /report/dora?session_id=X&token=Y` — returns DORA metrics JSON
  - `GET /report/do178c?session_id=X` — returns DO-178C evidence package JSON
  - `GET /report/pii-audit?session_id=X` — returns PII flow audit JSON
  - `GET /report/model-risk?session_id=X` — returns model risk report JSON
- All endpoints return `Content-Type: application/json` with consistent envelope: `{version, generated_at, repo, report_type, data}`
- Auth: optional `?token=` query param (same as GitHub token pattern)
- Files: `mcp/src/index.ts` (new HTTP endpoints alongside existing MCP tools)

---

## Phase 3 — OS / Kernel Vertical (v3.6.0–v3.6.2)

### T7: Kernel Subsystem Boundary Map + ABI Stability Checker (v3.6.0)

**Kernel subsystem boundary map:**
- For C/C++ repos: detect directory-level subsystem groupings (networking, fs, mm, drivers, arch, crypto, etc.) by directory name patterns and `MAINTAINERS`-style file
- Render subsystems as colored super-clusters in the graph (like Architecture layers but at org-level within one repo)
- Flag cross-subsystem dependencies: files in `net/` importing from `mm/` directly → subsystem violation
- User can define custom subsystem boundaries in Rules tab
- MCP tool: `grasp_subsystems`

**ABI stability checker (cross-cutting):**
- Compares exported symbols between two sessions of the same repo
- For C/C++: function signatures in header files (.h/.hpp), exported symbols in `.map` files
- For JS/TS: exported names in `index.js/ts`, public API surface (non-underscore exports)
- Flags: removed exports (breaking), signature changes (breaking), new exports (non-breaking)
- Works for ANY language/repo — not kernel-specific despite shipping in this phase
- MCP tool: `grasp_abi_diff`

---

### T8: Kconfig Analysis + IRQ Dependency Graph (v3.6.1)

**Kconfig / build-time conditional analysis:**
- Parses `Kconfig` files and `#ifdef CONFIG_*` patterns in C files
- Builds a map: config option → files that are conditionally compiled
- Detects: dead code under specific configs, files only compiled in one config variant, config options that affect >50 files (high-risk toggle)
- UI: new "⚙️ Build Config" section in Architecture tab (only for C repos with Kconfig files)
- MCP tool: `grasp_kconfig`

**IRQ / interrupt dependency graph:**
- Detects interrupt handler patterns: `irq_handler`, `__irqhandler`, `ISR_VECTOR`, RTOS interrupt registration patterns (FreeRTOS `xTaskCreate` with interrupt priority, Zephyr `IRQ_CONNECT`)
- Traces call chains from IRQ handlers, flags: dynamic allocation (`malloc`, `new`) in IRQ chain, sleeping calls (`sleep`, `delay`, `wait`) in IRQ chain, excessive call depth (>5 levels deep from IRQ)
- UI: new "⚡ IRQ" section in Security tab (shown for C/C++/RTOS repos)
- MCP tool: `grasp_irq`

---

### T9: Patch Series Impact (v3.6.2)

**What it is:** For kernel/OS contributors submitting a patch series (10–30 sequential patches), analyze which patch has the highest blast radius and suggest review prioritization order.

**Design:**
- Input: ordered list of commit SHAs (from `grasp_timeline` output or manual input)
- Per-patch analysis: files changed, blast radius of each changed file, subsystem crossings, complexity delta
- Output: ranked patch list — "Review patch 4/12 first — touches networking + mm, blast radius 23 files"
- Cumulative impact: "Full series touches 8 subsystems, 47 files"
- MCP tool: `grasp_patch_impact`
```
Input: { session_id, commits: string[] }
Output: { patches:[{sha, msg, files_changed, blast_radius, subsystems, review_priority}], series_summary }
```

---

## Phase 4 — Open Source Vertical (v3.7.0–v3.7.2)

### T10: GitHub App + Good First Issue Generator (v3.7.0)

**GitHub App (cross-cutting):**
- A GitHub App (separate deployment under `github-app/`) that registers webhooks for `push` and `pull_request` events
- On push to default branch: re-analyzes repo, updates health badge, posts summary as commit status
- On PR open/update: posts `grasp_pr_comment` output as a PR review comment automatically
- Configuration: `grasp.yml` in repo root (existing format) controls which checks run
- Self-hosted deployment via Docker (`docker-compose.github-app.yml`)
- Hosted option: `app.grasp.dev` (Phase 6)
- Files: `github-app/` directory (already exists as stub), webhook handler, analysis queue

**Good first issue generator:**
- Analyzes the codebase for ideal first-contribution targets: isolated files (fan-in ≤2), low complexity (<10 cyclomatic), no test counterpart (opportunity), not in active churn (stable)
- Generates GitHub issue draft: title, description, suggested approach, relevant files to read first
- UI: new "🌱 Good First Issues" button in ⋯ menu → opens modal with 3–5 suggestions
- "Create on GitHub" button (requires token, asks for explicit confirmation)
- MCP tool: `grasp_good_first_issues`

---

### T11: API Stability Score + Dependents-in-the-Wild (v3.7.1)

**API stability score:**
- For library authors: compares current session against a previous session (or tagged version)
- Computes: % of public API surface that is unchanged, % changed, % removed
- Score 0–100: 100 = zero breaking changes, 0 = complete rewrite of public API
- Shown as a badge-able score in the UI: "API Stability: 94/100 (2 additions, 0 removals)"
- Displayed in health score panel alongside existing health grade
- MCP tool: `grasp_api_stability`

**Dependents-in-the-wild:**
- Queries `https://api.deps.dev/v3alpha/package/npm/{name}` (free, no auth) for dependent count
- Also queries `https://libraries.io/api/npm/{name}/dependents` if Libraries.io key configured
- Shows: "247 public repos depend on this package" in health panel
- Identifies which of YOUR files are most imported by dependents (high fan-in from external = risky to change)
- MCP tool: `grasp_dependents`

---

### T12: Fork Divergence + OpenSSF Scorecard + Contributor Impact (v3.7.2)

**Fork divergence analysis:**
- Compares two sessions (fork vs upstream)
- Shows: files that diverged (exist in fork, different from upstream), files identical to upstream, files only in fork (net new), files removed from upstream not in fork
- Blast radius of merging upstream back: "Merging upstream into this fork would conflict in 14 files"
- MCP tool: `grasp_fork_diff`

**OpenSSF Scorecard integration:**
- Queries `https://api.securityscorecards.dev/projects/github.com/{owner}/{repo}` (free, no auth)
- Fetches: branch protection, code review, dependency update, signed releases, token permissions scores
- Combines with Grasp architecture health into a unified "Project Trust Score"
- Shown as a new card in the Issues/Suggestions tab
- MCP tool: result merged into `grasp_analyze` output (no separate tool needed)

**Contributor impact score:**
- Extends existing `grasp_contributors` with per-contributor impact:
  - Files touched weighted by complexity + fan-in
  - "High impact" = contributor owns files with fan-in >10 or complexity >20
  - "Bus factor" risk highlighted when one contributor owns >40% of high-impact files
- UI: Contributor tab sorted by impact score, bus-factor warning card
- MCP tool: extends `grasp_contributors` output (no separate tool)

---

## Phase 5 — ESA Part 2 (v3.8.0–v3.8.2)

### T13: Ada / SPARK Deep Support + Multi-Language Call Graph (v3.8.0)

**Ada / SPARK deep support:**
- Extends parser.js to handle `.adb` (Ada body), `.ads` (Ada spec) files
- Extracts: package declarations, procedures, functions, `pragma Import`/`Export` (C interface)
- Detects SPARK-specific patterns: `pragma SPARK_Mode`, `Pre`/`Post` contracts, `Ghost` functions
- Flags: `Ada.Unchecked_Conversion` (already in MISRA detector), `Ada.Unchecked_Deallocation`, task entries without `select...terminate`
- Adds Ada to the language breakdown in architecture view

**Multi-language call graph:**
- Detects cross-language call boundaries: Ada `pragma Import (C, fn_name)` → maps to a C function in the same session
- Python calling C via `ctypes`, `cffi`, `Cython`
- JavaScript calling Rust/Go via WebAssembly imports
- Renders cross-language edges in a distinct color (dashed, amber) in the dependency graph
- Flags: cross-language calls in safety-critical paths (where MISRA violations may not be caught across the boundary)
- MCP tool: `grasp_multilang`

---

### T14: Heritage Software Genealogy + ICD Mapper (v3.8.1)

**Heritage software genealogy:**
- User uploads a "heritage manifest" (JSON or CSV): `[{file, origin_mission, origin_version, delta_functions:[]}]`
- Grasp overlays heritage data on the graph: heritage files shown with a "🏛" badge
- Computes: heritage coverage % (what % of the codebase is reused vs new), delta complexity (new code added to heritage modules)
- Certification shortcut view: heritage files with zero delta → can reference prior qualification evidence
- `localStorage` key: `grasp_heritage_manifest`
- MCP tool: `grasp_heritage`

**ICD mapper:**
- User uploads an ICD (Interface Control Document) as CSV: `[{interface_id, name, provider_module, consumer_module, data_type, frequency}]`
- Grasp maps ICD entries to actual code: provider_module path → finds exported functions matching the interface name, consumer_module → finds import calls
- Flags: ICD entries with no code match (interface not implemented), code functions that match no ICD entry (undocumented interface), signature mismatches
- UI: new "📋 ICD" tab in right panel (alongside Compliance tab)
- MCP tool: `grasp_icd`

---

### T15: ECSS-E-ST-40C Compliance Checker + VS Code Extension (v3.8.2)

**ECSS-E-ST-40C compliance checker:**
- ESA's Software Engineering Standard. Key checkable rules:
  - DI-01: All software items must be uniquely identified (file headers with ID tags)
  - DI-04: Software items must have documented interfaces (functions without JSDoc/comment headers flagged)
  - DI-07: Test coverage must be documented (test file must exist for each software item)
  - DI-10: Circular dependencies forbidden (already detected, now classified as ECSS violation)
  - DI-15: Dead code not permitted in deliverable software (already detected)
- Output: ECSS compliance report with rule ID, status (pass/fail/warn), finding count per rule
- Extends Certification Export (T3) with an ECSS section
- MCP tool: `grasp_ecss`

**VS Code inline health extension (cross-cutting):**
- New extension under `vscode-extension/` (already exists as a stub wrapping the MCP server)
- Adds inline decorations: fan-in count shown next to imports, complexity shown next to function definitions, circular dep warning on files in a cycle
- Hover card: hovering an import shows the imported file's health summary (grade, top issues, blast radius)
- Status bar: "⬡ 87 B" — same as JetBrains plugin
- File-save re-analysis: triggers `grasp_watch` on save for watched extensions
- Build with `vsce package` from `vscode-extension/`

---

## Phase 6 — Grasp Cloud (v3.9.0–v3.9.3)

### T16: Persistent Session Storage Layer (v3.9.0)

**What it is:** Today sessions live in-memory and die on server restart. This adds a storage layer so sessions survive restarts and can be shared across a team.

**Design:**
- Storage backend: SQLite (zero-config, single file) with a JSON blob column per session
- Sessions table: `(id TEXT PRIMARY KEY, repo TEXT, created_at INTEGER, expires_at INTEGER, data BLOB)`
- Default TTL: 30 days (was 7 days in-memory)
- API: existing `grasp_sessions` tool now reads from SQLite, `grasp_analyze` writes to SQLite
- Migration: existing in-memory sessions are flushed to SQLite on server start
- Config: `--db=./grasp.db` CLI flag, defaults to `~/.grasp/sessions.db`

---

### T17: GitHub OAuth + Org Workspace (v3.9.1)

**GitHub OAuth:**
- `GET /auth/github` → redirects to GitHub OAuth
- `GET /auth/github/callback` → exchanges code for token, stores user identity in session cookie
- Scopes: `read:user`, `read:org` (to validate org membership)
- Protected routes: `POST /analyze` requires auth in cloud mode; public read access without auth

**Org workspace:**
- Organizations can register their GitHub org: all repos in the org auto-appear in the org workspace
- Workspace state (repo list, tags, notes, ownership) persisted to SQLite (extends team-dashboard sync from v3.3.19)
- Role model: `owner` (full access), `member` (read + analyze), `viewer` (read-only)
- Per-repo access control: mark repos as private (only org members) or public

---

### T18: Billing Tier + SaaS API (v3.9.2)

**Billing:**
- Free tier: 3 repos, 7-day history, no org workspace
- Pro tier ($49/mo): unlimited repos, 90-day history, org workspace, compliance REST API, GitHub App hosted
- Enterprise tier (custom): SSO, audit log, on-premise option, SLA
- Billing via Stripe Checkout (hosted payment page — no card handling in Grasp code)
- Entitlement check middleware on analysis routes

**SaaS API:**
- `POST /api/v1/analyze` — queued analysis, returns job ID
- `GET /api/v1/jobs/:id` — poll job status
- `GET /api/v1/sessions` — list org sessions
- `GET /report/*` endpoints (from T6) now gated by Pro tier
- API key auth: `X-Grasp-Key: grsp_...` header

---

### T19: CI Webhooks + Hosted Auto-Analysis (v3.9.3)

**CI webhooks:**
- GitHub App (from T10) connects to the hosted Grasp Cloud backend
- Every push to default branch → queued analysis → health badge updated → Slack/Teams alert if health drops
- PR webhook → `grasp_pr_comment` posted automatically (no manual trigger)
- Webhook delivery log in org workspace dashboard

**Hosted auto-analysis:**
- `app.grasp.dev` — the hosted Grasp Cloud instance
- Users connect their GitHub org → all repos auto-analyzed on a schedule (daily for Pro, weekly for Free)
- Historical health trend: 90-day chart per repo (Pro)
- Public health badges: `https://app.grasp.dev/badge/{owner}/{repo}` — embeddable in READMEs

---

## Architecture Notes

### Existing patterns to extend
- All new MCP tools: `server.registerTool(name, {inputSchema, title, description, annotations}, handler)` — same pattern as existing 48 tools
- New right-panel tabs: follow existing tab button + content block pattern
- New color modes: add to `colorMode` state + color mapping logic + legend
- New Issues sections: extend existing issues array with `type` field
- Content availability: all new analysis functions that need file content run BEFORE `data.files.forEach(f => f.content = null)` at line 5192 of index.html

### New infrastructure introduced
| Phase | New infrastructure |
|-------|-------------------|
| v3.4.0 | Multi-session graph merge algorithm |
| v3.5.2 | HTTP REST endpoints on the CLI server |
| v3.7.0 | GitHub App webhook handler |
| v3.9.0 | SQLite session storage |
| v3.9.1 | GitHub OAuth + session cookies |
| v3.9.2 | Stripe Checkout integration |

### MCP tool count
- Current: 48 tools
- After Phase 1: +4 = 52 tools
- After Phase 2: +4 = 56 tools
- After Phase 3: +4 = 60 tools
- After Phase 4: +4 = 64 tools
- After Phase 5: +4 = 68 tools
- After Phase 6: no new MCP tools (cloud is server-side)
- **Final: 68 tools**

### Files NOT bumped per version
Per CLAUDE.md: `shared/`, `ai-tools/`, `saas/`, `github-app/`, `slack-bot/` stay on `1.0.0`.

---

## Release Plan Summary

| Version | Key deliverable |
|---------|----------------|
| v3.4.0 | Org-level multi-repo graph — 50+ repos, unified view |
| v3.4.1 | Breaking API change detector, Plugin extension-point map |
| v3.4.2 | Semantic versioning enforcer |
| v3.5.0 | PII data flow tracer, Separation of duties validator |
| v3.5.1 | Regulatory change impact mapper, Latency hotspot detection |
| v3.5.2 | Model risk audit, Compliance REST API |
| v3.6.0 | Kernel subsystem map, ABI stability checker (universal) |
| v3.6.1 | Kconfig analysis, IRQ dependency graph |
| v3.6.2 | Patch series impact |
| v3.7.0 | GitHub App auto-analysis, Good first issue generator |
| v3.7.1 | API stability score, Dependents-in-the-wild |
| v3.7.2 | Fork divergence, OpenSSF Scorecard, Contributor impact |
| v3.8.0 | Ada/SPARK deep support, Multi-language call graph |
| v3.8.1 | Heritage software genealogy, ICD mapper |
| v3.8.2 | ECSS-E-ST-40C compliance, VS Code inline health |
| v3.9.0 | Grasp Cloud — persistent SQLite session storage |
| v3.9.1 | GitHub OAuth, org workspace, role-based access |
| v3.9.2 | Billing tiers, SaaS API, Stripe Checkout |
| v3.9.3 | CI webhooks, hosted auto-analysis, app.grasp.dev |
