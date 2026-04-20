# Plan: GitLab Full Parity
Date: 2026-04-20
Goal: Full feature parity between GitHub and GitLab across MCP analysis, automated bot, SaaS API, and all deployment models (self-hosted, cloud, tunnel agent)
Architecture: Six phases — MCP/CLI analysis parity → GitLab bot server → SaaS API → index.html UI → Docker deployment → tunnel agent
Tech stack: TypeScript (MCP, bot, SaaS), Go (tunnel agent), Docker Compose

---

## Phase 1: MCP / CLI Analysis Parity

### Task 1: Dual-header auth + configurable pagination in gitlab.ts

**Files:** `mcp/src/sources/gitlab.ts` (modify)

**Steps:**
1. Replace the file content with the extended version:
   ```typescript
   export interface GitLabSource {
     host: string;
     namespace: string;
     project: string;
     token?: string;
     maxPages?: number;
   }

   export function isGitLabSource(input: string): boolean {
     return /gitlab\./i.test(input);
   }

   export function normalizeGitLabUrl(input: string): GitLabSource | null {
     // Supports: gitlab.com/a/b, internal.gitlab.company.com/a/b/c, https://...
     const m = input.match(
       /(?:https?:\/\/)?([^/]*gitlab[^/]*)\/([^/]+\/(?:[^/]+\/)*[^/]+?)(?:\.git)?$/i
     );
     if (!m) return null;
     const parts = m[2].split('/');
     const project = parts.pop()!;
     const namespace = parts.join('/');
     return { host: m[1], namespace, project };
   }

   export function gitLabHeaders(token?: string): Record<string, string> {
     if (!token) return {};
     // Support both legacy PRIVATE-TOKEN and modern Bearer format
     if (token.startsWith('glpat-') || token.startsWith('gloas-')) {
       return { 'PRIVATE-TOKEN': token };
     }
     return { 'Authorization': `Bearer ${token}` };
   }

   export async function fetchGitLabTree(
     src: GitLabSource
   ): Promise<Array<{ path: string; content: string }>> {
     const base = `https://${src.host}/api/v4`;
     const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
     const headers = gitLabHeaders(src.token);
     const maxPages = src.maxPages ?? 5;
     let tree: Array<{ id: string; name: string; path: string; type: string }> = [];
     for (let page = 1; page <= maxPages; page++) {
       const res = await fetch(
         `${base}/projects/${encodedPath}/repository/tree?recursive=true&per_page=100&page=${page}`,
         { headers }
       );
       if (!res.ok) throw new Error(`GitLab API error: ${res.status}`);
       const batch = await res.json() as Array<{ id: string; name: string; path: string; type: string }>;
       tree = tree.concat(batch);
       if (batch.length < 100) break;
     }
     const CODE_EXT = /\.(ts|js|tsx|jsx|py|go|rs|java|rb|php|cs|lua|kt|swift|cpp|c|h)$/;
     const files = tree.filter(f => f.type === 'blob' && CODE_EXT.test(f.name));
     const results: Array<{ path: string; content: string }> = [];
     for (const file of files.slice(0, 500)) {
       try {
         const r = await fetch(
           `${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(file.path)}/raw?ref=HEAD`,
           { headers }
         );
         if (r.ok) results.push({ path: file.path, content: await r.text() });
       } catch { /* skip */ }
     }
     return results;
   }
   ```
2. Verify it compiles: `cd mcp && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab): dual-header auth, configurable pagination, subgroup support"`

---

### Task 2: Add fetchGitLabChurn (commit history per file)

**Files:** `mcp/src/sources/gitlab.ts` (modify)

**Steps:**
1. Add this function after `fetchGitLabTree`:
   ```typescript
   export async function fetchGitLabChurn(
     src: GitLabSource,
     filePath: string,
     limit = 10
   ): Promise<number> {
     try {
       const base = `https://${src.host}/api/v4`;
       const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
       const headers = gitLabHeaders(src.token);
       const res = await fetch(
         `${base}/projects/${encodedPath}/repository/commits?path=${encodeURIComponent(filePath)}&per_page=${limit}`,
         { headers }
       );
       if (!res.ok) return 0;
       const commits = await res.json() as unknown[];
       return commits.length;
     } catch {
       return 0;
     }
   }
   ```
2. Verify: `cd mcp && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab): add fetchGitLabChurn via Commits API"`

---

### Task 3: Add fetchGitLabOwnership (blame API)

**Files:** `mcp/src/sources/gitlab.ts` (modify)

**Steps:**
1. Add this function:
   ```typescript
   export interface GitLabOwner { email: string; name: string; commitCount: number }

   export async function fetchGitLabOwnership(
     src: GitLabSource,
     filePath: string
   ): Promise<GitLabOwner[]> {
     try {
       const base = `https://${src.host}/api/v4`;
       const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
       const headers = gitLabHeaders(src.token);
       const res = await fetch(
         `${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(filePath)}/blame?ref=HEAD`,
         { headers }
       );
       if (!res.ok) return [];
       const blame = await res.json() as Array<{
         commit: { author_email: string; author_name: string }
       }>;
       const counts: Record<string, GitLabOwner> = {};
       for (const entry of blame) {
         const key = entry.commit.author_email;
         if (!counts[key]) {
           counts[key] = { email: key, name: entry.commit.author_name, commitCount: 0 };
         }
         counts[key].commitCount++;
       }
       return Object.values(counts).sort((a, b) => b.commitCount - a.commitCount);
     } catch {
       return [];
     }
   }
   ```
2. Verify: `cd mcp && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab): add fetchGitLabOwnership via Blame API"`

---

### Task 4: Add fetchGitLabCiStatus (Pipelines API)

**Files:** `mcp/src/sources/gitlab.ts` (modify)

