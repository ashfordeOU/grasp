# Grasp Self-Heal Session

**Mission:** Use Grasp's own MCP tools to analyze the Grasp repo, fix every issue it surfaces, and iterate until the health score reaches 100/100.

This session has two purposes:
1. Improve Grasp's own code quality
2. Battle-test the MCP tools under real conditions

---

## Before You Start

Read `CLAUDE.md` first — it has the full project context, version bump checklist, known pitfalls, and workflow rules.

**Current version:** v3.3.8 (committed and tagged)

**MCP is already wired up** via `.mcp.json` in this repo root. Claude Code loads it automatically. Confirm it loaded: you should see `grasp_analyze`, `grasp_suggest`, `grasp_security`, etc. in your available tools. If not, run `claude mcp list` in the terminal.

---

## Architecture You Must Understand Before Fixing

Some things Grasp will flag are BY DESIGN. Do not "fix" them without understanding why they exist:

| What Grasp flags | Why it exists | What to do |
|-----------------|---------------|------------|
| `index.html` — god file (10 000+ lines) | Intentional single-file app — zero build step is the product's core value prop | Do NOT split. If Grasp penalises this, add architectural exception or tune the detector |
| `mcp/src/parser.js` — large file | Core parser, inline for performance | Splitting is OK if logical, but do not break the browser/MCP dual-use requirement |
| `mcp/src/index.ts` — many tools (35+) | MCP protocol requires all tools in one server entry | Acceptable; can extract helpers to other modules in `mcp/src/` |
| `browser-extension/dist/` | Build output, not source | Must be gitignored, not analyzed |

---

## The Loop

```
1. grasp_analyze  →  get session_id + health_score
2. grasp_suggest  →  ranked list of actionable fixes
3. grasp_security →  security issues
4. grasp_issues   →  all issues (complexity, coupling, dead code, etc.)
5. grasp_hotspots →  files with high churn + complexity
6. Fix issues in code
7. Commit with conventional commit format (feat:/fix:/chore:)
8. Repeat from step 1 until health_score = 100
```

---

## Step 1 — Baseline Analysis

Run this first to get the session_id and understand where we start:

```
grasp_analyze: source = "/Users/chak/Documents/Code/Claudecode/grasp"
```

Note down:
- `health_score` (the baseline)
- `health_grade`
- `issue_count`
- `security_issue_count`
- `circular_dep_count`

---

## Step 2 — Pull All Issues

After getting `session_id` from step 1, run all diagnostic tools in parallel:

```
grasp_suggest:   session_id = <from step 1>
grasp_security:  session_id = <from step 1>
grasp_issues:    session_id = <from step 1>
grasp_hotspots:  session_id = <from step 1>
grasp_cycles:    session_id = <from step 1>
grasp_unused:    session_id = <from step 1>
grasp_patterns:  session_id = <from step 1>
grasp_metrics:   session_id = <from step 1>
```

---

## Step 3 — Fix Priority Order

Fix in this order (highest health-score impact first):

1. **Critical** — circular dependencies, security issues
2. **High** — god files (where splitting is safe), high fan-in bottlenecks
3. **Medium** — unused exports, complexity hotspots, missing error handling
4. **Low** — style, naming, minor patterns

For each issue category, use the relevant focused tool to get detail before changing code.

---

## Step 4 — Iteration

After each batch of fixes:
1. Commit the changes (`fix:` or `chore:` prefix, no Co-Authored-By)
2. Re-run `grasp_analyze` on the local path to get a new health score
3. Re-run `grasp_suggest` to see the updated suggestion list
4. Continue until `health_score = 100`

---

## Key Technical Facts

- **Parser code is mirrored**: `mcp/src/parser.js` and `index.html` share the same security detection logic — any fix to one MUST be applied to the other
- **Lock files**: use Python JSON to update version fields, never global `sed`
- **vscode dep pin**: NEVER change `"grasp-mcp-server": "^3.3.3"` in `vscode-extension/package.json`
- **Security scanner self-analysis**: as of v3.3.8, zero false positives confirmed. The detectors use `findIndex` gates — do not reintroduce string literals containing `eval()`, `Function(`, or `innerHTML =` in the scanner description strings
- **No Co-Authored-By** in any commit in this repo
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `ci:` — no other formats

---

## After Reaching 100%

When health_score = 100:

1. Run the full version bump to v3.3.9 (or whatever is next) — see version bump checklist in CLAUDE.md
2. Add CHANGELOG.md entry describing the improvements
3. Push and tag: `git tag v3.3.9 && git push origin v3.3.9`
4. Update `CLAUDE.md` current version line
5. Update `memory/project_grasp.md` (persistent memory at `/Users/chak/.claudemain/projects/-Users-chak/memory/project_grasp.md`)

---

## Grasp MCP Tool Reference

| Tool | What it does |
|------|-------------|
| `grasp_analyze` | Full analysis — run first, get session_id |
| `grasp_suggest` | Prioritised refactoring suggestions |
| `grasp_security` | Security findings (secrets, XSS, eval, SQL injection) |
| `grasp_issues` | All issues — complexity, coupling, dead code |
| `grasp_hotspots` | High churn + high complexity files |
| `grasp_cycles` | Circular dependency chains |
| `grasp_unused` | Unused functions and exports |
| `grasp_patterns` | Code pattern violations |
| `grasp_metrics` | Per-file LOC, function count, fan-in/fan-out |
| `grasp_architecture` | Layer map — how the repo is structured |
| `grasp_explain` | Explain a specific file or function |
| `grasp_refactor` | Get refactoring plan for a specific file |
| `grasp_dead_packages` | Installed packages not used in code |
| `grasp_sarif` | Export findings as SARIF (for IDE integration) |

---

## If the MCP Crashes or Returns Errors

The MCP server runs the same analysis engine as the browser app. If a tool fails:
1. Check that `mcp/dist/index.js` exists — if not, run `cd mcp && npm run build`
2. Check stderr output — errors go to stderr not stdout
3. For large files (index.html), the parser may timeout — this is expected; security scan still works
4. Re-run with exponential backoff if it's a transient error

---

## Acceptance Criteria

The session is complete when:
- [ ] `grasp_analyze` returns `health_score: 100`
- [ ] `grasp_security` returns zero issues
- [ ] `grasp_cycles` returns zero circular dependencies
- [ ] `grasp_suggest` returns no critical or high priority items
- [ ] All changes committed and pushed
- [ ] v3.3.9 (or next) released and tagged
- [ ] CLAUDE.md and memory updated

Good luck.
