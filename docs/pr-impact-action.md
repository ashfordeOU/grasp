# Grasp PR Impact Action

Automatically analyse the architectural impact of every pull request and post a structured comment showing blast radius, affected functions, suggested reviewers, and test coverage gaps.

## Quick Start

```yaml
# .github/workflows/grasp-pr-impact.yml
name: Grasp PR Impact

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pr-impact:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## What It Posts

Each PR gets a comment with:

| Section | Detail |
|---------|--------|
| **Risk badge** | LOW / MEDIUM / HIGH / CRITICAL with colour coding |
| **Changed files** | Each file with function-level blast radius count |
| **Affected processes** | Execution flows that pass through changed code (with step counts) |
| **Suggested reviewers** | Top 2 `git blame` contributors per affected file |
| **Coverage gaps** | Changed functions that have no test file touching them |

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | `${{ github.token }}` | Token for posting PR comments — `pull-requests: write` required |
| `grasp-version` | `latest` | Version of `grasp-mcp-server` to install via npx |
| `min-risk-to-comment` | `LOW` | Only post comment when risk reaches this level (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`) |
| `fail-on-risk` | `CRITICAL` | Exit with code 1 when risk reaches this level — set to `""` to never fail |

## Risk Levels

| Level | Trigger |
|-------|---------|
| **LOW** | Small blast radius, no circular deps in changed files |
| **MEDIUM** | Moderate blast radius or changes touch a hotspot |
| **HIGH** | Large blast radius, changes touch circular deps or security-sensitive files |
| **CRITICAL** | Changes touch core entry points with very large blast radius or multiple security issues |

## Gating PRs in CI

To block merges when impact is HIGH or above:

```yaml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-risk: HIGH
```

To post a comment only for HIGH+ risk (no comment on low-risk PRs):

```yaml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-risk-to-comment: HIGH
    fail-on-risk: CRITICAL
```

## Self-Contained

The action uses only `@octokit/rest` (no other external dependencies) and runs `grasp-mcp-server` locally via `npx` — no secrets beyond `GITHUB_TOKEN` are required.

## Related

- `grasp_detect_changes` MCP tool — the underlying symbol-level change analysis
- `grasp drift` CLI — architecture drift detection across snapshots
- `grasp_coverage_gaps` MCP tool — test coverage gap map