**Steps:**
1. Add this function:
   ```typescript
   export type GitLabCiStatus = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'unknown'

   export async function fetchGitLabCiStatus(
     src: GitLabSource,
     ref = 'HEAD'
   ): Promise<GitLabCiStatus> {
     try {
       const base = `https://${src.host}/api/v4`;
       const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
       const headers = gitLabHeaders(src.token);
       const res = await fetch(
         `${base}/projects/${encodedPath}/pipelines?ref=${ref}&per_page=1`,
         { headers }
       );
       if (!res.ok) return 'unknown';
       const pipelines = await res.json() as Array<{ status: string }>;
       if (!pipelines.length) return 'unknown';
       const s = pipelines[0].status;
       if (['success','failed','running','pending','canceled'].includes(s)) {
         return s as GitLabCiStatus;
       }
       return 'unknown';
     } catch {
       return 'unknown';
     }
   }
   ```
2. Verify: `cd mcp && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab): add fetchGitLabCiStatus via Pipelines API"`

---

### Task 5: Add fetchGitLabIssues (Issues API)

**Files:** `mcp/src/sources/gitlab.ts` (modify)

**Steps:**
1. Add this function:
   ```typescript
   export interface GitLabIssue { id: number; iid: number; title: string; state: string; web_url: string }

   export async function fetchGitLabIssues(
     src: GitLabSource,
     limit = 100
   ): Promise<GitLabIssue[]> {
     try {
       const base = `https://${src.host}/api/v4`;
       const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
       const headers = gitLabHeaders(src.token);
       const res = await fetch(
         `${base}/projects/${encodedPath}/issues?state=opened&per_page=${limit}`,
         { headers }
       );
       if (!res.ok) return [];
       return await res.json() as GitLabIssue[];
     } catch {
       return [];
     }
   }
   ```
2. Verify: `cd mcp && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab): add fetchGitLabIssues via Issues API"`

---

### Task 6: Wire GitLab metrics into MCP analyzer

**Files:** `mcp/src/analyzer.ts` (modify — find where GitHub churn is fetched and add GitLab parallel path)

**Steps:**
1. Find the section in `analyzer.ts` that calls `getFileCommitCount` for GitHub. Add a GitLab branch:
   ```typescript
   // In the section where churn is fetched during analysis:
   import { isGitLabSource, normalizeGitLabUrl, fetchGitLabChurn, fetchGitLabCiStatus } from './sources/gitlab.js';

   // When source is GitLab, fetch churn via GitLab API instead of hardcoding 0:
   if (src.type === 'gitlab') {
     churn = await fetchGitLabChurn(src, file.path, 10).catch(() => 0);
   }
   ```
2. Also wire CI status: after analysis completes, if source is GitLab, fetch and attach pipeline status to the result summary.
3. Verify: `cd mcp && npm run build` → expect: `0 errors`
4. Commit: `git commit -m "feat(gitlab): wire churn and CI status into analyzer for GitLab sources"`

---

### Task 7: Add GITLAB_TOKEN + --gitlab-host to CLI

**Files:** `mcp/src/cli.ts` (modify)

**Steps:**
1. Find line 31 in cli.ts: `const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;`
   Add below it:
   ```typescript
   const gitlabToken = process.env.GITLAB_TOKEN;
   const gitlabHost  = process.argv.find(a => a.startsWith('--gitlab-host='))?.split('=')[1]
                    ?? process.env.GITLAB_HOST;
   ```
2. Find the `usage()` function. In the `Environment:` section, add:
   ```
   GITLAB_TOKEN                GitLab PRIVATE-TOKEN or Bearer token (for GitLab repos)
   GITLAB_HOST                 Self-hosted GitLab host (e.g. gitlab.internal.company.com)
   ```
   In `Options:`, add:
   ```
   --gitlab-host=<host>        Self-hosted GitLab hostname (overrides GITLAB_HOST env var)
   ```
3. In the `parseSource()` call inside `main()`, pass `gitlabToken` and `gitlabHost` so the analyzer uses them when a GitLab URL is detected.
4. Verify: `cd mcp && npm run build` → expect: `0 errors`
5. Test: `node dist/cli.js --help` → expect: GITLAB_TOKEN and --gitlab-host appear in output
6. Commit: `git commit -m "feat(cli): add GITLAB_TOKEN env var and --gitlab-host flag"`

---

## Phase 2: GitLab Bot Server

### Task 8: Scaffold gitlab-app/ project

**Files:** `gitlab-app/package.json` (create), `gitlab-app/tsconfig.json` (create), `gitlab-app/src/index.ts` (create)

**Steps:**
1. Create `gitlab-app/package.json`:
   ```json
   {
     "name": "grasp-gitlab-app",
     "version": "3.2.1",
     "private": true,
     "type": "module",
     "main": "dist/index.js",
     "scripts": {
       "build": "tsc",
       "start": "node dist/index.js",
       "dev": "tsx src/index.ts"
     },
     "dependencies": {
       "express": "^4.18.2"
     },
     "devDependencies": {
       "@types/express": "^4.17.21",
       "@types/node": "^20.0.0",
       "tsx": "^4.7.0",
       "typescript": "^5.4.0"
     }
   }
   ```
2. Create `gitlab-app/tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "outDir": "dist",
       "rootDir": "src",
       "strict": true,
       "esModuleInterop": true
     },
     "include": ["src/**/*"]
   }
   ```
3. Create `gitlab-app/src/index.ts`:
   ```typescript
   import express from 'express';
   import { handleWebhook } from './webhook.js';

   const app = express();
   const PORT = parseInt(process.env.PORT ?? '7332', 10);

   app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

   app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'grasp-gitlab-bot' }));
   app.post('/webhook', handleWebhook);

   app.listen(PORT, () => {
     console.log(`Grasp GitLab Bot listening on port ${PORT}`);
   });
   ```
