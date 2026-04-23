# Grasp — Claude Session Handover

## What This Is
Open-source code architecture visualizer. Paste a GitHub/GitLab URL → dependency graph, architecture diagram, health score, team dashboard. No data leaves the user's machine.

- **Live app:** https://ashfordeou.github.io/grasp  (lowercase — case-sensitive)
- **npm:** `grasp-mcp-server`
- **Current version:** v3.3.12

## Workflow Rules
- Build and commit directly — user trusts you, no confirmation needed
- **No `Co-Authored-By` lines** in any commit
- Conventional commits: `feat:`, `fix:`, `chore:`, `ci:`
- After browser-extension changes: `cd browser-extension && npm run build && npm test`
- To release: bump versions → commit → push → `git tag vX.Y.Z && git push origin vX.Y.Z`
- Test extension locally: reload via `chrome://extensions` → Developer mode → ↺ reload button

## Version Bump Checklist — Miss Any = Version Mismatch
| File | What changes |
|------|-------------|
| `browser-extension/package.json` + `manifest.json` + `manifest.firefox.json` + `manifest.safari.json` + `package-lock.json` | `"version"` |
| `mcp/package.json` + `package-lock.json` | `"version"` |
| `mcp/server.json` | `"version"` — appears **twice** |
| `mcp/README.md` | `**Current version: X.Y.Z**` |
| `vscode-extension/package.json` + `package-lock.json` | `"version"` only — **do NOT touch the `grasp-mcp-server` dep pin** (see pitfalls) |
| `jetbrains-plugin/build.gradle.kts` | `version =` appears **twice** (top-level + pluginConfiguration) + update `changeNotes` |
| `eclipse-plugin/pom.xml` + `jenkins-plugin/pom.xml` | `<version>` |
| All other `package.json` files in: `amazon-q-plugin`, `copilot-extension`, `continue-provider`, `discord-bot`, `github-action`, `gitlab-app`, `gitlab-ci-component`, `gpt-actions`, `jira-integration`, `linear-integration`, `raycast-grasp`, `teams-bot` | `"version"` |
| `gpt-actions/src/server.ts` | hardcoded version string in `/health` endpoint |
| `index.html` | `window.GRASP_VERSION = 'X.Y.Z'` — **two occurrences** |
| `team-dashboard.html` | `GRASP_VERSION = 'X.Y.Z'` |
| `docs/index.html` | `vX.Y.Z` — two occurrences |
| `docker/README.md` | version in the table |
| `README.md` | version references |
| `CHANGELOG.md` | new entry at top |

**Do NOT bump:** `shared/`, `ai-tools/`, `saas/`, `github-app/`, `slack-bot/` — intentionally on `1.0.0`

## Browser Extension Architecture
```
browser-extension/
  content.ts  → dist/content.js    injected on github.com + gitlab.com /*/*
                                    also injected dynamically on custom hosts after user grants permission
  background.ts → dist/background.js   service worker
  popup.ts    → dist/popup.js      NEVER inline <script> — MV3 CSP blocks it silently
  popup.html  → loads dist/popup.js via <script src>
  manifest.json:
    permissions: [activeTab, scripting]
    optional_host_permissions: ["*://*/*"]
    host_permissions: github.com/*, gitlab.com/*
```

### Custom host flow (e.g. gitlab.esa.int)
1. Popup opens → content script not injected → `showManual(tabId)` called
2. `chrome.scripting.executeScript(func: () => window.location.hostname)` → gets hostname
3. If not github.com/gitlab.com → shows "Enable Grasp button on [host] →"
4. Click → `chrome.permissions.request({origins: [https://host/*, http://host/*]})`
5. Granted → `executeScript` injects `dist/content.js` immediately + `registerContentScripts` for future loads

### Repo routing (background.ts)
- `gitlab.com` content script → `{repo: 'owner/project', isGitLab: true}` → background prefixes `gitlab.com/`
- Custom host popup input → `{repo: 'host/owner/project', isGitLab: true}` (3 segments) → passed as-is
- GitHub → `{repo: 'owner/project', isGitLab: false}` → passed directly

