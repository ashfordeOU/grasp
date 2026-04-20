# Design: GitLab Full Parity
Date: 2026-04-20
Goal: Full feature parity between GitHub and GitLab (cloud + self-hosted) across MCP analysis, automated bot, SaaS API, and all deployment models
Architecture: Three parallel workstreams — analysis engine, bot server, SaaS/auth — plus a tunnel agent for internal GitLab deployments
Tech stack: TypeScript (MCP, bot, SaaS), Go (tunnel agent), Docker Compose (self-hosted), WebSocket (tunnel protocol)

---

## Problem Statement

Grasp today is GitHub-first. GitLab support exists in the MCP server but is incomplete:
- Churn/git history always returns 0 (GitLab Commits API never called)
- No ownership data (Blame API not used)
- No CI status (Pipelines API not integrated)
- No MR comment posting (no bot server for GitLab)
- No webhook support (no event-driven re-analysis)
- SaaS API rejects GitLab URLs entirely
- No OAuth2 flow (PRIVATE-TOKEN only)
- CLI has no `--gitlab-host` flag or `GITLAB_TOKEN` env var

Companies with internal GitLab instances (the primary enterprise use case) get partial analysis and zero automation.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  GRASP GITLAB PARITY                │
├──────────────────┬──────────────────┬───────────────┤
│  1. MCP / CLI    │  2. Bot Server   │  3. SaaS API  │
│  Full analysis   │  Webhooks + MRs  │  GitLab URLs  │
│  parity w/GitHub │  + CI status     │  + OAuth2     │
└──────────────────┴──────────────────┴───────────────┘
            +
┌─────────────────────────────────────────────────────┐
│              4. DEPLOYMENT OPTIONS                  │
├──────────────┬──────────────────┬───────────────────┤
│  Self-hosted │  Cloud-hosted    │  Tunnel agent     │
│  Docker      │  grasp.io        │  (internal → out) │
└──────────────┴──────────────────┴───────────────────┘
```

---

## Workstream 1: MCP / CLI Analysis Parity

### Gaps to close

| Gap | Root cause | Fix |
|---|---|---|
| Churn always 0 | `fetchChurn` hardcoded to return 0 | Call GitLab Commits API per file |
| No ownership | Blame API never called | Call `/repository/files/{path}/blame` |
| No CI status | Pipelines API not integrated | Call `/projects/{id}/pipelines?ref=main` |
| No issues mapping | GitLab Issues API never called | Call `/projects/{id}/issues` |
| PRIVATE-TOKEN only | Single header type | Support both `PRIVATE-TOKEN` and `Authorization: Bearer` |
| CLI ignores GITLAB_TOKEN | Not in CLI arg parser | Add `GITLAB_TOKEN` env var + `--gitlab-host` flag |
| 200 file limit | Hardcoded 2 pages | Configurable, default 5 pages (500 files) |

### Self-hosted config interface

```bash
# Environment variables (clean, no code changes)
GITLAB_TOKEN=glpat-xxx
GITLAB_HOST=gitlab.internal.company.com   # optional, defaults to gitlab.com

# Or inline via MCP
grasp_analyze("gitlab.internal.company.com/team/repo", token="glpat-xxx")

# CLI
npx grasp analyze gitlab.internal.company.com/team/repo --gitlab-host=gitlab.internal.company.com
```

### Files changed
- `mcp/src/sources/gitlab.ts` — add fetchChurn, fetchBlame, fetchPipelines, fetchIssues; dual-header auth; configurable pagination
- `mcp/src/cli.ts` — add GITLAB_TOKEN env var, --gitlab-host flag

---

## Workstream 2: GitLab Bot Server (`gitlab-app/`)

Parallel to `github-app/`. Handles bidirectional communication between GitLab and Grasp.

### Incoming webhooks (GitLab → Grasp)

| Event | Action |
|---|---|
| Push Hook | Re-analyze changed files, update commit status |
| Merge Request Hook | Analyze MR files, post health comment to MR |
| Pipeline Hook | Correlate CI results with Grasp health |

Webhook verified via `X-Gitlab-Token` secret header.

### Outgoing API calls (Grasp → GitLab)

| Action | API endpoint |
|---|---|
| Post MR comment | `POST /api/v4/projects/{id}/merge_requests/{iid}/notes` |
| Update commit status | `POST /api/v4/projects/{id}/statuses/{sha}` |
| Fetch MR diff | `GET /api/v4/projects/{id}/merge_requests/{iid}/changes` |

### Bot auth
- GitLab OAuth2 Application (registered on their GitLab instance or gitlab.com)
- Bot holds OAuth2 access_token + refresh_token
- Auto-refreshes tokens before expiry

### Three deployment paths

**Option A — Self-hosted Docker (enterprises with internal GitLab)**
```yaml
# deploy/docker-compose.gitlab.yml
services:
  grasp-gitlab-bot:
    image: ghcr.io/ashfordeou/grasp-gitlab-bot:latest
    environment:
      GITLAB_HOST: gitlab.internal.company.com
      GITLAB_TOKEN: glpat-xxx
      WEBHOOK_SECRET: changeme
      PORT: 7332
    ports:
      - "7332:7332"