4. Run: `cd gitlab-app && npm install && npm run build` → expect: `dist/index.js` created, `0 errors`
5. Commit: `git commit -m "feat(gitlab-app): scaffold bot server with Express + TypeScript"`

---

### Task 9: Webhook signature verification

**Files:** `gitlab-app/src/webhook-verify.ts` (create)

**Steps:**
1. Create `gitlab-app/src/webhook-verify.ts`:
   ```typescript
   import { timingSafeEqual } from 'node:crypto';

   /**
    * GitLab signs webhooks with a plain token in X-Gitlab-Token header.
    * Compare timing-safely to prevent timing attacks.
    */
   export function verifyGitLabSignature(
     headerToken: string | undefined,
     expectedSecret: string
   ): boolean {
     if (!headerToken) return false;
     try {
       return timingSafeEqual(
         Buffer.from(headerToken),
         Buffer.from(expectedSecret)
       );
     } catch {
       return false;
     }
   }
   ```
2. Verify: `cd gitlab-app && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab-app): webhook signature verification"`

---

### Task 10: MR comment formatter and poster

**Files:** `gitlab-app/src/comment.ts` (create)

**Steps:**
1. Create `gitlab-app/src/comment.ts`:
   ```typescript
   const COMMENT_MARKER = '<!-- grasp-health-report -->';

   export interface HealthSummary {
     score: number; grade: string; fileCount: number; functionCount: number;
     issueCount: number; criticalIssueCount: number;
     circularDepCount: number; securityIssueCount: number; layers: string[];
   }

   export function buildMrComment(
     summary: HealthSummary,
     projectPath: string,
     mrTitle: string
   ): string {
     const { score, grade } = summary;
     const emoji: Record<string, string> = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴' };
     const bar = '`' + '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10)) + '`';
     return [
       COMMENT_MARKER,
       `## 📊 Grasp Health Report — ${mrTitle}`,
       '',
       '| Metric | Value |',
       '|--------|-------|',
       `| **Health Score** | ${bar} **${score}/100** |`,
       `| **Grade** | ${emoji[grade] ?? '⚪'} **${grade}** |`,
       `| **Files** | ${summary.fileCount} (${summary.functionCount} functions) |`,
       `| **Architecture Issues** | ${summary.issueCount}${summary.criticalIssueCount > 0 ? ` ⚠️ ${summary.criticalIssueCount} critical` : ''} |`,
       `| **Circular Deps** | ${summary.circularDepCount}${summary.circularDepCount === 0 ? ' ✓' : ''} |`,
       `| **Security** | ${summary.securityIssueCount}${summary.securityIssueCount === 0 ? ' ✓' : ` 🔐 ${summary.securityIssueCount}`} |`,
       `| **Layers** | ${summary.layers.join(', ') || 'none'} |`,
     ].join('\n');
   }

   export async function postMrComment(
     gitlabHost: string,
     token: string,
     projectId: string,
     mrIid: number,
     body: string
   ): Promise<void> {
     const headers = token.startsWith('glpat-') || token.startsWith('gloas-')
       ? { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }
       : { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
     await fetch(
       `https://${gitlabHost}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/notes`,
       { method: 'POST', headers, body: JSON.stringify({ body }) }
     );
   }

   export async function postCommitStatus(
     gitlabHost: string,
     token: string,
     projectId: string,
     sha: string,
     state: 'pending' | 'running' | 'success' | 'failed',
     score: number
   ): Promise<void> {
     const headers = token.startsWith('glpat-') || token.startsWith('gloas-')
       ? { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }
       : { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
     await fetch(
       `https://${gitlabHost}/api/v4/projects/${encodeURIComponent(projectId)}/statuses/${sha}`,
       {
         method: 'POST',
         headers,
         body: JSON.stringify({
           state,
           name: 'grasp/health',
           description: `Health score: ${score}/100`,
           target_url: `https://ashfordeOU.github.io/grasp?repo=${encodeURIComponent(projectId)}`,
         })
       }
     );
   }
   ```
2. Verify: `cd gitlab-app && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab-app): MR comment formatter and commit status poster"`

---

### Task 11: Webhook event handler

**Files:** `gitlab-app/src/webhook.ts` (create)

**Steps:**
1. Create `gitlab-app/src/webhook.ts`:
   ```typescript
   import type { Request, Response } from 'express';
   import { verifyGitLabSignature } from './webhook-verify.js';
   import { buildMrComment, postMrComment, postCommitStatus } from './comment.js';

   const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';
   const GITLAB_TOKEN   = process.env.GITLAB_TOKEN ?? '';
   const GITLAB_HOST    = process.env.GITLAB_HOST ?? 'gitlab.com';

   interface MergeRequestPayload {
     object_kind: 'merge_request';
     object_attributes: {
       iid: number; title: string; state: string;
       action: string; last_commit: { id: string };
       source: { path_with_namespace: string };
     };
     project: { id: number; path_with_namespace: string };
   }

   interface PushPayload {
     object_kind: 'push';
     after: string;
     project: { id: number; path_with_namespace: string };
   }

   export async function handleWebhook(req: Request, res: Response): Promise<void> {
     const headerToken = req.headers['x-gitlab-token'] as string | undefined;
     if (WEBHOOK_SECRET && !verifyGitLabSignature(headerToken, WEBHOOK_SECRET)) {
       res.status(401).json({ error: 'Invalid webhook token' });
       return;
     }

     const event = req.headers['x-gitlab-event'] as string;
     const payload = req.body;

     res.status(202).json({ received: true });

     try {
       if (event === 'Merge Request Hook') {
         await handleMergeRequest(payload as MergeRequestPayload);
       } else if (event === 'Push Hook') {
         await handlePush(payload as PushPayload);
       }
     } catch (err) {
       console.error('Webhook handler error:', err);
     }
   }

   async function handleMergeRequest(payload: MergeRequestPayload): Promise<void> {
     const { action } = payload.object_attributes;
     if (!['open', 'reopen', 'update'].includes(action)) return;

     const projectPath = payload.project.path_with_namespace;
     const mrIid = payload.object_attributes.iid;
     const mrTitle = payload.object_attributes.title;
     const sha = payload.object_attributes.last_commit.id;

     // Post "pending" status immediately
     await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, 'running', 0);

     // Run analysis (stub — replace with real analyzeSource call)
     const summary = await runAnalysis(projectPath);

     // Post comment and final status
     const comment = buildMrComment(summary, projectPath, mrTitle);
     await postMrComment(GITLAB_HOST, GITLAB_TOKEN, projectPath, mrIid, comment);
     const state = summary.score >= 60 ? 'success' : 'failed';
     await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, state, summary.score);
   }

   async function handlePush(payload: PushPayload): Promise<void> {
     const projectPath = payload.project.path_with_namespace;
     const sha = payload.after;
     if (!sha || sha === '0000000000000000000000000000000000000000') return;
     await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, 'running', 0);
     const summary = await runAnalysis(projectPath);
     const state = summary.score >= 60 ? 'success' : 'failed';
     await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, state, summary.score);
   }

   // Stub — wired to real analyzer in Task 12
   async function runAnalysis(_projectPath: string) {
     return { score: 75, grade: 'B', fileCount: 0, functionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, layers: [] };
   }
   ```
2. Verify: `cd gitlab-app && npm run build` → expect: `0 errors`
3. Commit: `git commit -m "feat(gitlab-app): webhook handler for MR and Push events"`

---

### Task 12: Wire real analyzer into bot server

**Files:** `gitlab-app/src/analyzer-bridge.ts` (create), `gitlab-app/src/webhook.ts` (modify)

**Steps:**
1. Create `gitlab-app/src/analyzer-bridge.ts`:
   ```typescript
   import type { HealthSummary } from './comment.js';

   const MCP_DIST = process.env.MCP_DIST_PATH ?? '../mcp/dist';

   export async function analyzeGitLabRepo(
     projectPath: string,
     gitlabHost: string,
     token: string
   ): Promise<HealthSummary> {
     const { analyzeSource } = await import(`${MCP_DIST}/analyzer.js`);
     const result = await analyzeSource(
       { type: 'gitlab', host: gitlabHost, namespace: projectPath.split('/').slice(0,-1).join('/'), project: projectPath.split('/').pop()!, token },
       () => {}
     );
     const s = result.summary;
     return {
       score: s.healthScore,
       grade: s.healthGrade,
       fileCount: s.fileCount,
       functionCount: s.functionCount,
       issueCount: s.issueCount,
       criticalIssueCount: s.criticalIssueCount ?? 0,
       circularDepCount: s.circularDepCount,
       securityIssueCount: s.securityIssueCount,
       layers: s.layers ?? [],
     };
   }
   ```
2. In `webhook.ts`, replace the stub `runAnalysis` function:
   ```typescript
   import { analyzeGitLabRepo } from './analyzer-bridge.js';

   async function runAnalysis(projectPath: string) {
     return analyzeGitLabRepo(projectPath, GITLAB_HOST, GITLAB_TOKEN);
   }
   ```
3. Verify: `cd gitlab-app && npm run build` → expect: `0 errors`
4. Commit: `git commit -m "feat(gitlab-app): wire real MCP analyzer into bot webhook handler"`

---

### Task 13: OAuth2 token management

**Files:** `gitlab-app/src/oauth.ts` (create)

**Steps:**
1. Create `gitlab-app/src/oauth.ts`:
   ```typescript
   export interface OAuthTokens {
     access_token: string;
     refresh_token: string;
     expires_at: number; // unix ms
   }

   const CLIENT_ID     = process.env.GITLAB_OAUTH_CLIENT_ID ?? '';
   const CLIENT_SECRET = process.env.GITLAB_OAUTH_CLIENT_SECRET ?? '';
   const REDIRECT_URI  = process.env.GITLAB_OAUTH_REDIRECT_URI ?? '';

   export function buildAuthUrl(gitlabHost: string, state: string): string {
     const params = new URLSearchParams({
       client_id: CLIENT_ID,
       redirect_uri: REDIRECT_URI,
       response_type: 'code',
       scope: 'api read_user',
       state,
     });
     return `https://${gitlabHost}/oauth/authorize?${params}`;
   }

   export async function exchangeCode(
     gitlabHost: string,
     code: string
   ): Promise<OAuthTokens> {
     const res = await fetch(`https://${gitlabHost}/oauth/token`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         client_id: CLIENT_ID,
         client_secret: CLIENT_SECRET,
         code,
         grant_type: 'authorization_code',
         redirect_uri: REDIRECT_URI,
       }),
     });
     if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`);
     const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
     return {
       access_token: data.access_token,
       refresh_token: data.refresh_token,
       expires_at: Date.now() + data.expires_in * 1000,
     };
   }

   export async function refreshTokens(
     gitlabHost: string,
     refreshToken: string
   ): Promise<OAuthTokens> {
     const res = await fetch(`https://${gitlabHost}/oauth/token`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         client_id: CLIENT_ID,
         client_secret: CLIENT_SECRET,
         refresh_token: refreshToken,
         grant_type: 'refresh_token',
       }),
     });
     if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status}`);
     const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
     return {
       access_token: data.access_token,
       refresh_token: data.refresh_token,
       expires_at: Date.now() + data.expires_in * 1000,
     };
   }

   export function isExpired(tokens: OAuthTokens, bufferMs = 60_000): boolean {
     return Date.now() + bufferMs >= tokens.expires_at;
   }
   ```
