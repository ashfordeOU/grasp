# Design: Grasp Integrations Expansion
Date: 2026-04-19
Goal: Build all 32 integrations across 10 phases, fully verified end-to-end
Architecture: Monorepo for all logic; thin companion repos where platforms mandate it (Homebrew tap, Raycast store)
Tech stack: TypeScript (Node.js integrations), Lua (Vim), Elisp (Emacs), Kotlin (Eclipse), WASM/TS (Zed), Jest (unit/integration), Playwright (browser extensions), Docker (test infrastructure)

---

## Testing Strategy

**Tier A — Fully Automated E2E** (runs in CI, no secrets, no live platforms):
- Unit tests: Jest, per-integration, mock all external APIs
- Integration tests: mock servers (MSW / nock) for all HTTP APIs
- E2E tests: Docker-based real infrastructure where applicable (Gitea, Jenkins, headless Chrome)
- All tests run on every PR via GitHub Actions

**Tier B — Automated + Manual Verification Checklist**:
- Automated: all logic, API calls, formatting, output
- Manual checklist (documented in each integration's README): marketplace submission, OAuth consent flows, live bot registration, store approval steps
- Checklist is the "definition of done" gate before shipping

---

## Shared Infrastructure (built once, used everywhere)

### Mock Server (`test-utils/mock-server/`)
- MSW-based mock server for all external APIs (GitHub, GitLab, Bitbucket, Azure, Jira, Linear, Slack, Teams, Discord)
- Shared across all integration test suites
- Runs in-process — no network calls in CI

### Docker Test Compose (`test-utils/docker-compose.test.yml`)
- `gitea` — self-hosted Git for Gitea/Forgejo tests
- `jenkins` — Jenkins for CI/CD tests
- `wiremock` — HTTP mock for any remaining external calls
- Used only by integrations that need real server infrastructure

### Grasp Test Fixtures (`test-utils/fixtures/`)
- Sample analysis results (JSON) for 5 repo sizes: tiny, small, medium, large, monorepo
- Reused across all integration tests so every integration tests with realistic data

### CI Matrix (`.github/workflows/integrations.yml`)
- Runs per-phase on PR + push to main
- macOS runner for Homebrew, Ubuntu for Docker/Linux
- Playwright runner for browser extensions
- Each integration is an independent job — failures don't block others

---

## Phase 1 — Distribution Foundation

### 1A: Homebrew Formula
**Directory**: companion repo `homebrew-grasp` (Homebrew requires its own tap repo)
**What it does**: `brew tap ashfordeou/grasp && brew install grasp`
**Implementation**:
- Formula file `Formula/grasp.rb` pointing to npm package tarball
- Version auto-updates via GitHub Action on every npm publish
**Tests (Tier A)**:
- `brew audit --strict Formula/grasp.rb` in CI on macOS runner
- `brew install --build-from-source` smoke test
- `grasp --version` output assertion
**Manual checklist**: Submit tap to Homebrew community (optional, not required for tap to work)

### 1B: Docker Image
**Directory**: `docker/`
**What it does**: `docker run ashfordeou/grasp analyze owner/repo`
**Implementation**:
- `Dockerfile` — Node 20 Alpine, installs `grasp-mcp-server` globally
- `docker-compose.yml` for local dev
- Published to Docker Hub + GitHub Container Registry (ghcr.io) on tag push
- Multi-arch: `linux/amd64`, `linux/arm64`
**Tests (Tier A)**:
- Build image in CI, run `docker run grasp --version`
- Run `docker run grasp analyze` against mock server
- Container structure tests (container-structure-test)
**Manual checklist**: Verify Docker Hub listing, description, tags

---

## Phase 2 — CI/CD Integrations

All CI/CD integrations use the Docker image from Phase 1 as the runner.

### 2A: GitHub Actions Marketplace Action
**Directory**: `github-action/`
**What it does**: Posts Grasp health report as PR comment, fails build if grade < threshold
**Implementation**:
- `action.yml` — composite action wrapping Docker image
- Inputs: `token`, `threshold` (A–F), `post-comment` (bool), `fail-on-grade`
- Output: `health-score`, `health-grade`, `report-url`
- Posts formatted markdown comment via GitHub API
**Tests (Tier A)**:
- Unit: action logic, comment formatting, grade comparison
- E2E: use `nektos/act` to run the action locally against mock GitHub API
**Manual checklist**: Submit to GitHub Marketplace, add `action.yml` badge metadata

### 2B: GitLab CI Component
**Directory**: `gitlab-ci-component/`
**What it does**: Reusable GitLab CI/CD component — adds Grasp analysis job to any pipeline
**Implementation**:
- `template.yml` — GitLab CI component spec
- Published to GitLab.com component catalog
- Posts MR comment via GitLab API
**Tests (Tier A)**:
- Validate YAML schema
- Unit tests for comment formatting
- Mock GitLab API integration tests
**Manual checklist**: Publish to GitLab CI Catalog

### 2C: Bitbucket Pipelines Pipe
**Directory**: `bitbucket-pipe/`
**What it does**: Bitbucket Pipelines pipe — runs Grasp and posts PR comment
**Implementation**:
- `pipe.yml` + `Dockerfile` (Bitbucket pipes are Docker-based)
- Posts to Bitbucket PR comments API
**Tests (Tier A)**:
- Unit + mock Bitbucket API tests
- Docker build + run smoke test
**Manual checklist**: Submit to Bitbucket Pipelines marketplace

### 2D: CircleCI Orb
**Directory**: `circleci-orb/`
**What it does**: Reusable CircleCI orb with `grasp/analyze` job and `grasp/check` command
**Implementation**:
- Orb YAML: executor (Docker image), `analyze` job, `check` command
- Published to CircleCI Orb Registry
**Tests (Tier A)**:
- circleci orb validate
- Unit tests with circleci local CLI
**Manual checklist**: Publish orb, verify registry listing

### 2E: Jenkins Plugin
**Directory**: `jenkins-plugin/`
**What it does**: Jenkins build step that runs Grasp and publishes health report to build page
**Implementation**:
- Java/Groovy plugin using Jenkins Plugin POM
- Build step + post-build publisher
- Runs Grasp CLI via Docker or npm
**Tests (Tier A)**:
- JUnit tests for plugin logic
- Jenkins Test Harness (JTH) integration tests
- Spin up Jenkins in Docker, install plugin, run pipeline
**Manual checklist**: Submit to Jenkins Update Center

---

## Phase 3 — Communication Bots

### 3A: Microsoft Teams Bot
**Directory**: `teams-bot/`
**What it does**: Adaptive Card digest with health scores, per-repo drill-down, scheduled delivery
**Implementation**:
- Bot Framework SDK (TypeScript)
- Adaptive Cards for rich formatting
- Same scheduler/digest logic as `slack-bot/` — shared `digest-engine/` module extracted
- Azure Bot Service registration required for production
**Tests (Tier A)**:
- Unit: Adaptive Card rendering, scheduler logic
- Integration: mock Bot Framework API
- E2E: Bot Framework Emulator (local, no Azure needed)
**Manual checklist**: Register bot in Azure Portal, add to Teams app store

### 3B: Discord Bot
**Directory**: `discord-bot/`
**What it does**: `/grasp analyze owner/repo` slash command, health score embeds, scheduled digest
**Implementation**:
- discord.js (TypeScript)
- Slash commands + rich embeds
- Shares digest engine with slack-bot and teams-bot
**Tests (Tier A)**:
- Unit: embed formatting, command parsing
- Integration: discord.js mock client
- E2E: discord.js test utilities
**Manual checklist**: Register application in Discord Developer Portal, submit to app directory

---

## Phase 4 — Code Hosting Expansion

All three add support to the existing `mcp/src/analyzer.ts` and `mcp/src/sources/` pattern.

### 4A: Bitbucket Repository Support
**Directory**: `mcp/src/sources/bitbucket.ts`
**What it does**: Analyse bitbucket.org repos using Bitbucket Cloud REST API
**Implementation**:
- `BitbucketSource` class matching existing `GithubSource` interface
- App Password auth (Bitbucket equivalent of PAT)
- File tree + content fetching via Bitbucket API v2
**Tests (Tier A)**:
- Unit: API mapping, auth
- Integration: MSW mock of Bitbucket API v2
- E2E: public Bitbucket repo analysis end-to-end

### 4B: Azure DevOps / Azure Repos
**Directory**: `mcp/src/sources/azure.ts`
**What it does**: Analyse Azure Repos using Azure DevOps REST API
**Implementation**:
- `AzureSource` class — PAT auth, file tree + content via Azure DevOps API
- Supports `dev.azure.com/org/project/_git/repo` URL format
**Tests (Tier A)**:
- Unit + MSW mock of Azure DevOps API
- E2E: public Azure DevOps repo

### 4C: Gitea / Forgejo
**Directory**: `mcp/src/sources/gitea.ts`
**What it does**: Analyse self-hosted Gitea/Forgejo instances
**Implementation**:
- `GiteaSource` class — configurable base URL, token auth, Gitea API v1
- Works with both Gitea and Forgejo (compatible APIs)
**Tests (Tier A)**:
- Unit tests
- E2E: spin up Gitea in Docker (`docker-compose.test.yml`), push test repo, run full analysis

---

## Phase 5 — Browser Extensions

### 5A: Chrome Extension
**Directory**: `browser-extension/`
**What it does**: Sidebar panel on github.com/owner/repo showing live Grasp graph, health score, security issues
**Implementation**:
- Manifest V3
- Content script detects GitHub repo pages, injects sidebar
- Calls local `grasp-mcp-server` (if running) or GitHub API directly
- Shared renderer with `index.html` (D3 graph component extracted to `shared/graph/`)
**Tests (Tier A)**:
- Unit: content script logic, message passing
- E2E: Playwright with `--load-extension` flag against mock GitHub pages
**Manual checklist**: Submit to Chrome Web Store, pay one-time $5 developer fee

### 5B: Firefox Extension
**Directory**: `browser-extension/` (same codebase, Manifest V2/V3 compatible build)
**What it does**: Same as Chrome extension, Firefox-compatible
**Implementation**:
- Build flag for Firefox (`web-ext build`)
- `browser_specific_settings` in manifest
**Tests (Tier A)**:
- Playwright Firefox driver with extension loaded
**Manual checklist**: Submit to Firefox Add-ons (addons.mozilla.org)

---

## Phase 6 — Raycast Extension

**Directory**: companion repo `raycast-grasp` (Raycast Store requires own repo)
**What it does**: `Analyse Repo` command — paste owner/repo, get health score + open graph in browser
**Implementation**:
- Raycast Extensions API (TypeScript + React)
- Calls local `grasp-mcp-server` or GitHub API
- Commands: `Analyze Repository`, `Open in Browser`, `Show Health Score`
**Tests (Tier A)**:
- `@raycast/utils` test utilities
- Jest unit tests for all commands
**Manual checklist**: Submit to Raycast Store via PR to `raycast-extensions` repo

---

## Phase 7 — AI / Agent Platforms

### 7A: Continue.dev Context Provider
**Directory**: `continue-provider/`
**What it does**: Grasp context provider for Continue.dev — surfaces dep graph, hotspots, and health score as AI context
**Implementation**:
- `CustomContextProvider` implementing Continue.dev context provider interface
- Packaged as a Continue.dev extension
- Calls local `grasp-mcp-server`
**Tests (Tier A)**:
- Unit: context formatting, provider interface
- Integration: mock Continue.dev context protocol

### 7B: GitHub Copilot Extension
**Directory**: `copilot-extension/`
**What it does**: `@grasp analyse this repo` in Copilot Chat — returns architecture summary and health score
**Implementation**:
- GitHub Copilot Extensions API (skillset + agent mode)
- OAuth App for user auth
- Calls Grasp analysis engine
**Tests (Tier A)**:
- Unit: message handling, response formatting
- Integration: mock Copilot Extensions API
**Manual checklist**: Register in GitHub Developer settings, submit for Copilot marketplace review

### 7C: OpenAI GPT Actions
**Directory**: `gpt-actions/`
**What it does**: Custom GPT with Grasp tools — users ask ChatGPT to analyse repos
**Implementation**:
- OpenAPI 3.1 spec (`openapi.yaml`) for all Grasp endpoints
- Lightweight Express server wrapping the MCP tools as REST endpoints
- Deployed as serverless function (Vercel/Cloudflare Workers)
**Tests (Tier A)**:
- OpenAPI spec validation
- Unit: endpoint handlers
- Integration: mock server against spec
**Manual checklist**: Create GPT in ChatGPT builder, publish to GPT Store

### 7D: Amazon Q Developer
**Directory**: `amazon-q-plugin/`
**What it does**: Amazon Q Developer plugin — `/grasp` command in Q chat
**Implementation**:
- Amazon Q Developer Extensions API
- Calls Grasp analysis engine
**Tests (Tier A)**:
- Unit: command handling, response formatting
- Integration: mock Amazon Q API
**Manual checklist**: Publish to AWS Marketplace Extensions

---

## Phase 8 — IDE / Editors

### 8A: Zed Extension
**Directory**: `zed-extension/`
**What it does**: Dep graph + health score panel in Zed, file hover showing dep count
**Implementation**:
- Zed Extension API (WASM + TypeScript)
- Language Server Protocol for hover data
- WebView panel for graph rendering
**Tests (Tier A)**:
- Zed extension test harness
- Unit: LSP response formatting
**Manual checklist**: Submit to Zed Extension Registry

### 8B: Vim Plugin
**Directory**: `vim-plugin/`
**What it does**: `:GraspAnalyze`, `:GraspDeps`, `:GraspHealth` commands; statusline integration
**Implementation**:
- Pure Vimscript + optional Lua (for Neovim compatibility)
- Calls `grasp-mcp-server` via job/async
- Separate from `neovim-plugin/` — targets Vim 8+ plugin managers (vim-plug, Vundle, Pathogen)
**Tests (Tier A)**:
- Vader.vim test framework (headless Vim)
- Run in Docker with Vim installed
**Manual checklist**: Submit to vim.org scripts, add to awesome-vim

### 8C: Emacs Package
**Directory**: `emacs-package/`
**What it does**: `M-x grasp-analyze`, `M-x grasp-show-deps`, minor mode for health indicator in modeline
**Implementation**:
- Emacs Lisp package (`.el`)
- Calls `grasp-mcp-server` via `make-process`
- `grasp-mode` minor mode
- Published to MELPA
**Tests (Tier A)**:
- ERT (Emacs Regression Test) framework
- Run headless Emacs in Docker
**Manual checklist**: Submit PR to MELPA repo

### 8D: Eclipse Plugin
**Directory**: `eclipse-plugin/`
**What it does**: Eclipse view showing dep graph + health score, Problems integration for arch violations
**Implementation**:
- Eclipse Plugin Development Environment (PDE), Java
- OSGi bundle
- Calls `grasp-mcp-server` via ProcessBuilder
- Eclipse Marketplace listing
**Tests (Tier A)**:
- JUnit + SWTBot for UI testing
- Headless Eclipse in Docker
**Manual checklist**: Submit to Eclipse Marketplace

---

## Phase 9 — Issue Trackers

### 9A: Linear Integration
**Directory**: `linear-integration/`
**What it does**: Creates Linear issues for Grasp health violations; links issues to files; syncs health score as a property
**Implementation**:
- Linear SDK (TypeScript)
- Webhook listener for new violations
- OAuth App for user auth
- Configurable: which issue types to create, which team to assign
**Tests (Tier A)**:
- Unit: issue formatting, webhook parsing
- Integration: MSW mock of Linear GraphQL API
- E2E: mock Linear workspace end-to-end flow

### 9B: Jira Integration
**Directory**: `jira-integration/`
**What it does**: Creates Jira tickets for health violations; Jira panel showing file health; SARIF import
**Implementation**:
- Atlassian Forge (runs on Atlassian infrastructure) or Connect app
- Jira REST API v3
- Custom field: Grasp Health Score on issues mentioning a file
**Tests (Tier A)**:
- Unit: ticket formatting, field mapping
- Integration: MSW mock of Jira REST API
- E2E: Jira Cloud sandbox (Atlassian provides free dev instances)
**Manual checklist**: Submit to Atlassian Marketplace

---

## Phase 10 — AI Coding Tool Integrations (10 tools)

All ten tools below support MCP servers or MCP-compatible tool protocols. The work for each is:
1. Verified config snippet + setup guide
2. Compatibility test against Grasp's 48 MCP tools
3. Submission to any per-tool registry/gallery

**10A — Claude Code**
`ai-tools/claude-code/`
- `.claude/mcp.json` config snippet, `README.md` with setup instructions
- Already works via `grasp-mcp-server`; formal listing in Claude Code plugin registry
- Test: `claude mcp list` shows grasp-mcp-server; tool invocation smoke test via MCP inspector
- **Manual checklist**: Submit to Claude Code MCP registry

**10B — Cursor**
`ai-tools/cursor/`
- `.cursor/mcp.json` config snippet + guide for Settings → MCP
- Cursor supports MCP natively (since 0.43); all 48 tools callable from Cursor agent
- Test: MSW mock + MCP Inspector verify all tool schemas parse cleanly under Cursor's client
- **Manual checklist**: Submit to cursor.directory or Cursor MCP listings

**10C — Cline**
`ai-tools/cline/`
- VS Code settings snippet to register `grasp-mcp-server` as MCP provider
- Cline uses MCP over stdio; test with `@modelcontextprotocol/inspector`
- Test: unit test tool schema validation; E2E: Cline + VSCode headless via Playwright
- **Manual checklist**: Submit to Cline's MCP marketplace listing

**10D — Roo Code**
`ai-tools/roo-code/`
- Same config pattern as Cline (Roo Code is a Cline fork, same MCP protocol)
- Shared test suite with Cline — parameterised to run against both
- **Manual checklist**: List on Roo Code's integration page

**10E — Kilo Code**
`ai-tools/kilo-code/`
- MCP config snippet for Kilo Code settings
- Kilo Code MCP protocol compatibility test
- **Manual checklist**: Submit to Kilo Code extension registry

**10F — OpenCode**
`ai-tools/opencode/`
- OpenCode supports MCP via `opencode.json` config
- Config snippet + guide; smoke test via MCP inspector
- **Manual checklist**: Submit to OpenCode integrations list

**10G — Trae**
`ai-tools/trae/`
- Trae (ByteDance AI IDE) supports MCP; config via Settings → MCP Servers
- `trae-mcp.json` config snippet + setup guide
- Test: schema validation + MSW integration test
- **Manual checklist**: Submit to Trae plugin store

**10H — Grok CLI**
`ai-tools/grok-cli/`
- xAI Grok CLI supports MCP tool calls; config via `~/.grok/mcp.json`
- Config snippet + guide; tool smoke tests
- **Manual checklist**: List in Grok CLI documentation / integration showcase

**10I — Codex CLI**
`ai-tools/codex-cli/`
- OpenAI Codex CLI supports MCP (`~/.codex/config.json` tools section)
- Config snippet + guide; integration test verifying all 48 tool schemas
- **Manual checklist**: Submit to OpenAI plugin / MCP listings

**10J — Droid**
`ai-tools/droid/`
- Droid AI coding tool MCP integration
- Config snippet + compatibility test
- **Manual checklist**: List on Droid integrations page

**Shared test harness** (`ai-tools/shared/`):
- `mcp-compat-test.ts` — parameterised test that verifies all 48 tool schemas parse correctly for any MCP client config. Run once per tool.
- `mcp-inspector-smoke.sh` — script to spin up grasp-mcp-server and run inspector against it

---

## Repository Structure

```
grasp/                          # main monorepo
├── mcp/                        # existing — MCP server (48 tools)
├── vscode-extension/           # existing
├── jetbrains-plugin/           # existing
├── slack-bot/                  # existing
├── github-app/                 # existing
├── neovim-plugin/              # existing
├── docker/                     # NEW Phase 1B
├── github-action/              # NEW Phase 2A
├── gitlab-ci-component/        # NEW Phase 2B
├── bitbucket-pipe/             # NEW Phase 2C
├── circleci-orb/               # NEW Phase 2D
├── jenkins-plugin/             # NEW Phase 2E
├── teams-bot/                  # NEW Phase 3A
├── discord-bot/                # NEW Phase 3B
├── browser-extension/          # NEW Phase 5 (Chrome + Firefox)
├── continue-provider/          # NEW Phase 7A
├── copilot-extension/          # NEW Phase 7B
├── gpt-actions/                # NEW Phase 7C
├── amazon-q-plugin/            # NEW Phase 7D
├── zed-extension/              # NEW Phase 8A
├── vim-plugin/                 # NEW Phase 8B
├── emacs-package/              # NEW Phase 8C
├── eclipse-plugin/             # NEW Phase 8D
├── linear-integration/         # NEW Phase 9A
├── jira-integration/           # NEW Phase 9B
├── shared/                     # NEW — shared graph renderer, digest engine, mock server
│   ├── graph/                  # D3 graph component (extracted from index.html)
│   ├── digest-engine/          # shared scheduler/formatter (slack-bot + teams-bot + discord-bot)
│   └── test-utils/             # mock server, fixtures, Docker compose
├── ai-tools/                   # NEW Phase 10 — AI coding tool integrations
│   ├── claude-code/            # Phase 10A
│   ├── cursor/                 # Phase 10B
│   ├── cline/                  # Phase 10C
│   ├── roo-code/               # Phase 10D
│   ├── kilo-code/              # Phase 10E
│   ├── opencode/               # Phase 10F
│   ├── trae/                   # Phase 10G
│   ├── grok-cli/               # Phase 10H
│   ├── codex-cli/              # Phase 10I
│   ├── droid/                  # Phase 10J
│   └── shared/                 # mcp-compat-test.ts, mcp-inspector-smoke.sh
└── .github/workflows/
    └── integrations.yml        # NEW — per-phase CI matrix

# Companion repos (thin wrappers, auto-updated from main repo):
homebrew-grasp/                 # Homebrew tap (Phase 1A)
raycast-grasp/                  # Raycast Store (Phase 6)
```

---

## Definition of Done (per integration)

- [ ] All unit tests pass (Jest / JUnit / ERT / Vader)
- [ ] All integration tests pass against mock APIs
- [ ] E2E test passes in CI (Docker / Playwright / act / headless)
- [ ] Manual verification checklist completed and signed off (Tier B items)
- [ ] `README.md` with install instructions, config options, screenshots
- [ ] Added to root `README.md` integrations table
- [ ] CI job green on main branch
- [ ] Published / submitted to relevant marketplace/store