## App (index.html) Key Facts
- Single-file React, no build step
- `?repo=owner/repo` auto-analyzes on load (500ms delay then clicks Analyze)
- GitLab: `?repo=gitlab.com/owner/repo` or `?repo=gitlab.esa.int/owner/repo` — app detects `gitlab` in URL
- Rate limit dialog resolves: `true` (continue) | `false` (cancel) | `{token:'ghp_...'}` (save & re-analyze)
- Token/auth stored in `localStorage`: `grasp_saved_token`, `grasp_saved_auth_method`

## CI/CD Pipeline
Triggered by `v*` tags via `.github/workflows/publish.yml`:
npm → MCP registry → VS Code Marketplace → JetBrains → Docker → Chrome Web Store → GitHub Release → GitLab bot image → GitLab agent binary

Integration tests split across two workflows (both trigger on `main` / `feature/integrations-*`):
- `.github/workflows/integrations-core.yml` — shared infra, phases 1–4 (Docker, Homebrew, GitHub Action, GitLab CI, bots, MCP sources, Gitea E2E)
- `.github/workflows/integrations-plugins.yml` — phases 5–10 (browser extension, Raycast, AI platforms, editors, issue trackers, AI coding tools)

**Chrome Web Store ID:** `pipmlammandfhfbodllcjolgeolkhapj` — listing: https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj
**Firefox Add-ons:** `grasp@ashforde.org` — secrets set: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`
**Safari:** sideload-only for now — CI builds unsigned `.app` and attaches to GitHub Release; no Apple secrets needed; App Store submission skipped unless `APPLE_API_KEY_ID` is set; bundle ID `org.ashforde.grasp`
**`ITEM_NOT_UPDATABLE`** from CWS = extension is in review, not an error
**VS Code:** `VSCE_PAT` secret not set → `.vsix` on GitHub release as fallback

## Enterprise Browser Deployment
Once CWS–approved, IT admins: Google Admin Console → Apps & Extensions → force-install by extension ID.
Without CWS: use `.crx` from GitHub Releases + `ExtensionInstallForcelist` policy with a self-hosted update URL.

## Known Pitfalls
- **`vscode-extension` dep pin**: NEVER change `"grasp-mcp-server": "^3.3.3"` in `vscode-extension/package.json` — the lock file resolves to 3.3.3 and `npm ci` fails if the range requires a version not yet on npm; `^3.3.3` already covers all future 3.x releases
- **Security scanner self-analysis**: detectors use `findIndex` gates to avoid flagging their own code — zero-arg `eval()`, quoted `Function(`, regex-literal `innerHTML` are all excluded; adding description strings with `eval()` or `Function(` back would re-introduce false positives
- **Lock files + version bumps**: restore from git, then Python JSON to update only own version fields — never global `sed` (corrupts third-party dep versions like `fast-glob@3.3.3 → 3.3.4`)
- **JetBrains `build.gradle.kts`**: `version =` in TWO places + `changeNotes` — update all three
- **`gpt-actions/src/server.ts`**: hardcoded version in `/health` response — easy to miss
- **`mcp/server.json`**: `"version"` appears twice
- **MV3 popup**: inline `<script>` silently does nothing — always use compiled external JS
- **APP_URL**: lowercase only: `https://ashfordeou.github.io/grasp`
- **`chrome.scripting.registerContentScripts`**: always `.catch(() => {})` — fails silently if ID exists
- **`trmcnvn/chrome-addon@v2`**: hides CWS errors — use the custom shell script instead
- **JetBrains "already contains version"**: needs `set +e` + `tee` + `PIPESTATUS[0]`
- **CI `defaults.run.working-directory`**: only applies to `run:` steps, not `uses:` steps
- **Safari bundle ID**: must be all-lowercase `org.ashforde.grasp` — converter generates capital G, fix with sed on `project.pbxproj`
- **Security scanner self-analysis**: `index.html` and `mcp/src/parser.js` contain the scanner code itself — the detectors now skip `.md`/`.txt` files and ignore `eval(` inside string literals to avoid flagging their own code

## MCP Registry (likely pending)
```bash
cd mcp
mcp-publisher validate server.json        # check what's unpublished
mcp-publisher login github-oidc
mcp-publisher publish server.json         # repeat per pending version
```

## Re-tag to Retrigger Pipeline
```bash
git tag -f vX.Y.Z && git push origin vX.Y.Z --force
```