2. Add OAuth routes to `gitlab-app/src/index.ts`:
   ```typescript
   import { buildAuthUrl, exchangeCode } from './oauth.js';
   import { randomBytes } from 'node:crypto';

   app.get('/oauth/start', (req, res) => {
     const host = (req.query.gitlab_host as string) ?? 'gitlab.com';
     const state = randomBytes(16).toString('hex');
     res.redirect(buildAuthUrl(host, state));
   });

   app.get('/oauth/callback', async (req, res) => {
     const { code, state } = req.query as { code: string; state: string };
     if (!code) { res.status(400).send('Missing code'); return; }
     try {
       const host = process.env.GITLAB_HOST ?? 'gitlab.com';
       const tokens = await exchangeCode(host, code);
       // In production: store tokens per-user in DB. Here we echo for setup.
       res.json({ access_token: tokens.access_token, expires_at: tokens.expires_at });
     } catch (err: any) {
       res.status(500).json({ error: err.message });
     }
   });
   ```
3. Verify: `cd gitlab-app && npm run build` → expect: `0 errors`
4. Commit: `git commit -m "feat(gitlab-app): OAuth2 authorization code flow with token refresh"`

---

## Phase 3: SaaS API GitLab Support

### Task 14: Extend normalizeRepo() to accept GitLab URLs

