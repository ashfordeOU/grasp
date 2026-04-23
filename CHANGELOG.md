# Changelog

All notable changes to Grasp are documented here.

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
- **Self-hosted GitLab support:** paste `gitlab.esa.int/org/repo` (or any custom instance URL) in the popup — parsed correctly, opens Grasp with the right host
- **"Enable Grasp on this site" button:** when opened on a custom Git host (ESA GitLab, GitHub Enterprise, Gitea, etc.), popup detects the hostname and offers a one-click permission grant; after approval, the floating Grasp button is injected immediately AND registered for all future visits to that host
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