```
Company configures GitLab webhook to `http://grasp-gitlab-bot:7332/webhook`.

**Option B — Cloud + tunnel agent (internal GitLab, no inbound ports)**
```bash
# Lightweight agent — single binary, deployed internally
./grasp-agent --token=<agent-token> --gitlab-host=gitlab.internal.company.com
```
- Agent opens outbound WebSocket to Grasp cloud
- Cloud receives webhooks, forwards through tunnel to agent
- Agent posts back to internal GitLab API
- No inbound firewall rules required

**Option C — Cloud only (gitlab.com or internet-facing self-hosted)**
- Register `https://bot.grasp.dev/webhook` as GitLab webhook URL
- Works for gitlab.com and any publicly reachable instance

### MR comment format
Same format as GitHub PR comments — health score, grade, blast radius table, security findings, issue delta.

---

## Workstream 3: SaaS API + OAuth2

### SaaS API changes (`saas/`)

`normalizeRepo()` extended to accept:
- `https://gitlab.com/owner/repo`
- `https://gitlab.internal.company.com/group/subgroup/repo`
- `gitlab:owner/repo` shorthand
- Optional `gitlab_host` request parameter for self-hosted

### OAuth2 flow

```
User → "Connect GitLab" button
  → redirect to {gitlab_host}/oauth/authorize?client_id=...&scope=api+read_user
  → user approves
  → redirect back with code
  → exchange code for access_token + refresh_token
  → store per-user, auto-refresh on expiry
```

Works identically for gitlab.com and any self-hosted instance — just swap `gitlab_host`.

### index.html UI changes
- Auth section: GitHub / GitLab toggle
- GitLab: PRIVATE-TOKEN paste field **or** "Connect via OAuth" button
- Custom host field (blank = gitlab.com)
- URL input accepts GitLab formats

---

## Workstream 4: Tunnel Agent (`gitlab-agent/`)

Lightweight Go binary (~5MB, single static binary, zero dependencies).

### Protocol
```
[Internal GitLab] → webhook POST → [Grasp Agent] ──WebSocket──▶ [Grasp Cloud]
[Grasp Cloud] ──WebSocket──▶ [Grasp Agent] → POST → [Internal GitLab API]
```

### Agent behavior
- Outbound WebSocket connection only — no inbound ports
- Authenticated with per-customer agent token (issued from Grasp dashboard)
- Auto-reconnects on disconnect with exponential backoff
- Forwards webhook payloads to cloud, receives API call instructions back
- Runs as: Docker container, systemd service, or bare binary

### Deployment
```bash
# Docker
docker run ghcr.io/ashfordeou/grasp-agent:latest \
  --token=gsp-agent-xxx \
  --gitlab-host=gitlab.internal.company.com

# Bare binary
./grasp-agent --token=gsp-agent-xxx --gitlab-host=gitlab.internal.company.com

# systemd (provided as template)
systemctl enable grasp-agent
```

---

## Component Summary

| Component | Type | Effort |
|---|---|---|
| `mcp/src/sources/gitlab.ts` | Extended | Medium |
| `mcp/src/cli.ts` | Extended | Small |
| `gitlab-app/` bot server | New (TypeScript) | Large |
| `gitlab-agent/` tunnel binary | New (Go) | Medium |
| `saas/` GitLab routing + OAuth2 | Extended | Medium |
| `deploy/docker-compose.gitlab.yml` | New | Small |
| `index.html` GitLab auth UI | Extended | Small |

---

## What does NOT change

- `github-app/` — untouched, GitHub path unchanged
- Existing `gitlab-ci-component/` — kept as-is, still works
- Core analysis engine — same engine, just more data sources fed into it
- MCP tool API surface — same tools, same parameters, same output shape

---

## Success Criteria

1. `grasp_analyze("gitlab.internal.company.com/team/repo", token="glpat-xxx")` returns full analysis including real churn, ownership, CI status — identical output shape to a GitHub analysis
2. MR comments are posted automatically when a merge request is opened against a monitored repo
3. Commit status updates appear in GitLab pipeline view
4. Self-hosted bot works with `docker compose up` — zero additional config
5. Tunnel agent connects, receives a test webhook, forwards it successfully
6. `saas/` API accepts GitLab URLs and returns analysis
7. OAuth2 flow completes for both gitlab.com and a self-hosted instance
8. `index.html` accepts GitLab URLs and custom host with token auth