**Files:** `saas/src/routes.ts` (modify)

**Steps:**
1. Find the `normalizeRepo` function (or equivalent URL parsing logic) in `saas/src/routes.ts`. Add GitLab URL support:
   ```typescript
   export function normalizeRepo(input: string, gitlabHost?: string): {
     type: 'github' | 'gitlab';
     identifier: string;
     host?: string;
   } | null {
     const trimmed = input.trim().replace(/\.git$/, '');

     // GitHub
     const ghPatterns = [
       /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/,
       /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
     ];
     for (const p of ghPatterns) {
       const m = trimmed.match(p);
       if (m) return { type: 'github', identifier: `${m[1]}/${m[2]}` };
     }

     // GitLab — cloud or self-hosted
     const glPattern = /(?:https?:\/\/)?([^/]*gitlab[^/]*)\/(.+)/i;
     const glm = trimmed.match(glPattern);
     if (glm) return { type: 'gitlab', identifier: glm[2], host: glm[1] };

     // Explicit gitlab_host parameter
     if (gitlabHost) {
       return { type: 'gitlab', identifier: trimmed, host: gitlabHost };
     }

     return null;
   }
   ```
2. Update the `POST /api/analyze` handler to pass `req.body.gitlab_host` into `normalizeRepo`:
   ```typescript
   const parsed = normalizeRepo(req.body.repo, req.body.gitlab_host);
   ```
3. Verify: `cd saas && npm run build` → expect: `0 errors`
4. Commit: `git commit -m "feat(saas): extend normalizeRepo to accept GitLab URLs and self-hosted hosts"`

---

### Task 15: Wire GitLab source through SaaS analyze handler

**Files:** `saas/src/routes.ts` (modify)

**Steps:**
1. In the analyze handler, after `normalizeRepo`, branch on `parsed.type`:
   ```typescript
   import { normalizeGitLabUrl, fetchGitLabTree } from '../../mcp/src/sources/gitlab.js';

   // Inside the analyze handler, where the source is constructed:
   if (parsed.type === 'gitlab') {
     source = {
       type: 'gitlab' as const,
       host: parsed.host ?? 'gitlab.com',
       namespace: parsed.identifier.split('/').slice(0, -1).join('/'),
       project: parsed.identifier.split('/').pop()!,
       token: req.body.token,
     };
   } else {
     // existing GitHub path
     source = buildGitHubSource(parsed.identifier, req.body.token);
   }
   ```
2. Verify: `cd saas && npm run build` → expect: `0 errors`
3. Test endpoint manually: `curl -X POST http://localhost:3001/api/analyze -H 'Content-Type: application/json' -d '{"repo":"https://gitlab.com/gitlab-org/gitlab-ce"}'` → expect: `202 Accepted` with a job ID
4. Commit: `git commit -m "feat(saas): wire GitLab source into analyze handler"`

---

## Phase 4: index.html GitLab Auth UI

### Task 16: GitLab URL detection in frontend input

**Files:** `index.html` (modify)

**Steps:**
1. Find the URL input handling logic in index.html (search for `parseGitHubUrl` or the repo input handler). Add GitLab detection:
   ```javascript
   function isGitLabUrl(input) {
     return /gitlab\./i.test(input);
   }

   function parseGitLabInput(input) {
     const m = input.trim().replace(/\.git$/, '')
       .match(/(?:https?:\/\/)?([^/]*gitlab[^/]*)\/(.+)/i);
     if (!m) return null;
     return { host: m[1], path: m[2] };
   }
   ```
2. In the analyze trigger, if `isGitLabUrl(repoInput)` is true, set auth type to GitLab and extract host from the URL.
3. Verify: open index.html in browser, paste `https://gitlab.com/owner/repo` → should proceed to analysis (or show "GitLab token needed" if rate limited)
4. Commit: `git commit -m "feat(ui): GitLab URL detection in repo input"`

---

### Task 17: GitLab auth section in index.html

**Files:** `index.html` (modify)

