# Grasp — Claude Session Handover

## What This Is
Open-source code architecture visualizer. Paste a GitHub/GitLab URL → dependency graph, architecture diagram, health score, team dashboard. No data leaves the user's machine.

- **Live app:** https://ashfordeou.github.io/grasp
- **npm:** `grasp-mcp-server`
- **Current version:** v3.3.2

## Workflow Rules
- Build and commit directly — user trusts you, no confirmation needed
- **No `Co-Authored-By` lines** in any commit
- Conventional commits: `feat:`, `fix:`, `chore:`, `ci:`
- After browser-extension changes: `cd browser-extension && npm run build && npm test`
- To release: bump versions (see checklist below) → commit → push → `git tag vX.Y.Z && git push origin vX.Y.Z`

## Version Bump Checklist
Every release must update ALL of these — missing any causes mismatches:

| File | What to change |
|------|---------------|
| `browser-extension/package.json` + `manifest.json` + `package-lock.json` | `"version"` |
| `mcp/package.json` + `package-lock.json` + `server.json` | `"version"` (server.json has it TWICE) |
| `mcp/README.md` | `**Current version: X.Y.Z**` |
| `vscode-extension/package.json` + `package-lock.json` | `"version"` + `"grasp-mcp-server"` dep pin |
| `jetbrains-plugin/build.gradle.kts` | `version =` appears TWICE + update `changeNotes` |
| `eclipse-plugin/pom.xml` + `jenkins-plugin/pom.xml` | `<version>` |
| `amazon-q-plugin`, `copilot-extension`, `continue-provider`, `discord-bot`, `github-action`, `gitlab-app`, `gitlab-ci-component`, `gpt-actions`, `jira-integration`, `linear-integration`, `raycast-grasp`, `teams-bot` — all `package.json` | `"version"` |
| `gpt-actions/src/server.ts` | hardcoded version string in `/health` endpoint |
| `index.html` | `window.GRASP_VERSION = 'X.Y.Z'` (two occurrences) |
| `team-dashboard.html` | `GRASP_VERSION = 'X.Y.Z'` |
| `docs/index.html` | `vX.Y.Z` (two occurrences) |
| `docker/README.md` | version in the table |
| `README.md` | version references |
| `CHANGELOG.md` | new entry at top |

**Do NOT bump:** `shared/`, `ai-tools/`, `saas/`, `github-app/`, `slack-bot/` — intentionally on `1.0.0`.

## Browser Extension Architecture
```
browser-extension/
  content.ts  → compiled to dist/content.js   (injected on github.com + gitlab.com /*/*)
  background.ts → dist/background.js           (service worker)
  popup.ts    → dist/popup.js                  (popup UI)
  popup.html  → loads dist/popup.js via <script src>  ← NEVER use inline <script> (MV3 CSP blocks it)
```
- Popup detects current repo via `GET_REPO_INFO` message to content script
- GitLab repos: background.ts prefixes `gitlab.com/` so app's `isGitLabUrl()` detects correctly
- Build: `cd browser-extension && npm run build`

## App (index.html) Key Facts
- Single-file React app, no build step
- `?repo=owner/repo` in URL → auto-analyzes on load
- For GitLab: `?repo=gitlab.com/owner/repo` (with prefix)
- Token stored in `localStorage`: keys `grasp_saved_token`, `grasp_saved_auth_method`
- Rate limit dialog: resolves with `true` (continue), `false` (cancel), or `{token:'ghp_...'}` (save & re-analyze)

## CI/CD Pipeline
Triggered by `v*` tags via `.github/workflows/publish.yml`. Jobs:
npm → MCP registry → VS Code Marketplace → JetBrains → Docker → Chrome Web Store → GitHub Release → GitLab bot image → GitLab agent binary

**Chrome Web Store:** Extension ID `pipmlammandfhfbodllcjolgeolkhapj`. `ITEM_NOT_UPDATABLE` response = in review, not an error.
**VS Code:** `VSCE_PAT` secret not set → skipped; .vsix on GitHub release as fallback.

## Re-tag to Retrigger Pipeline
```bash
git tag -f vX.Y.Z && git push origin vX.Y.Z --force
```

## Known Pitfalls
- `jetbrains-plugin/build.gradle.kts`: version in TWO places + changeNotes — all three must be updated
- `gpt-actions/src/server.ts`: hardcoded version in `/health` response — easy to miss
- `mcp/server.json`: `"version"` appears twice
- MV3 popup: inline `<script>` does nothing silently — always use compiled external JS
- CI `defaults.run.working-directory` only applies to `run:` steps, not `uses:` steps
- `trmcnvn/chrome-addon@v2` hides errors — replaced with custom shell script
- JetBrains "already contains version": needs `set +e` + `tee` + `PIPESTATUS[0]`

## MCP Registry (pending)
Check and batch-publish any unpublished versions:
```bash
cd mcp && mcp-publisher validate server.json
mcp-publisher login github-oidc
mcp-publisher publish server.json  # repeat for each pending version
```
