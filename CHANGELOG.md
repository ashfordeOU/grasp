# Changelog

All notable changes to Grasp are documented here.

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