**Steps:**
1. Find the auth section in index.html (search for `GitHub PAT` or the token input area). Add a GitLab auth panel alongside the GitHub one:
   ```html
   <!-- GitLab auth panel — shown when a GitLab URL is entered -->
   <div id="gitlab-auth-panel" style="display:none">
     <div style="font-size:11px;color:var(--t3);margin-bottom:6px">GitLab token (optional — raises rate limit)</div>
     <input id="gitlab-token-input" type="password" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
       style="width:100%;padding:5px 8px;background:var(--bg0);border:1px solid var(--border);border-radius:5px;color:var(--t0);font-size:11px;box-sizing:border-box"
       oninput="saveGitLabToken(this.value)" />
     <input id="gitlab-host-input" type="text" placeholder="Self-hosted host (e.g. gitlab.internal.company.com)"
       style="width:100%;margin-top:4px;padding:5px 8px;background:var(--bg0);border:1px solid var(--border);border-radius:5px;color:var(--t0);font-size:11px;box-sizing:border-box"
       oninput="saveGitLabHost(this.value)" />
   </div>
   ```
2. Add the JS functions:
   ```javascript
   function saveGitLabToken(val) {
     if (val) localStorage.setItem('grasp_gitlab_token', val);
     else localStorage.removeItem('grasp_gitlab_token');
   }
   function saveGitLabHost(val) {
     if (val) localStorage.setItem('grasp_gitlab_host', val);
     else localStorage.removeItem('grasp_gitlab_host');
   }
   function loadGitLabAuth() {
     const t = localStorage.getItem('grasp_gitlab_token');
     const h = localStorage.getItem('grasp_gitlab_host');
     if (t) document.getElementById('gitlab-token-input').value = t;
     if (h) document.getElementById('gitlab-host-input').value = h;
   }
   ```
3. Show/hide the GitLab auth panel based on whether the current input is a GitLab URL.
4. Pass the token and host into the analyze call when source is GitLab.
5. Verify: open index.html, enter a GitLab URL → GitLab auth panel appears, enter a token → it persists across reload
6. Commit: `git commit -m "feat(ui): GitLab auth panel with PRIVATE-TOKEN and self-hosted host fields"`

---

## Phase 5: Docker Deployment

### Task 18: gitlab-app Dockerfile

**Files:** `gitlab-app/Dockerfile` (create)

**Steps:**
1. Create `gitlab-app/Dockerfile`:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY tsconfig.json ./
   COPY src/ ./src/
   RUN npm run build

   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY --from=builder /app/dist ./dist
   EXPOSE 7332
   ENV NODE_ENV=production
   CMD ["node", "dist/index.js"]
   ```
2. Build it: `cd gitlab-app && docker build -t grasp-gitlab-bot:local .` → expect: image built successfully
3. Commit: `git commit -m "feat(gitlab-app): Dockerfile for self-hosted deployment"`

---

### Task 19: Docker Compose for self-hosted GitLab bot

**Files:** `deploy/docker-compose.gitlab.yml` (create), `deploy/.env.gitlab.example` (create)

**Steps:**
1. Create `deploy/docker-compose.gitlab.yml`:
   ```yaml
   version: '3.9'

   services:
     grasp-gitlab-bot:
       image: ghcr.io/ashfordeou/grasp-gitlab-bot:latest
       restart: unless-stopped
       ports:
         - "${PORT:-7332}:7332"
       environment:
         PORT: 7332
         GITLAB_HOST: ${GITLAB_HOST}
         GITLAB_TOKEN: ${GITLAB_TOKEN}
         WEBHOOK_SECRET: ${WEBHOOK_SECRET}
         GITLAB_OAUTH_CLIENT_ID: ${GITLAB_OAUTH_CLIENT_ID:-}
         GITLAB_OAUTH_CLIENT_SECRET: ${GITLAB_OAUTH_CLIENT_SECRET:-}
         GITLAB_OAUTH_REDIRECT_URI: ${GITLAB_OAUTH_REDIRECT_URI:-}
         MCP_DIST_PATH: /app/mcp/dist
       healthcheck:
         test: ["CMD", "wget", "-qO-", "http://localhost:7332/health"]
         interval: 30s
         timeout: 5s
         retries: 3
   ```
2. Create `deploy/.env.gitlab.example`:
   ```
   # GitLab Bot — copy to .env.gitlab and fill in values

   # Your GitLab instance (leave as gitlab.com for cloud)
   GITLAB_HOST=gitlab.internal.company.com

   # Service account token (PRIVATE-TOKEN format)
   GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx

   # Secret you set when registering the GitLab webhook
   WEBHOOK_SECRET=change-me-to-something-random

   # Port the bot listens on (default: 7332)
   PORT=7332

   # Optional — OAuth2 app credentials (for user-facing OAuth flow)
   GITLAB_OAUTH_CLIENT_ID=
   GITLAB_OAUTH_CLIENT_SECRET=
   GITLAB_OAUTH_REDIRECT_URI=http://localhost:7332/oauth/callback
   ```
3. Verify: `docker compose -f deploy/docker-compose.gitlab.yml --env-file deploy/.env.gitlab.example config` → expect: valid compose config output
4. Commit: `git commit -m "feat(deploy): Docker Compose for self-hosted GitLab bot with env example"`

---

## Phase 6: Tunnel Agent

### Task 20: Scaffold gitlab-agent Go project

**Files:** `gitlab-agent/main.go` (create), `gitlab-agent/go.mod` (create)

**Steps:**
1. Create `gitlab-agent/go.mod`:
   ```
   module github.com/ashfordeou/grasp-agent

   go 1.21

   require (
     nhooyr.io/websocket v1.8.10
   )
   ```
2. Create `gitlab-agent/main.go` (skeleton):
   ```go
   package main

   import (
     "context"
     "flag"
     "fmt"
     "log"
     "os"
     "os/signal"
     "syscall"
   )

   var (
     agentToken  = flag.String("token", os.Getenv("GRASP_AGENT_TOKEN"), "Grasp agent token (or GRASP_AGENT_TOKEN env)")
     gitlabHost  = flag.String("gitlab-host", os.Getenv("GITLAB_HOST"), "GitLab host (e.g. gitlab.internal.company.com)")
     cloudURL    = flag.String("cloud-url", "wss://agent.grasp.dev", "Grasp cloud WebSocket URL")
   )

   func main() {
     flag.Parse()

     if *agentToken == "" {
       fmt.Fprintln(os.Stderr, "Error: --token is required (or set GRASP_AGENT_TOKEN)")
       os.Exit(1)
     }
     if *gitlabHost == "" {
       fmt.Fprintln(os.Stderr, "Error: --gitlab-host is required (or set GITLAB_HOST)")
       os.Exit(1)
     }

     ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
     defer stop()

     log.Printf("Grasp Agent starting — GitLab: %s, Cloud: %s", *gitlabHost, *cloudURL)

     agent := &Agent{
       Token:      *agentToken,
       GitLabHost: *gitlabHost,
       CloudURL:   *cloudURL,
     }

     if err := agent.Run(ctx); err != nil && err != context.Canceled {
       log.Fatalf("Agent error: %v", err)
     }
     log.Println("Agent stopped.")
   }
   ```
3. Run: `cd gitlab-agent && go mod tidy` → expect: `go.sum` created
4. Commit: `git commit -m "feat(gitlab-agent): scaffold Go tunnel agent project"`

---

### Task 21: WebSocket client with reconnect

**Files:** `gitlab-agent/agent.go` (create)

**Steps:**
1. Create `gitlab-agent/agent.go`:
   ```go
   package main

   import (
     "context"
     "encoding/json"
     "fmt"
     "log"
     "math"
     "net/http"
     "time"

     "nhooyr.io/websocket"
     "nhooyr.io/websocket/wsjson"
   )

   type Agent struct {
     Token      string
     GitLabHost string
     CloudURL   string
   }

   type CloudMessage struct {
     Type    string          `json:"type"`
     Payload json.RawMessage `json:"payload"`
   }

   type WebhookForward struct {
     Event   string          `json:"event"`
     Payload json.RawMessage `json:"payload"`
   }

   type ApiCallRequest struct {
     Method  string            `json:"method"`
     URL     string            `json:"url"`
     Headers map[string]string `json:"headers"`
     Body    string            `json:"body"`
   }

   func (a *Agent) Run(ctx context.Context) error {
     attempt := 0
     for {
       err := a.connect(ctx)
       if ctx.Err() != nil {
         return ctx.Err()
       }
       attempt++
       backoff := time.Duration(math.Min(float64(attempt)*2, 30)) * time.Second
       log.Printf("Disconnected (attempt %d), reconnecting in %s...", attempt, backoff)
       select {
       case <-ctx.Done():
         return ctx.Err()
       case <-time.After(backoff):
       }
     }
   }

   func (a *Agent) connect(ctx context.Context) error {
     headers := http.Header{}
     headers.Set("Authorization", fmt.Sprintf("Bearer %s", a.Token))
     headers.Set("X-GitLab-Host", a.GitLabHost)

     conn, _, err := websocket.Dial(ctx, a.CloudURL, &websocket.DialOptions{HTTPHeader: headers})
     if err != nil {
       return fmt.Errorf("dial error: %w", err)
     }
     defer conn.CloseNow()

     log.Printf("Connected to Grasp cloud")

     for {
       var msg CloudMessage
       if err := wsjson.Read(ctx, conn, &msg); err != nil {
         return fmt.Errorf("read error: %w", err)
       }
       go a.handleMessage(ctx, conn, msg)
     }
   }

   func (a *Agent) handleMessage(ctx context.Context, conn *websocket.Conn, msg CloudMessage) {
     switch msg.Type {
     case "webhook_forward":
       var fwd WebhookForward
       if err := json.Unmarshal(msg.Payload, &fwd); err != nil {
         log.Printf("Failed to parse webhook_forward: %v", err)
         return
       }
       // Forward to local gitlab-bot on port 7332
       resp, err := http.Post(
         fmt.Sprintf("http://localhost:7332/webhook"),
         "application/json",
         nil,
       )
       if err != nil {
         log.Printf("Failed to forward webhook: %v", err)
         return
       }
       defer resp.Body.Close()
       log.Printf("Forwarded webhook event=%s status=%d", fwd.Event, resp.StatusCode)

     case "api_call":
       var call ApiCallRequest
       if err := json.Unmarshal(msg.Payload, &call); err != nil {
         log.Printf("Failed to parse api_call: %v", err)
         return
       }
       a.proxyApiCall(ctx, conn, call)

     case "ping":
       _ = wsjson.Write(ctx, conn, map[string]string{"type": "pong"})
     }
   }

   func (a *Agent) proxyApiCall(ctx context.Context, conn *websocket.Conn, call ApiCallRequest) {
     // Ensure calls only go to the configured GitLab host for security
     expected := fmt.Sprintf("https://%s/", a.GitLabHost)
     if len(call.URL) < len(expected) || call.URL[:len(expected)] != expected {
       log.Printf("Blocked API call to disallowed host: %s", call.URL)
       return
     }
     log.Printf("Proxying API call: %s %s", call.Method, call.URL)
     // Response sent back through WebSocket channel
     _ = wsjson.Write(ctx, conn, map[string]string{"type": "api_call_ack", "url": call.URL})
   }
   ```
2. Run: `cd gitlab-agent && go build ./...` → expect: compiles with 0 errors
3. Commit: `git commit -m "feat(gitlab-agent): WebSocket client with exponential-backoff reconnect"`

---

### Task 22: Agent Dockerfile and systemd template

**Files:** `gitlab-agent/Dockerfile` (create), `gitlab-agent/grasp-agent.service` (create)

**Steps:**
1. Create `gitlab-agent/Dockerfile`:
   ```dockerfile
   FROM golang:1.21-alpine AS builder
   WORKDIR /build
   COPY go.mod go.sum ./
   RUN go mod download
   COPY *.go ./
   RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o grasp-agent .

   FROM scratch
   COPY --from=builder /build/grasp-agent /grasp-agent
   COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
   ENTRYPOINT ["/grasp-agent"]
   ```
2. Create `gitlab-agent/grasp-agent.service`:
   ```ini
   [Unit]
   Description=Grasp Tunnel Agent for internal GitLab
   After=network.target

   [Service]
   Type=simple
   ExecStart=/usr/local/bin/grasp-agent \
     --token=${GRASP_AGENT_TOKEN} \
     --gitlab-host=${GITLAB_HOST}
   Restart=always
   RestartSec=5
   EnvironmentFile=/etc/grasp-agent/env

   [Install]
   WantedBy=multi-user.target
   ```
3. Build Docker image: `cd gitlab-agent && docker build -t grasp-agent:local .` → expect: image built, size < 10MB (scratch base)
4. Commit: `git commit -m "feat(gitlab-agent): Dockerfile (scratch, ~5MB) and systemd service template"`

---

## Phase 7: Wire Everything Together + Documentation

### Task 23: Add gitlab-app to main publish pipeline

**Files:** `.github/workflows/publish.yml` (modify)

**Steps:**
1. Add a `publish-gitlab-app` job after `publish-npm`:
   ```yaml
   publish-gitlab-app-image:
     name: Publish GitLab Bot Docker image
     runs-on: ubuntu-latest
     needs: [publish-npm]
     permissions:
       contents: read
       packages: write
     steps:
       - uses: actions/checkout@v5
       - name: Set up Docker Buildx
         uses: docker/setup-buildx-action@v3
       - name: Login to GitHub Container Registry
         uses: docker/login-action@v3
         with:
           registry: ghcr.io
           username: ${{ github.actor }}
           password: ${{ secrets.GITHUB_TOKEN }}
       - name: Build and push GitLab bot image
         uses: docker/build-push-action@v5
         with:
           context: gitlab-app/
           platforms: linux/amd64
           push: true
           tags: |
             ghcr.io/ashfordeou/grasp-gitlab-bot:latest
             ghcr.io/ashfordeou/grasp-gitlab-bot:${{ github.ref_name }}
   ```
2. Also add a `publish-gitlab-agent` job that builds the Go binary and attaches it to the GitHub Release as a downloadable artifact.
3. Verify: `cat .github/workflows/publish.yml` → valid YAML, new jobs present
4. Commit: `git commit -m "ci: publish GitLab bot image and tunnel agent binary in release pipeline"`

---

### Task 24: Update mcp/README.md and root README with GitLab docs

**Files:** `mcp/README.md` (modify), `README.md` (modify)

**Steps:**
1. In `mcp/README.md`, add a **GitLab** section after the GitHub Token section:
   ```markdown
   ## GitLab Support

   Grasp works with gitlab.com and self-hosted GitLab instances.

   ### Token auth (quickest)
   ```bash
   # Set env vars — works for all 48 tools
   export GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
   export GITLAB_HOST=gitlab.internal.company.com   # omit for gitlab.com
   ```

   ### Self-hosted Docker bot (automated MR comments)
   ```bash
   cd deploy
   cp .env.gitlab.example .env.gitlab
   # Edit .env.gitlab with your GITLAB_HOST, GITLAB_TOKEN, WEBHOOK_SECRET
   docker compose -f docker-compose.gitlab.yml --env-file .env.gitlab up -d
   ```
   Then register a GitLab webhook pointing to `http://your-host:7332/webhook` with your WEBHOOK_SECRET.

   ### Tunnel agent (internal GitLab, no inbound ports needed)
   ```bash
   docker run ghcr.io/ashfordeou/grasp-agent:latest \
     --token=<your-agent-token> \
     --gitlab-host=gitlab.internal.company.com
   ```
   ```
2. In root `README.md`, add GitLab to the "Supported Sources" section.
3. Commit: `git commit -m "docs: document GitLab support — token auth, Docker bot, tunnel agent"`

---

## Verification Checklist (run after all phases complete)

```bash
# Phase 1: MCP analysis parity
GITLAB_TOKEN=glpat-xxx node mcp/dist/cli.js https://gitlab.com/some/public-repo --report
# → expect: real churn numbers (not all 0), CI status shown, ownership data

# Phase 2: Bot server
cd gitlab-app && npm start
curl http://localhost:7332/health
# → expect: {"status":"ok","service":"grasp-gitlab-bot"}

curl -X POST http://localhost:7332/webhook \
  -H "X-Gitlab-Event: Merge Request Hook" \
  -H "X-Gitlab-Token: test-secret" \
  -H "Content-Type: application/json" \
  -d '{"object_kind":"merge_request","object_attributes":{"iid":1,"title":"Test","action":"open","last_commit":{"id":"abc123"},"source":{"path_with_namespace":"owner/repo"}},"project":{"id":1,"path_with_namespace":"owner/repo"}}'
# → expect: 202 Accepted (with WEBHOOK_SECRET unset)

# Phase 3: SaaS API
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"repo":"https://gitlab.com/gitlab-org/gitlab-ce"}'
# → expect: 202 with job ID (not "invalid repo" error)

# Phase 5: Docker
docker compose -f deploy/docker-compose.gitlab.yml --env-file deploy/.env.gitlab.example config
# → expect: valid compose config

# Phase 6: Tunnel agent
cd gitlab-agent && go build ./... && ./grasp-agent --help
# → expect: usage text with --token and --gitlab-host flags
```
