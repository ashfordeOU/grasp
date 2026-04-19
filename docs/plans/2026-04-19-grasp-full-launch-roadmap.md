# Plan: Grasp Full Launch Roadmap — v3.0 to Market Leader
Date: 2026-04-19
Goal: Take Grasp from v2.9.1 to a fully monetised, enterprise-ready market leader across 4 phases
Architecture: Existing stack extended — browser app (index.html), team-dashboard.html, MCP server (mcp/), GitHub App (github-app/), SaaS API (saas/), Slack/Teams bot (slack-bot/), VS Code extension (vscode-extension/), JetBrains plugin (jetbrains-plugin/), Neovim plugin (neovim-plugin/)
Tech stack: TypeScript, Node.js 18+, Express, Redis, React (embedded), D3, Kotlin (JetBrains), Lua (Neovim), GitHub API, GitLab API, Slack API, MCP protocol

---

## PHASE 1 — Foundation & Immediate Wins (Weeks 1–4)
> All self-contained. No external accounts or partner agreements needed.

---

## Task 1: Add `grasp.yml` config parser to MCP analyzer

**Files:** `mcp/src/config.ts` (create), `mcp/tests/config.test.ts` (create)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/config.test.ts
   import { loadGraspConfig, validateConfig, type GraspConfig } from '../src/config.js';
   import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';

   let dir: string;
   beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'grasp-cfg-')); });
   afterEach(() => rmSync(dir, { recursive: true }));

   test('loads valid grasp.yml', async () => {
     writeFileSync(join(dir, 'grasp.yml'), `
   rules:
     - forbidden: "utils -> services"
     - max_blast_radius: 50
     - min_health_score: 80
   `);
     const cfg = await loadGraspConfig(dir);
     expect(cfg.rules).toHaveLength(3);
   });

   test('returns null when no grasp.yml present', async () => {
     const cfg = await loadGraspConfig(dir);
     expect(cfg).toBeNull();
   });

   test('throws on invalid rule structure', () => {
     const bad = { rules: [{ unknown_key: 'x' }] };
     expect(() => validateConfig(bad)).toThrow('Unknown rule key: unknown_key');
   });
   ```
2. Verify fails: `cd mcp && npm test -- --testPathPattern=config` → `FAIL: Cannot find module '../src/config.js'`
3. Implement:
   ```typescript
   // mcp/src/config.ts
   import { readFile } from 'node:fs/promises';
   import { join } from 'node:path';
   import { parse as parseYaml } from 'yaml';

   export interface ForbiddenRule  { forbidden: string }
   export interface MaxBlastRule   { max_blast_radius: number }
   export interface MinHealthRule  { min_health_score: number }
   export interface MaxComplexityRule { max_complexity: number }
   export interface MaxDepthRule   { max_layer_depth: number }
   export interface RequiredCoverageRule { required_coverage: number }

   export type GraspRule =
     | ForbiddenRule | MaxBlastRule | MinHealthRule
     | MaxComplexityRule | MaxDepthRule | RequiredCoverageRule;

   export interface GraspConfig {
     rules: GraspRule[];
     ignore?: string[];
     thresholds?: Record<string, number>;
   }

   const KNOWN_KEYS = new Set([
     'forbidden','max_blast_radius','min_health_score',
     'max_complexity','max_layer_depth','required_coverage',
   ]);

   export function validateConfig(raw: unknown): GraspConfig {
     if (!raw || typeof raw !== 'object') throw new Error('grasp.yml must be an object');
     const obj = raw as Record<string, unknown>;
     const rules: GraspRule[] = [];
     for (const rule of (obj.rules as unknown[] ?? [])) {
       if (!rule || typeof rule !== 'object') throw new Error('Each rule must be an object');
       const key = Object.keys(rule as object)[0];
       if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown rule key: ${key}`);
       rules.push(rule as GraspRule);
     }
     return { rules, ignore: obj.ignore as string[], thresholds: obj.thresholds as Record<string, number> };
   }

   export async function loadGraspConfig(dir: string): Promise<GraspConfig | null> {
     for (const name of ['grasp.yml', 'grasp.yaml', '.grasp.yml']) {
       try {
         const raw = await readFile(join(dir, name), 'utf-8');
         return validateConfig(parseYaml(raw));
       } catch (e: unknown) {
         if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
       }
     }
     return null;
   }
   ```
4. Add `yaml` dependency: `cd mcp && npm install yaml`
5. Verify passes: `cd mcp && npm test -- --testPathPattern=config` → `PASS (3 tests)`
6. Commit: `git commit -m "feat: add grasp.yml config parser with rule validation"`

---

## Task 2: Rule evaluator — check analysis result against grasp.yml rules

**Files:** `mcp/src/config.ts` (modify), `mcp/tests/config.test.ts` (modify)

**Steps:**
1. Add failing test:
   ```typescript
   // Append to mcp/tests/config.test.ts
   import { evaluateRules, type RuleViolation } from '../src/config.js';

   test('evaluateRules detects min_health_score violation', () => {
     const cfg: GraspConfig = { rules: [{ min_health_score: 80 }] };
     const violations = evaluateRules(cfg, { score: 65, blastMap: {}, layers: [] });
     expect(violations).toHaveLength(1);
     expect(violations[0].rule).toBe('min_health_score');
     expect(violations[0].message).toContain('65');
   });

   test('evaluateRules detects max_blast_radius violation', () => {
     const cfg: GraspConfig = { rules: [{ max_blast_radius: 10 }] };
     const violations = evaluateRules(cfg, { score: 90, blastMap: { 'src/auth.ts': 45 }, layers: [] });
     expect(violations[0].rule).toBe('max_blast_radius');
     expect(violations[0].file).toBe('src/auth.ts');
   });

   test('evaluateRules passes when all rules met', () => {
     const cfg: GraspConfig = { rules: [{ min_health_score: 80 }] };
     const violations = evaluateRules(cfg, { score: 95, blastMap: {}, layers: [] });
     expect(violations).toHaveLength(0);
   });
   ```
2. Verify fails: `npm test -- --testPathPattern=config` → `FAIL: evaluateRules is not a function`
3. Implement — append to `mcp/src/config.ts`:
   ```typescript
   export interface RuleViolation {
     rule: string;
     message: string;
     file?: string;
     severity: 'error' | 'warn';
   }

   export interface EvalContext {
     score: number;
     blastMap: Record<string, number>;
     layers: string[];
   }

   export function evaluateRules(cfg: GraspConfig, ctx: EvalContext): RuleViolation[] {
     const violations: RuleViolation[] = [];
     for (const rule of cfg.rules) {
       if ('min_health_score' in rule && ctx.score < rule.min_health_score) {
         violations.push({ rule: 'min_health_score', severity: 'error',
           message: `Health score ${ctx.score} is below required minimum ${rule.min_health_score}` });
       }
       if ('max_blast_radius' in rule) {
         for (const [file, radius] of Object.entries(ctx.blastMap)) {
           if (radius > rule.max_blast_radius) {
             violations.push({ rule: 'max_blast_radius', severity: 'warn', file,
               message: `${file} blast radius ${radius} exceeds max ${rule.max_blast_radius}` });
           }
         }
       }
     }
     return violations;
   }
   ```
4. Verify passes: `npm test -- --testPathPattern=config` → `PASS (6 tests)`
5. Commit: `git commit -m "feat: grasp.yml rule evaluator with violation reporting"`

---

## Task 3: `grasp_config_check` MCP tool — run grasp.yml against a session

**Files:** `mcp/src/index.ts` (modify — add tool registration)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/config-tool.test.ts
   import { evaluateRules } from '../src/config.js';

   test('forbidden layer rule placeholder evaluates cleanly', () => {
     const cfg = { rules: [{ min_health_score: 90 }] };
     const result = evaluateRules(cfg, { score: 50, blastMap: {}, layers: [] });
     expect(result[0].message).toMatch(/50.*90/);
   });
   ```
2. Verify fails: `npm test -- --testPathPattern=config-tool` → `FAIL`
3. Add tool in `mcp/src/index.ts` after the existing `grasp_pr_review` tool block:
   ```typescript
   server.registerTool('grasp_config_check', {
     description: 'Run grasp.yml architecture rules against a session — returns violations with severity and file',
     inputSchema: {
       session_id: { type: 'string', description: 'Session ID from grasp_analyze' },
       config_path: { type: 'string', description: 'Optional path to directory containing grasp.yml (defaults to session source path)' },
     },
   }, async ({ session_id, config_path }: { session_id: string; config_path?: string }) => {
     const session = sessionStore.get(session_id);
     if (!session) return { content: [{ type: 'text', text: 'Session not found. Run grasp_analyze first.' }] };
     const dir = config_path ?? (session.source.type === 'local' ? session.source.path : process.cwd());
     const { loadGraspConfig, evaluateRules } = await import('./config.js');
     const cfg = await loadGraspConfig(dir);
     if (!cfg) return { content: [{ type: 'text', text: `No grasp.yml found in ${dir}` }] };
     const blastMap: Record<string, number> = {};
     for (const conn of session.result.connections) {
       blastMap[conn.source] = (blastMap[conn.source] ?? 0) + 1;
     }
     const violations = evaluateRules(cfg, {
       score: session.result.summary.score,
       blastMap,
       layers: session.result.summary.layers ?? [],
     });
     if (violations.length === 0) {
       return { content: [{ type: 'text', text: '✅ All grasp.yml rules passed.' }] };
     }
     const lines = violations.map(v =>
       `${v.severity === 'error' ? '❌' : '⚠️'} [${v.rule}]${v.file ? ` ${v.file}` : ''}: ${v.message}`
     );
     return { content: [{ type: 'text', text: `${violations.length} rule violation(s):\n\n${lines.join('\n')}` }] };
   });
   ```
4. Build: `cd mcp && npm run build` → expect: no TypeScript errors
5. Verify test passes: `npm test -- --testPathPattern=config-tool` → `PASS`
6. Commit: `git commit -m "feat: grasp_config_check MCP tool — validates session against grasp.yml rules"`

---

## Task 4: CLI enforces grasp.yml — `grasp . --check` exits 1 on violations

**Files:** `mcp/src/cli.ts` (modify)

**Steps:**
1. Read current `mcp/src/cli.ts` to find where the analysis result is printed and where the process exits
2. Add `--check` flag handling after the existing `--format` flag parsing:
   ```typescript
   // In mcp/src/cli.ts — after existing result output block:
   if (args.includes('--check')) {
     const { loadGraspConfig, evaluateRules } = await import('./config.js');
     const cfg = await loadGraspConfig(target);
     if (cfg) {
       const blastMap: Record<string, number> = {};
       for (const conn of result.connections) {
         blastMap[conn.source] = (blastMap[conn.source] ?? 0) + 1;
       }
       const violations = evaluateRules(cfg, {
         score: result.summary.score,
         blastMap,
         layers: result.summary.layers ?? [],
       });
       if (violations.length > 0) {
         console.error(`\n❌ grasp.yml violations (${violations.length}):`);
         for (const v of violations) {
           console.error(`  ${v.severity === 'error' ? '✗' : '!'} [${v.rule}]${v.file ? ` ${v.file}` : ''}: ${v.message}`);
         }
         process.exit(1);
       } else {
         console.log('\n✅ All grasp.yml rules passed.');
       }
     }
   }
   ```
3. Build and smoke-test:
   ```bash
   cd mcp && npm run build
   echo "rules:\n  - min_health_score: 100" > /tmp/test-grasp/grasp.yml
   node dist/index.js /tmp/test-grasp --check
   # expect: exits 1 with "❌ grasp.yml violations"
   ```
4. Commit: `git commit -m "feat: CLI --check flag enforces grasp.yml rules, exits 1 on violations"`

---

## Task 5: GitHub Actions workflow template for grasp.yml CI gate

**Files:** `docs/examples/grasp-check.yml` (create)

**Steps:**
1. Create:
   ```yaml
   # docs/examples/grasp-check.yml
   # Copy to .github/workflows/grasp-check.yml in your repo
   name: Grasp Architecture Check
   on:
     pull_request:
       types: [opened, synchronize, reopened]
     push:
       branches: [main]

   jobs:
     grasp-check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - name: Run Grasp architecture check
           run: npx --package=grasp-mcp-server grasp . --check
           # Exits 1 if any grasp.yml rule is violated
         - name: Upload SARIF to Code Scanning
           if: always()
           run: |
             npx --package=grasp-mcp-server grasp . --format=sarif --output=grasp.sarif
             # Upload via GitHub CLI (requires write permissions)
             gh api \
               --method POST \
               -H "Accept: application/vnd.github+json" \
               /repos/${{ github.repository }}/code-scanning/sarifs \
               -f commit_sha=${{ github.sha }} \
               -f ref=${{ github.ref }} \
               -F sarif=@grasp.sarif
           env:
             GH_TOKEN: ${{ github.token }}
   ```
2. Verify YAML is valid: `python3 -c "import yaml; yaml.safe_load(open('docs/examples/grasp-check.yml'))"` → no error
3. Commit: `git commit -m "docs: add GitHub Actions workflow template for grasp.yml CI gate + SARIF upload"`

---

## Task 6: SARIF auto-upload in GitHub App on every PR analysis

**Files:** `github-app/src/comment.ts` (modify), `github-app/src/index.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // github-app/tests/sarif.test.ts
   import { buildSarifPayload } from '../src/comment.js';

   test('buildSarifPayload returns base64 SARIF string', () => {
     const payload = buildSarifPayload([{ file: 'src/auth.ts', message: 'Hardcoded secret', severity: 'error', line: 12 }]);
     const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
     expect(decoded.version).toBe('2.1.0');
     expect(decoded.runs[0].results).toHaveLength(1);
     expect(decoded.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('src/auth.ts');
   });
   ```
2. Add to `github-app/src/comment.ts`:
   ```typescript
   export interface SarifIssue { file: string; message: string; severity: 'error' | 'warning'; line: number }

   export function buildSarifPayload(issues: SarifIssue[]): string {
     const sarif = {
       version: '2.1.0',
       $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
       runs: [{
         tool: { driver: { name: 'Grasp', version: '2.9.1', rules: [] } },
         results: issues.map(i => ({
           ruleId: 'grasp/issue',
           level: i.severity === 'error' ? 'error' : 'warning',
           message: { text: i.message },
           locations: [{ physicalLocation: { artifactLocation: { uri: i.file }, region: { startLine: i.line } } }],
         })),
       }],
     };
     return Buffer.from(JSON.stringify(sarif)).toString('base64');
   }

   export async function uploadSarif(owner: string, repo: string, sha: string, ref: string, token: string, sarifB64: string): Promise<void> {
     const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/code-scanning/sarifs`, {
       method: 'POST',
       headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
       body: JSON.stringify({ commit_sha: sha, ref, sarif: sarifB64 }),
     });
     if (!res.ok && res.status !== 202) console.warn('[grasp] SARIF upload failed:', res.status);
   }
   ```
3. Wire into `github-app/src/index.ts` — after `upsertComment(...)` call, add:
   ```typescript
   // Auto-upload SARIF if Code Scanning is enabled for this repo
   try {
     const { buildSarifPayload, uploadSarif } = await import('./comment.js');
     const sarifPayload = buildSarifPayload(
       (summary as any).securityIssues?.map((i: any) => ({
         file: i.file ?? 'unknown', message: i.message, severity: 'error', line: i.line ?? 1,
       })) ?? []
     );
     await uploadSarif(owner, repo, sha, `refs/pull/${pullNumber}/head`, token, sarifPayload);
   } catch { /* non-fatal — Code Scanning may not be enabled */ }
   ```
4. Build: `cd github-app && npm run build` (or `tsc --noEmit`)
5. Commit: `git commit -m "feat: auto-upload SARIF to GitHub Code Scanning on every PR analysis"`

---

## Task 7: Inline PR review comments at high-severity lines

**Files:** `github-app/src/comment.ts` (modify), `github-app/src/index.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // github-app/tests/inline-review.test.ts
   import { buildReviewComments } from '../src/comment.js';

   test('buildReviewComments returns inline comments for high-blast files', () => {
     const comments = buildReviewComments(
       ['src/auth.ts', 'src/utils.ts'],
       { blastMap: { 'src/auth.ts': 87, 'src/utils.ts': 3 }, securityFiles: ['src/auth.ts'], complexMap: { 'src/auth.ts': 45 } }
     );
     expect(comments).toHaveLength(1); // only auth.ts qualifies
     expect(comments[0].path).toBe('src/auth.ts');
     expect(comments[0].body).toContain('87 files');
   });
   ```
2. Add to `github-app/src/comment.ts`:
   ```typescript
   export interface ReviewComment { path: string; position: number; body: string }
   export interface ReviewContext {
     blastMap: Record<string, number>;
     securityFiles: string[];
     complexMap: Record<string, number>;
   }

   export function buildReviewComments(changedFiles: string[], ctx: ReviewContext): ReviewComment[] {
     const comments: ReviewComment[] = [];
     for (const file of changedFiles) {
       const blast = ctx.blastMap[file] ?? 0;
       const complexity = ctx.complexMap[file] ?? 0;
       const hasSecurity = ctx.securityFiles.includes(file);
       const notes: string[] = [];
       if (blast >= 20) notes.push(`⚠️ **Blast radius: ${blast} files** — changing this file affects ${blast} dependents`);
       if (complexity >= 30) notes.push(`🔴 **Cyclomatic complexity: ${complexity}** — consider splitting this file`);
       if (hasSecurity) notes.push(`🔐 **Security issue detected** — check hardcoded secrets or injection risks`);
       if (notes.length > 0) {
         comments.push({ path: file, position: 1, body: `**Grasp Analysis**\n\n${notes.join('\n')}\n\n[View full report →](https://grasp.ashforde.org)` });
       }
     }
     return comments;
   }

   export async function postReview(owner: string, repo: string, pullNumber: number, sha: string, token: string, comments: ReviewComment[]): Promise<void> {
     if (comments.length === 0) return;
     await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
       method: 'POST',
       headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
       body: JSON.stringify({ commit_id: sha, event: 'COMMENT', comments }),
     });
   }
   ```
3. Wire into `github-app/src/index.ts` — after upsertComment:
   ```typescript
   const { buildReviewComments, postReview } = await import('./comment.js');
   const reviewComments = buildReviewComments(changedFiles, {
     blastMap: (summary as any).blastMap ?? {},
     securityFiles: (summary as any).securityFiles ?? [],
     complexMap: (summary as any).complexMap ?? {},
   });
   await postReview(owner, repo, pullNumber, sha, token, reviewComments);
   ```
4. Commit: `git commit -m "feat: inline PR review comments at high-blast-radius and security files"`

---

## Task 8: Live health score badge endpoint in SaaS

**Files:** `saas/src/routes.ts` (modify), `saas/tests/badge.test.ts` (create)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/badge.test.ts
   import { buildBadgeSvg } from '../src/routes.js';

   test('buildBadgeSvg returns valid SVG with score', () => {
     const svg = buildBadgeSvg(87, 'A');
     expect(svg).toContain('<svg');
     expect(svg).toContain('87');
     expect(svg).toContain('A');
     expect(svg).toContain('22c55e'); // green for A
   });

   test('buildBadgeSvg uses red for F grade', () => {
     const svg = buildBadgeSvg(23, 'F');
     expect(svg).toContain('ef4444');
   });
   ```
2. Add to `saas/src/routes.ts`:
   ```typescript
   export function buildBadgeSvg(score: number, grade: string): string {
     const colors: Record<string, string> = { A: '22c55e', B: '84cc16', C: 'f59e0b', D: 'f97316', F: 'ef4444' };
     const color = colors[grade] ?? '64748b';
     const label = 'grasp';
     const value = `${score} ${grade}`;
     const lw = 50, vw = 58, h = 20;
     return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw+vw}" height="${h}">
       <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
       <rect rx="3" width="${lw+vw}" height="${h}" fill="#555"/>
       <rect rx="3" x="${lw}" width="${vw}" height="${h}" fill="#${color}"/>
       <rect width="${lw+vw}" height="${h}" rx="3" fill="url(#s)"/>
       <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
         <text x="${lw/2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
         <text x="${lw/2}" y="14">${label}</text>
         <text x="${lw+vw/2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
         <text x="${lw+vw/2}" y="14">${value}</text>
       </g>
     </svg>`;
   }
   ```
3. Add route in `saas/src/routes.ts` inside `buildRouter`:
   ```typescript
   router.get('/badge/:owner/:repo.svg', async (req: Request, res: Response) => {
     const { owner, repo } = req.params;
     const cacheKey = buildCacheKey(`${owner}/${repo}`);
     const cached = await cache.get(cacheKey) as { summary?: { score: number; grade: string } } | null;
     if (!cached?.summary) {
       res.setHeader('Content-Type', 'image/svg+xml');
       res.setHeader('Cache-Control', 'no-cache');
       return res.send(buildBadgeSvg(0, '?'));
     }
     res.setHeader('Content-Type', 'image/svg+xml');
     res.setHeader('Cache-Control', 'public, max-age=3600');
     res.send(buildBadgeSvg(cached.summary.score, cached.summary.grade));
   });
   ```
4. Verify test: `cd saas && npm test -- --testPathPattern=badge` → `PASS`
5. Commit: `git commit -m "feat: live SVG health score badge endpoint /badge/:owner/:repo.svg"`

---

## Task 9: `@grasp-bot analyze` comment trigger in GitHub App

**Files:** `github-app/src/index.ts` (modify)

**Steps:**
1. Add `issue_comment` event handler alongside existing `pull_request` handler:
   ```typescript
   // In github-app/src/index.ts — add new event branch in the request handler:
   if (event === 'issue_comment' && payload.action === 'created') {
     const body: string = payload.comment?.body ?? '';
     if (!body.toLowerCase().includes('@grasp-bot analyze')) return;
     const owner: string = payload.repository.owner.login;
     const repo: string  = payload.repository.name;
     const issueNumber: number = payload.issue.number;
     const installId: number   = payload.installation?.id;
     if (!installId) return;
     const token = await getInstallationToken(APP_ID, getPrivateKey(), installId);
     // Post "analyzing..." reaction
     await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${payload.comment.id}/reactions`, {
       method: 'POST',
       headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
       body: JSON.stringify({ content: 'eyes' }),
     });
     // Run analysis and post result as comment
     const sha = payload.issue.pull_request?.head?.sha ?? 'HEAD';
     const fileCount = await getFileCount(owner, repo, sha, token);
     const summary = await analyzeRepo(owner, repo, sha, token);
     const commentBody = buildComment(summary, `${owner}/${repo}`, `Analysis requested`, GRASP_UI_URL);
     await upsertComment(owner, repo, issueNumber, token, commentBody);
   }
   ```
2. Add `issue_comment` to the webhook events list in `github-app/app-manifest.json` (or equivalent config):
   ```json
   { "default_events": ["pull_request", "issue_comment"] }
   ```
3. Test locally: Use `smee.io` or `ngrok` to forward webhook events; comment `@grasp-bot analyze` on a test PR
4. Commit: `git commit -m "feat: @grasp-bot analyze comment trigger — runs analysis on demand from any PR/issue"`

---

## Task 10: JetBrains plugin — signing setup and marketplace metadata

**Files:** `jetbrains-plugin/build.gradle.kts` (modify), `jetbrains-plugin/src/main/resources/META-INF/plugin.xml` (modify)

**Steps:**
1. Read current `jetbrains-plugin/build.gradle.kts` to find existing publishPlugin block
2. Add signing and publishing config:
   ```kotlin
   // In jetbrains-plugin/build.gradle.kts — add/update:
   intellijPlatform {
     pluginConfiguration {
       name = "Grasp — Code Architecture Visualizer"
       version = "1.0.0"
       description = """
         <p><b>Grasp</b> gives you a live dependency graph, architecture diagram, and health score for your project — directly in your IDE.</p>
         <ul>
           <li>Interactive dependency graph — see how every file connects</li>
           <li>Health score (A–F) with architecture issues highlighted</li>
           <li>Security scanner — hardcoded secrets, injection risks</li>
           <li>Auto-reanalyses on file save (2s debounce)</li>
           <li>Status bar: live dep count for the active file</li>
           <li>Blast radius: highlight everything that breaks if you change a file</li>
         </ul>
         <p>Works with JavaScript, TypeScript, Python, Go, Java, Rust, Kotlin, and 25+ more languages.</p>
       """
       changeNotes = "<ul><li>Initial release — 47-tool analysis engine</li></ul>"
     }
     signing {
       certificateChain = System.getenv("PLUGIN_CERTIFICATE_CHAIN")
       privateKey = System.getenv("PLUGIN_PRIVATE_KEY")
       password = System.getenv("PLUGIN_PRIVATE_KEY_PASSWORD")
     }
     publishing {
       token = System.getenv("PUBLISH_TOKEN")
     }
   }
   ```
3. Build and verify: `cd jetbrains-plugin && ./gradlew buildPlugin` → produces `build/distributions/grasp-*.zip`
4. Verify plugin descriptor: `cd jetbrains-plugin && ./gradlew verifyPlugin` → `BUILD SUCCESSFUL`
5. Commit: `git commit -m "build: JetBrains plugin signing and marketplace publishing config"`

---

## Task 11: VS Code hover provider — inline dep count in editor

**Files:** `vscode-extension/src/extension.ts` (modify)

**Steps:**
1. Add hover provider registration in the `activate` function:
   ```typescript
   // In vscode-extension/src/extension.ts, inside activate():
   context.subscriptions.push(
     vscode.languages.registerHoverProvider(
       ['javascript','typescript','python','go','java','rust','ruby','php','c','cpp','csharp'],
       {
         provideHover(document, _position, _token) {
           const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
           if (!ws) return;
           const rel = path.relative(ws, document.uri.fsPath).replace(/\\/g, '/');
           const analysisData = provider.getLastAnalysis();
           if (!analysisData) return;
           const deps      = analysisData.connections?.filter((c: any) => c.source === rel).length ?? 0;
           const dependents = analysisData.connections?.filter((c: any) => c.target === rel).length ?? 0;
           const hotspot   = dependents >= 10 ? ' 🔥 hotspot' : '';
           const md = new vscode.MarkdownString(
             `**Grasp** · \`${rel}\`\n\n` +
             `↑ ${deps} imports · ↓ ${dependents} dependents${hotspot}`
           );
           md.isTrusted = true;
           return new vscode.Hover(md);
         },
       }
     )
   );
   ```
2. Expose `getLastAnalysis()` on `GraspViewProvider` class:
   ```typescript
   // In GraspViewProvider class:
   private lastAnalysis: unknown = null;
   getLastAnalysis() { return this.lastAnalysis; }
   // Set this.lastAnalysis = result when analysis completes
   ```
3. Build: `cd vscode-extension && npm run compile` → 0 errors
4. Manual test: Open any JS/TS file in a workspace that Grasp has analyzed; hover over the filename in the editor breadcrumb → tooltip shows dep counts
5. Commit: `git commit -m "feat: VS Code hover provider — inline dep count and hotspot indicator"`

---

## Task 12: Neovim plugin — publish to Lazy.nvim registry + documentation

**Files:** `neovim-plugin/README.md` (modify), `neovim-plugin/lua/grasp/init.lua` (modify)

**Steps:**
1. Add installation instructions to `neovim-plugin/README.md`:
   ```markdown
   ## Installation

   ### lazy.nvim
   ```lua
   { 'ashfordeOU/grasp', branch = 'main', config = true, ft = {'javascript','typescript','python','go','rust'} }
   ```

   ### packer.nvim
   ```lua
   use { 'ashfordeOU/grasp', config = function() require('grasp').setup() end }
   ```

   ## Commands
   | Command | Action |
   |---------|--------|
   | `:GraspAnalyze` | Analyse current workspace |
   | `:GraspOpen` | Open graph in browser |
   | `:GraspHotspots` | List top 10 hotspot files |
   | `:GraspDeps` | Show deps for current file |
   ```
2. Add `:GraspHotspots` and `:GraspDeps` commands in `neovim-plugin/lua/grasp/init.lua`:
   ```lua
   vim.api.nvim_create_user_command('GraspHotspots', function()
     local result = M._last_result
     if not result then vim.notify('Run :GraspAnalyze first', vim.log.levels.WARN) return end
     local hotspots = result.hotspots or {}
     local lines = {}
     for i, h in ipairs(hotspots) do
       if i > 10 then break end
       table.insert(lines, string.format('%d. %s (score: %s)', i, h.file, h.score or '?'))
     end
     vim.notify(table.concat(lines, '\n'), vim.log.levels.INFO)
   end, {})

   vim.api.nvim_create_user_command('GraspDeps', function()
     local file = vim.fn.expand('%:.')
     local result = M._last_result
     if not result then vim.notify('Run :GraspAnalyze first', vim.log.levels.WARN) return end
     local deps = {}
     for _, c in ipairs(result.connections or {}) do
       if c.source == file then table.insert(deps, c.target) end
     end
     if #deps == 0 then vim.notify('No deps for ' .. file, vim.log.levels.INFO)
     else vim.notify(file .. ' imports:\n' .. table.concat(deps, '\n'), vim.log.levels.INFO) end
   end, {})
   ```
3. Commit: `git commit -m "feat: Neovim plugin — GraspHotspots + GraspDeps commands, lazy.nvim install docs"`

---

## PHASE 2 — Market Expansion (Months 2–3)
> Requires: Phase 1 complete. Some tasks need external accounts (GitHub Marketplace, GitLab).

---

## Task 13: GitHub Marketplace — app manifest and listing assets

**Files:** `github-app/marketplace/` (create directory with listing files)

**Steps:**
1. Create `github-app/marketplace/description.md`:
   ```markdown
   ## Grasp — Architecture Health on Every PR

   Automatically analyses your codebase on every pull request and posts a health report with:

   - **Health Score (A–F)** — instant signal on architecture quality
   - **Blast Radius** — how many files break if this PR merges
   - **Circular Dependency detection** — catches dependency cycles before they ship
   - **Security scanner** — hardcoded secrets, SQL injection, eval() usage
   - **Inline review comments** — warnings at the exact lines that need attention
   - **SARIF upload** — findings appear in GitHub Code Scanning automatically

   Zero config. Install on any repo, public or private. Works with 33 languages.
   ```
2. Create `github-app/marketplace/pricing.yml`:
   ```yaml
   plans:
     - name: Free
       price: 0
       repos: 3
       features: [PR comments, health score, security scan]
     - name: Team
       price: 29
       unit: month
       repos: unlimited
       features: [everything in Free, persistent history, inline review comments, SARIF upload, priority support]
     - name: Enterprise
       price: custom
       features: [everything in Team, self-hosted option, SSO, audit logs, SLA]
   ```
3. Create `github-app/marketplace/screenshots.md` listing required screenshots:
   - PR comment with health score
   - Inline review comment at high-severity line
   - Team Dashboard with multiple repos
   - SARIF findings in Code Scanning UI
4. Commit: `git commit -m "docs: GitHub Marketplace listing assets — description, pricing, screenshot guide"`

---

## Task 14: Pro tier API key system in SaaS

**Files:** `saas/src/auth.ts` (create), `saas/src/routes.ts` (modify), `saas/src/server.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/auth.test.ts
   import { generateApiKey, validateApiKey, type ApiKeyRecord } from '../src/auth.js';

   test('generateApiKey produces a 32-char hex string prefixed gsp_', () => {
     const key = generateApiKey('free');
     expect(key.apiKey).toMatch(/^gsp_[a-f0-9]{32}$/);
   });

   test('validateApiKey returns tier for known key', () => {
     const { apiKey } = generateApiKey('pro');
     const store = new Map<string, ApiKeyRecord>();
     store.set(apiKey, { tier: 'pro', createdAt: new Date().toISOString(), owner: 'test@example.com' });
     const result = validateApiKey(apiKey, store);
     expect(result?.tier).toBe('pro');
   });

   test('validateApiKey returns null for unknown key', () => {
     expect(validateApiKey('gsp_badkey', new Map())).toBeNull();
   });
   ```
2. Create `saas/src/auth.ts`:
   ```typescript
   import { randomBytes } from 'node:crypto';

   export interface ApiKeyRecord { tier: 'free' | 'pro' | 'enterprise'; createdAt: string; owner: string }

   export function generateApiKey(tier: ApiKeyRecord['tier']): { apiKey: string; record: ApiKeyRecord } {
     const apiKey = `gsp_${randomBytes(16).toString('hex')}`;
     return { apiKey, record: { tier, createdAt: new Date().toISOString(), owner: '' } };
   }

   export function validateApiKey(key: string, store: Map<string, ApiKeyRecord>): ApiKeyRecord | null {
     return store.get(key) ?? null;
   }

   export function getRateLimit(tier: ApiKeyRecord['tier'] | null): number {
     return { free: 30, pro: 300, enterprise: 3000 }[tier ?? 'free'] ?? 30;
   }
   ```
3. Wire into `saas/src/server.ts` — read API key from `Authorization: Bearer gsp_...` header and pass tier to rate limiter
4. Verify: `cd saas && npm test -- --testPathPattern=auth` → `PASS (3 tests)`
5. Commit: `git commit -m "feat: pro tier API key system — gsp_ prefixed keys, tier-based rate limits"`

---

## Task 15: Persistent analysis history in SaaS

**Files:** `saas/src/history.ts` (create), `saas/src/routes.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/history.test.ts
   import { HistoryStore } from '../src/history.js';

   test('records and retrieves health snapshots', async () => {
     const store = new HistoryStore();
     await store.record('owner/repo', { score: 87, grade: 'A', fileCount: 142, analyzedAt: '2026-04-19T10:00:00Z' });
     await store.record('owner/repo', { score: 82, grade: 'B', fileCount: 148, analyzedAt: '2026-04-20T10:00:00Z' });
     const history = await store.get('owner/repo', 30);
     expect(history).toHaveLength(2);
     expect(history[0].score).toBe(87);
   });

   test('returns empty array for unknown repo', async () => {
     const store = new HistoryStore();
     expect(await store.get('nobody/nothing', 30)).toEqual([]);
   });
   ```
2. Create `saas/src/history.ts`:
   ```typescript
   export interface HealthSnapshot { score: number; grade: string; fileCount: number; analyzedAt: string }

   export class HistoryStore {
     private store = new Map<string, HealthSnapshot[]>();

     async record(repo: string, snapshot: HealthSnapshot): Promise<void> {
       const existing = this.store.get(repo) ?? [];
       existing.unshift(snapshot);
       this.store.set(repo, existing.slice(0, 90)); // keep 90 days
     }

     async get(repo: string, days: number): Promise<HealthSnapshot[]> {
       const all = this.store.get(repo) ?? [];
       const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
       return all.filter(s => s.analyzedAt >= cutoff);
     }
   }
   ```
3. Add route in `saas/src/routes.ts`:
   ```typescript
   router.get('/api/history/:owner/:repo', async (req, res) => {
     const repo = `${req.params.owner}/${req.params.repo}`;
     const days = Math.min(parseInt(req.query.days as string ?? '30'), 90);
     const history = await historyStore.get(repo, days);
     res.json({ repo, history });
   });
   ```
4. Verify: `cd saas && npm test -- --testPathPattern=history` → `PASS (2 tests)`
5. Commit: `git commit -m "feat: persistent analysis history store with 90-day rolling window"`

---

## Task 16: Team Dashboard — history sparkline from SaaS API

**Files:** `team-dashboard.html` (modify)

**Steps:**
1. Find the repo row rendering code in `team-dashboard.html` — search for `sparkline` or the commit velocity chart
2. Add history fetch alongside existing CI/commits fetch:
   ```javascript
   // In the repo data fetch loop, alongside existing grasp_commits call:
   async function fetchHistory(repo) {
     try {
       const r = await fetch(`https://grasp-saas.ashforde.org/api/history/${repo}?days=30`);
       if (!r.ok) return [];
       const { history } = await r.json();
       return history; // [{ score, grade, analyzedAt }]
     } catch { return []; }
   }
   ```
3. Add a "Score Trend" column rendering a mini sparkline SVG from history data:
   ```javascript
   function renderScoreTrend(history) {
     if (!history || history.length < 2) return '<span style="color:#475569">—</span>';
     const scores = history.slice(0, 14).reverse().map(h => h.score);
     const max = 100, min = 0, w = 60, h = 20;
     const pts = scores.map((s, i) => {
       const x = (i / (scores.length - 1)) * w;
       const y = h - ((s - min) / (max - min)) * h;
       return `${x},${y}`;
     }).join(' ');
     const last = scores[scores.length - 1];
     const prev = scores[scores.length - 2];
     const color = last >= prev ? '#22c55e' : '#ef4444';
     return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
       <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>
     </svg>`;
   }
   ```
4. Verify: Open `team-dashboard.html` in browser, add a repo, confirm Score Trend column appears
5. Commit: `git commit -m "feat: Team Dashboard — Score Trend sparkline from SaaS history API"`

---

## Task 17: Team Dashboard — leaderboard panel

**Files:** `team-dashboard.html` (modify)

**Steps:**
1. Add leaderboard section below the main table (find the `</table>` closing tag or the footer area):
   ```javascript
   function renderLeaderboard(repos) {
     const sorted = [...repos].filter(r => r.score != null).sort((a, b) => b.score - a.score);
     if (sorted.length < 2) return '';
     const medals = ['🥇', '🥈', '🥉'];
     const rows = sorted.slice(0, 10).map((r, i) =>
       `<div class="lb-row">
         <span class="lb-medal">${medals[i] ?? (i+1)+'.'}</span>
         <span class="lb-repo">${r.repo}</span>
         <span class="lb-score" style="color:${r.grade==='A'?'#22c55e':r.grade==='B'?'#84cc16':'#f59e0b'}">${r.score} ${r.grade}</span>
       </div>`
     ).join('');
     return `<div class="leaderboard"><h3>🏆 Cleanest Repos</h3>${rows}</div>`;
   }
   ```
2. Add CSS for `.leaderboard`, `.lb-row`, `.lb-medal`, `.lb-repo`, `.lb-score` in the `<style>` section
3. Call `renderLeaderboard(repos)` and inject into a `<div id="leaderboard-panel">` below the table
4. Verify: Open dashboard, add 3+ repos, confirm leaderboard appears ranked by score
5. Commit: `git commit -m "feat: Team Dashboard — leaderboard panel ranked by health score"`

---

## Task 18: GitLab API source support in MCP analyzer

**Files:** `mcp/src/sources/gitlab.ts` (create), `mcp/src/analyzer.ts` (modify), `mcp/tests/sources/gitlab.test.ts` (create)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/sources/gitlab.test.ts
   import { normalizeGitLabUrl, isGitLabSource } from '../../src/sources/gitlab.js';

   test('normalizeGitLabUrl parses gitlab.com URL', () => {
     const result = normalizeGitLabUrl('https://gitlab.com/inkscape/inkscape');
     expect(result).toEqual({ host: 'gitlab.com', namespace: 'inkscape', project: 'inkscape' });
   });

   test('isGitLabSource detects gitlab.com URLs', () => {
     expect(isGitLabSource('https://gitlab.com/foo/bar')).toBe(true);
     expect(isGitLabSource('https://github.com/foo/bar')).toBe(false);
   });
   ```
2. Create `mcp/src/sources/gitlab.ts`:
   ```typescript
   export interface GitLabSource { host: string; namespace: string; project: string; token?: string }

   export function isGitLabSource(input: string): boolean {
     return /gitlab\./i.test(input);
   }

   export function normalizeGitLabUrl(input: string): GitLabSource | null {
     const m = input.match(/(?:https?:\/\/)?([^/]+gitlab[^/]*)\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
     if (!m) return null;
     return { host: m[1], namespace: m[2], project: m[3] };
   }

   export async function fetchGitLabTree(src: GitLabSource): Promise<Array<{ path: string; content: string }>> {
     const base = `https://${src.host}/api/v4`;
     const encodedPath = encodeURIComponent(`${src.namespace}/${src.project}`);
     const headers: Record<string, string> = src.token ? { 'PRIVATE-TOKEN': src.token } : {};
     // Fetch file tree
     const treeRes = await fetch(`${base}/projects/${encodedPath}/repository/tree?recursive=true&per_page=100`, { headers });
     if (!treeRes.ok) throw new Error(`GitLab API error: ${treeRes.status}`);
     const tree = await treeRes.json() as Array<{ id: string; name: string; path: string; type: string }>;
     const files = tree.filter(f => f.type === 'blob' && /\.(ts|js|py|go|rs|java|rb|php|cs|lua)$/.test(f.name));
     // Fetch file contents (batch up to 50 files)
     const results: Array<{ path: string; content: string }> = [];
     for (const file of files.slice(0, 200)) {
       try {
         const r = await fetch(`${base}/projects/${encodedPath}/repository/files/${encodeURIComponent(file.path)}/raw?ref=HEAD`, { headers });
         if (r.ok) results.push({ path: file.path, content: await r.text() });
       } catch { /* skip */ }
     }
     return results;
   }
   ```
3. Wire into `mcp/src/analyzer.ts` — in `analyzeSource()`, detect GitLab input and route to `fetchGitLabTree`
4. Verify test: `npm test -- --testPathPattern=gitlab` → `PASS (2 tests)`
5. Commit: `git commit -m "feat: GitLab source support — fetch and analyse gitlab.com repositories"`

---

## Task 19: Cursor IDE integration guide + .cursor/mcp.json template

**Files:** `docs/cursor-integration.md` (create), `docs/examples/cursor-mcp.json` (create)

**Steps:**
1. Create `docs/examples/cursor-mcp.json`:
   ```json
   {
     "mcpServers": {
       "grasp": {
         "command": "npx",
         "args": ["grasp-mcp-server"],
         "description": "Codebase architecture analysis — dependency graph, hotspots, security, 47 tools"
       }
     }
   }
   ```
2. Create `docs/cursor-integration.md`:
   ```markdown
   # Using Grasp with Cursor IDE

   Grasp's MCP server integrates directly with Cursor's AI via the Model Context Protocol.

   ## Setup (30 seconds)

   1. Open Cursor Settings → Features → MCP
   2. Click "Add Server" and paste:
      ```json
      { "command": "npx", "args": ["grasp-mcp-server"] }
      ```
   3. Or copy `docs/examples/cursor-mcp.json` to `.cursor/mcp.json` in your repo

   ## Example prompts in Cursor

   - "Analyze this codebase and tell me the riskiest files to touch"
   - "What would break if I refactor src/auth.ts?"
   - "Are there any circular dependencies? How do I fix them?"
   - "Which files have no test coverage?"
   - "Generate a change risk score for the files I've modified"

   ## How it works

   Cursor calls `grasp_analyze` first (returns a session_id), then uses any of the 47 tools
   with that session_id to answer questions about your codebase. All analysis runs locally —
   your code never leaves your machine.
   ```
3. Commit: `git commit -m "docs: Cursor IDE integration guide and mcp.json template"`

---

## Task 20: Slack interactive messages — Block Kit with visual graph summary

**Files:** `slack-bot/src/formatter.ts` (modify), `slack-bot/tests/formatter.test.ts` (modify)

**Steps:**
1. Add failing test:
   ```typescript
   // In slack-bot/tests/formatter.test.ts:
   import { buildSlackInteractiveDigest } from '../src/formatter.js';

   test('buildSlackInteractiveDigest includes action buttons', () => {
     const payload = buildSlackInteractiveDigest([
       { repo: 'acme/backend', healthScore: 87, healthGrade: 'A', fileCount: 142, issueCount: 2, circularCount: 0, securityCount: 0, analyzedAt: new Date().toISOString() }
     ]);
     const json = JSON.stringify(payload);
     expect(json).toContain('button');
     expect(json).toContain('View Report');
     expect(json).toContain('acme/backend');
   });
   ```
2. Add to `slack-bot/src/formatter.ts`:
   ```typescript
   export function buildSlackInteractiveDigest(snapshots: HealthSnapshot[]): Record<string, unknown> {
     const topRepos = [...snapshots].sort((a, b) => b.healthScore - a.healthScore).slice(0, 5);
     const worstRepos = [...snapshots].sort((a, b) => a.healthScore - b.healthScore).slice(0, 3);
     const avgScore = Math.round(snapshots.reduce((s, r) => s + r.healthScore, 0) / snapshots.length);

     const repoBlocks = topRepos.map(r => {
       const bar = '█'.repeat(Math.round(r.healthScore / 10)) + '░'.repeat(10 - Math.round(r.healthScore / 10));
       return {
         type: 'section',
         text: { type: 'mrkdwn', text: `*${r.repo}*\n\`${bar}\` ${r.healthScore} ${r.healthGrade}\n${r.issueCount} issues · ${r.circularCount} circular deps` },
         accessory: {
           type: 'button', text: { type: 'plain_text', text: 'View Report' },
           url: `https://grasp.ashforde.org?repo=${r.repo}`, action_id: `view_${r.repo}`,
         },
       };
     });

     const needsAttention = worstRepos.filter(r => r.healthScore < 70).map(r =>
       `• *${r.repo}*: ${r.healthScore} ${r.healthGrade} — needs attention`
     ).join('\n');

     return {
       blocks: [
         { type: 'header', text: { type: 'plain_text', text: '📊 Grasp Weekly Digest' } },
         { type: 'section', text: { type: 'mrkdwn', text: `*${snapshots.length} repos tracked · Avg score: ${avgScore}*` } },
         { type: 'divider' },
         ...repoBlocks,
         ...(needsAttention ? [{ type: 'divider' },
           { type: 'section', text: { type: 'mrkdwn', text: `*⚠️ Needs Attention*\n${needsAttention}` } }] : []),
         { type: 'context', elements: [{ type: 'mrkdwn', text: 'Built by <https://grasp.ashforde.org|Grasp> · Built for engineers who actually ship.' }] },
       ],
     };
   }
   ```
3. Verify: `cd slack-bot && npm test -- --testPathPattern=formatter` → `PASS`
4. Commit: `git commit -m "feat: Slack interactive digest with Block Kit buttons and per-repo action links"`

---

## PHASE 3 — Enterprise (Months 4–6)
> Requires: Phase 2 complete. Needs infrastructure decisions (hosted SaaS vs self-hosted).

---

## Task 21: Self-hosted Docker Compose package

**Files:** `deploy/docker-compose.yml` (create), `deploy/.env.example` (create), `deploy/README.md` (create)

**Steps:**
1. Create `deploy/docker-compose.yml`:
   ```yaml
   version: '3.9'
   services:
     grasp-saas:
       image: node:20-alpine
       working_dir: /app
       volumes: ['../saas:/app']
       command: sh -c "npm install && npm run build && npm start"
       environment:
         - PORT=3001
         - REDIS_URL=redis://redis:6379
         - RATE_LIMIT=${RATE_LIMIT:-30}
         - LICENSE_KEY=${LICENSE_KEY}
       ports: ['3001:3001']
       depends_on: [redis]
       restart: unless-stopped

     grasp-github-app:
       image: node:20-alpine
       working_dir: /app
       volumes: ['../github-app:/app']
       command: sh -c "npm install && npm run build && node dist/index.js"
       environment:
         - PORT=3000
         - GITHUB_APP_ID=${GITHUB_APP_ID}
         - GITHUB_PRIVATE_KEY_BASE64=${GITHUB_PRIVATE_KEY_BASE64}
         - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
       ports: ['3000:3000']
       restart: unless-stopped

     redis:
       image: redis:7-alpine
       volumes: ['redis-data:/data']
       restart: unless-stopped

   volumes:
     redis-data:
   ```
2. Create `deploy/.env.example`:
   ```bash
   # Required
   LICENSE_KEY=gsp-ent-XXXX-XXXX-XXXX-XXXX
   GITHUB_APP_ID=
   GITHUB_PRIVATE_KEY_BASE64=
   GITHUB_WEBHOOK_SECRET=

   # Optional
   RATE_LIMIT=100
   REDIS_URL=redis://redis:6379
   ```
3. Create `deploy/README.md` with step-by-step deploy instructions:
   ```markdown
   # Grasp Self-Hosted Deployment

   ## Prerequisites
   - Docker + Docker Compose
   - A valid Grasp Enterprise license key

   ## Steps
   1. `cp .env.example .env && nano .env`  — fill in your credentials
   2. `docker compose up -d`
   3. Visit `http://localhost:3001/api/health` — should return `{"status":"ok"}`
   4. Open `index.html` in your browser — it will use your local SaaS instance

   ## Updating
   `docker compose pull && docker compose up -d`
   ```
4. Test: `cd deploy && docker compose config` → validates YAML
5. Commit: `git commit -m "feat: self-hosted Docker Compose deployment package for Grasp Enterprise"`

---

## Task 22: License key validation in SaaS

**Files:** `saas/src/license.ts` (create), `saas/src/server.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/license.test.ts
   import { validateLicenseKey, generateLicenseKey } from '../src/license.js';

   test('validateLicenseKey accepts valid enterprise key', () => {
     const key = generateLicenseKey('enterprise', 'acme-corp');
     expect(validateLicenseKey(key).valid).toBe(true);
     expect(validateLicenseKey(key).tier).toBe('enterprise');
   });

   test('validateLicenseKey rejects malformed key', () => {
     expect(validateLicenseKey('bad-key').valid).toBe(false);
   });

   test('generateLicenseKey has correct prefix', () => {
     const key = generateLicenseKey('team', 'acme');
     expect(key).toMatch(/^gsp-team-/);
   });
   ```
2. Create `saas/src/license.ts`:
   ```typescript
   import { createHmac, randomBytes } from 'node:crypto';

   const SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET ?? 'grasp-dev-secret';
   const TIERS = ['free', 'team', 'enterprise'] as const;
   type Tier = typeof TIERS[number];

   export function generateLicenseKey(tier: Tier, owner: string): string {
     const payload = `${tier}:${owner}:${Date.now()}`;
     const payloadB64 = Buffer.from(payload).toString('base64url');
     const sig = createHmac('sha256', SIGNING_SECRET).update(payloadB64).digest('hex').slice(0, 16);
     return `gsp-${tier}-${payloadB64}-${sig}`;
   }

   export function validateLicenseKey(key: string): { valid: boolean; tier?: Tier; owner?: string } {
     const m = key.match(/^gsp-(free|team|enterprise)-([A-Za-z0-9_-]+)-([a-f0-9]{16})$/);
     if (!m) return { valid: false };
     const [, tier, payloadB64, sig] = m;
     const expected = createHmac('sha256', SIGNING_SECRET).update(payloadB64).digest('hex').slice(0, 16);
     if (sig !== expected) return { valid: false };
     const payload = Buffer.from(payloadB64, 'base64url').toString();
     const [, owner] = payload.split(':');
     return { valid: true, tier: tier as Tier, owner };
   }
   ```
3. In `saas/src/server.ts` — validate `LICENSE_KEY` env var on startup, log tier
4. Verify: `npm test -- --testPathPattern=license` → `PASS (3 tests)`
5. Commit: `git commit -m "feat: HMAC-signed license key system for Grasp self-hosted enterprise"`

---

## Task 23: Audit logging middleware in SaaS

**Files:** `saas/src/audit.ts` (create), `saas/src/server.ts` (modify), `saas/src/routes.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/audit.test.ts
   import { AuditLogger } from '../src/audit.js';

   test('records analysis events with timestamp and repo', async () => {
     const logger = new AuditLogger();
     await logger.record({ action: 'analyze', repo: 'acme/backend', apiKey: 'gsp_abc', ip: '1.2.3.4' });
     const entries = await logger.query({ repo: 'acme/backend', limit: 10 });
     expect(entries).toHaveLength(1);
     expect(entries[0].action).toBe('analyze');
     expect(entries[0].timestamp).toBeDefined();
   });

   test('query filters by date range', async () => {
     const logger = new AuditLogger();
     await logger.record({ action: 'analyze', repo: 'r', apiKey: '', ip: '' });
     const entries = await logger.query({ since: new Date(Date.now() + 60000).toISOString(), limit: 10 });
     expect(entries).toHaveLength(0);
   });
   ```
2. Create `saas/src/audit.ts`:
   ```typescript
   export interface AuditEvent { action: string; repo: string; apiKey: string; ip: string; timestamp?: string }

   export class AuditLogger {
     private log: AuditEvent[] = [];

     async record(event: AuditEvent): Promise<void> {
       this.log.unshift({ ...event, timestamp: new Date().toISOString() });
       if (this.log.length > 10000) this.log.pop(); // rolling buffer
     }

     async query({ repo, since, limit }: { repo?: string; since?: string; limit: number }): Promise<AuditEvent[]> {
       return this.log
         .filter(e => (!repo || e.repo === repo) && (!since || (e.timestamp ?? '') >= since))
         .slice(0, limit);
     }
   }
   ```
3. Add route: `GET /api/audit?repo=&since=&limit=` (protected by API key, enterprise tier only)
4. Verify: `npm test -- --testPathPattern=audit` → `PASS (2 tests)`
5. Commit: `git commit -m "feat: audit logging — rolling event store with repo/date filtering, enterprise-only endpoint"`

---

## Task 24: `grasp_jira_issues` MCP tool

**Files:** `mcp/src/jira.ts` (create), `mcp/src/index.ts` (modify), `mcp/tests/jira.test.ts` (create)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/jira.test.ts
   import { parseJiraIssues } from '../src/jira.js';

   test('parseJiraIssues maps issues to files from summary + description', () => {
     const issues = [
       { key: 'ENG-123', summary: 'Fix auth.ts login bug', description: 'auth service broken', status: 'Open' },
     ];
     const files = ['src/auth.ts', 'src/utils.ts'];
     const mapped = parseJiraIssues(issues, files);
     expect(mapped['src/auth.ts']).toContainEqual(expect.objectContaining({ key: 'ENG-123' }));
     expect(mapped['src/utils.ts']).toBeUndefined();
   });
   ```
2. Create `mcp/src/jira.ts`:
   ```typescript
   export interface JiraIssue { key: string; summary: string; description: string; status: string }
   export type IssueFileMap = Record<string, JiraIssue[]>;

   export function parseJiraIssues(issues: JiraIssue[], files: string[]): IssueFileMap {
     const map: IssueFileMap = {};
     for (const issue of issues) {
       const text = `${issue.summary} ${issue.description}`.toLowerCase();
       for (const file of files) {
         const base = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
         if (base && text.includes(base.toLowerCase())) {
           (map[file] ??= []).push(issue);
         }
       }
     }
     return map;
   }

   export async function fetchJiraIssues(baseUrl: string, email: string, token: string, projectKey: string): Promise<JiraIssue[]> {
     const auth = Buffer.from(`${email}:${token}`).toString('base64');
     const res = await fetch(
       `${baseUrl}/rest/api/3/search?jql=project=${projectKey}+ORDER+BY+updated+DESC&maxResults=100&fields=summary,description,status`,
       { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
     );
     if (!res.ok) throw new Error(`Jira API error: ${res.status}`);
     const data = await res.json() as { issues: Array<{ key: string; fields: any }> };
     return data.issues.map(i => ({
       key: i.key,
       summary: i.fields.summary ?? '',
       description: i.fields.description?.content?.[0]?.content?.[0]?.text ?? '',
       status: i.fields.status?.name ?? 'Unknown',
     }));
   }
   ```
3. Register MCP tool in `mcp/src/index.ts`:
   ```typescript
   server.registerTool('grasp_jira_issues', {
     description: 'Map Jira issues to source files — finds which files are referenced in issue titles and descriptions',
     inputSchema: {
       session_id: { type: 'string' },
       jira_base_url: { type: 'string', description: 'e.g. https://acme.atlassian.net' },
       jira_email: { type: 'string' },
       jira_token: { type: 'string' },
       project_key: { type: 'string', description: 'Jira project key e.g. ENG' },
     },
   }, async (args: any) => {
     const session = sessionStore.get(args.session_id);
     if (!session) return { content: [{ type: 'text', text: 'Session not found.' }] };
     const { fetchJiraIssues, parseJiraIssues } = await import('./jira.js');
     const issues = await fetchJiraIssues(args.jira_base_url, args.jira_email, args.jira_token, args.project_key);
     const files = session.result.files.map((f: any) => f.path);
     const mapped = parseJiraIssues(issues, files);
     const lines = Object.entries(mapped).map(([f, iss]) => `${f}: ${iss.map(i => i.key).join(', ')}`);
     return { content: [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : 'No Jira issues matched any files.' }] };
   });
   ```
4. Verify: `npm test -- --testPathPattern=jira` → `PASS`
5. Commit: `git commit -m "feat: grasp_jira_issues MCP tool — maps Jira issues to source files"`

---

## Task 25: OTEL trace format support in `grasp_runtime_calls`

**Files:** `mcp/src/index.ts` (modify — update grasp_runtime_calls handler)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/otel-trace.test.ts
   import { parseOtelTrace, parseGraspTrace } from '../src/trace-parser.js';

   test('parseOtelTrace converts OTEL spans to call edges', () => {
     const otel = {
       resourceSpans: [{
         scopeSpans: [{
           spans: [{ name: 'auth.login', attributes: [{ key: 'code.filepath', value: { stringValue: 'src/auth.ts' } }] }]
         }]
       }]
     };
     const edges = parseOtelTrace(JSON.stringify(otel));
     expect(edges.length).toBeGreaterThan(0);
     expect(edges[0].file).toBe('src/auth.ts');
   });
   ```
2. Create `mcp/src/trace-parser.ts`:
   ```typescript
   export interface TraceEdge { file: string; calls: number }

   export function parseGraspTrace(json: string): TraceEdge[] {
     const data = JSON.parse(json);
     // Existing GraspTracer format
     if (Array.isArray(data)) return data.map((e: any) => ({ file: e.file, calls: e.count ?? 1 }));
     return [];
   }

   export function parseOtelTrace(json: string): TraceEdge[] {
     const data = JSON.parse(json);
     const edgeMap = new Map<string, number>();
     for (const rs of data.resourceSpans ?? []) {
       for (const ss of rs.scopeSpans ?? []) {
         for (const span of ss.spans ?? []) {
           const filepath = span.attributes?.find((a: any) => a.key === 'code.filepath')?.value?.stringValue;
           if (filepath) edgeMap.set(filepath, (edgeMap.get(filepath) ?? 0) + 1);
         }
       }
     }
     return Array.from(edgeMap.entries()).map(([file, calls]) => ({ file, calls }));
   }

   export function parseAnyTrace(json: string): TraceEdge[] {
     try {
       const data = JSON.parse(json);
       if (data.resourceSpans) return parseOtelTrace(json);
       return parseGraspTrace(json);
     } catch { return []; }
   }
   ```
3. Update `grasp_runtime_calls` handler in `mcp/src/index.ts` to call `parseAnyTrace` instead of inline parsing
4. Verify: `npm test -- --testPathPattern=otel` → `PASS`
5. Commit: `git commit -m "feat: OTEL trace format support in grasp_runtime_calls — auto-detects OTEL vs GraspTracer format"`

---

## Task 26: Gitea source support

**Files:** `mcp/src/sources/gitea.ts` (create), `mcp/src/analyzer.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/sources/gitea.test.ts
   import { isGiteaSource, normalizeGiteaUrl } from '../../src/sources/gitea.js';

   test('detects Gitea self-hosted URL', () => {
     expect(isGiteaSource('https://gitea.mycompany.com/team/repo')).toBe(true);
     expect(isGiteaSource('https://github.com/foo/bar')).toBe(false);
   });
   ```
2. Create `mcp/src/sources/gitea.ts`:
   ```typescript
   export interface GiteaSource { host: string; owner: string; repo: string; token?: string }

   export function isGiteaSource(input: string): boolean {
     // Gitea: any non-github, non-gitlab URL with /owner/repo pattern — detected by absence of github/gitlab
     return !/github\.|gitlab\./i.test(input) && /^https?:\/\/[^/]+\/[^/]+\/[^/]+/.test(input);
   }

   export function normalizeGiteaUrl(input: string): GiteaSource | null {
     const m = input.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
     if (!m) return null;
     return { host: m[1], owner: m[2], repo: m[3] };
   }

   export async function fetchGiteaTree(src: GiteaSource): Promise<Array<{ path: string; content: string }>> {
     const base = `https://${src.host}/api/v1`;
     const headers: Record<string, string> = src.token ? { Authorization: `token ${src.token}` } : {};
     const treeRes = await fetch(`${base}/repos/${src.owner}/${src.repo}/git/trees/HEAD?recursive=true`, { headers });
     if (!treeRes.ok) throw new Error(`Gitea API error: ${treeRes.status}`);
     const { tree } = await treeRes.json() as { tree: Array<{ path: string; type: string }> };
     const files = tree.filter(f => f.type === 'blob' && /\.(ts|js|py|go|rs|java|rb|php|cs)$/.test(f.path));
     const results: Array<{ path: string; content: string }> = [];
     for (const f of files.slice(0, 200)) {
       const r = await fetch(`${base}/repos/${src.owner}/${src.repo}/raw/${f.path}`, { headers });
       if (r.ok) results.push({ path: f.path, content: await r.text() });
     }
     return results;
   }
   ```
3. Wire `isGiteaSource` + `fetchGiteaTree` into `analyzeSource()` in `mcp/src/analyzer.ts`
4. Verify: `npm test -- --testPathPattern=gitea` → `PASS`
5. Commit: `git commit -m "feat: Gitea self-hosted source support in grasp_analyze"`

---

## PHASE 4 — Competitive Moat (Months 6–12)
> Requires: Phases 1–3 complete. Some require infrastructure (WebRTC relay, hosted SaaS with DB).

---

## Task 27: LLM provider abstraction — Mistral, Groq, Ollama support in browser app

**Files:** `index.html` (modify — AI chat provider section)

**Steps:**
1. Find the AI provider section in `index.html` — search for `anthropic` or `openai` in the chat handler
2. Extract provider config into a registry:
   ```javascript
   const AI_PROVIDERS = {
     claude: {
       name: 'Claude (Anthropic)',
       endpoint: 'https://api.anthropic.com/v1/messages',
       buildHeaders: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
       buildBody: (model, messages) => ({ model, max_tokens: 2048, messages }),
       extractText: (data) => data.content?.[0]?.text ?? '',
     },
     openai: {
       name: 'OpenAI (GPT)',
       endpoint: 'https://api.openai.com/v1/chat/completions',
       buildHeaders: (key) => ({ Authorization: `Bearer ${key}`, 'content-type': 'application/json' }),
       buildBody: (model, messages) => ({ model, messages }),
       extractText: (data) => data.choices?.[0]?.message?.content ?? '',
     },
     mistral: {
       name: 'Mistral AI',
       endpoint: 'https://api.mistral.ai/v1/chat/completions',
       buildHeaders: (key) => ({ Authorization: `Bearer ${key}`, 'content-type': 'application/json' }),
       buildBody: (model, messages) => ({ model: model || 'mistral-small-latest', messages }),
       extractText: (data) => data.choices?.[0]?.message?.content ?? '',
     },
     groq: {
       name: 'Groq',
       endpoint: 'https://api.groq.com/openai/v1/chat/completions',
       buildHeaders: (key) => ({ Authorization: `Bearer ${key}`, 'content-type': 'application/json' }),
       buildBody: (model, messages) => ({ model: model || 'llama-3.3-70b-versatile', messages }),
       extractText: (data) => data.choices?.[0]?.message?.content ?? '',
     },
     ollama: {
       name: 'Ollama (local)',
       endpoint: 'http://localhost:11434/api/chat',
       buildHeaders: () => ({ 'content-type': 'application/json' }),
       buildBody: (model, messages) => ({ model: model || 'llama3', messages, stream: false }),
       extractText: (data) => data.message?.content ?? '',
     },
   };
   ```
3. Update the provider dropdown in the Settings/AI panel to include Mistral, Groq, Ollama
4. Update the chat fetch function to use `AI_PROVIDERS[selectedProvider]` instead of hardcoded Claude/OpenAI logic
5. Test: Open index.html → Settings → AI → select Groq → enter API key → send message → confirm response
6. Commit: `git commit -m "feat: LLM provider abstraction — Mistral, Groq, Ollama support in AI chat panel"`

---

## Task 28: Cross-repo search API in SaaS

**Files:** `saas/src/search.ts` (create), `saas/src/routes.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/search.test.ts
   import { SearchIndex } from '../src/search.js';

   test('indexes and searches across multiple repos', () => {
     const idx = new SearchIndex();
     idx.index('acme/backend', [{ path: 'src/auth.ts', functions: ['login', 'logout'] }]);
     idx.index('acme/frontend', [{ path: 'src/api.ts', functions: ['fetchUser', 'authGuard'] }]);
     const results = idx.search('auth');
     expect(results.length).toBeGreaterThan(0);
     expect(results.some(r => r.repo === 'acme/backend')).toBe(true);
   });
   ```
2. Create `saas/src/search.ts`:
   ```typescript
   export interface IndexedFile { path: string; functions: string[] }
   export interface SearchResult { repo: string; file: string; matches: string[] }

   export class SearchIndex {
     private index = new Map<string, Array<{ path: string; functions: string[]; repo: string }>>();

     index(repo: string, files: IndexedFile[]): void {
       for (const f of files) {
         const terms = [f.path, ...f.functions].map(t => t.toLowerCase());
         for (const term of terms) {
           const existing = this.index.get(term) ?? [];
           existing.push({ path: f.path, functions: f.functions, repo });
           this.index.set(term, existing);
         }
       }
     }

     search(query: string): SearchResult[] {
       const q = query.toLowerCase();
       const results: SearchResult[] = [];
       for (const [term, entries] of this.index.entries()) {
         if (term.includes(q)) {
           for (const e of entries) {
             results.push({ repo: e.repo, file: e.path, matches: e.functions.filter(f => f.toLowerCase().includes(q)) });
           }
         }
       }
       return results.slice(0, 50);
     }
   }
   ```
3. Add route: `GET /api/search?q=authGuard` returns `{ results: SearchResult[] }`
4. Add MCP tool `grasp_cross_search` in `mcp/src/index.ts` that calls the SaaS endpoint
5. Verify: `npm test -- --testPathPattern=search` → `PASS`
6. Commit: `git commit -m "feat: cross-repo search API + grasp_cross_search MCP tool"`

---

## Task 29: Real-time collaboration — shared analysis sessions via WebSocket

**Files:** `saas/src/collab.ts` (create), `saas/src/server.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // saas/tests/collab.test.ts
   import { CollabRoom } from '../src/collab.js';

   test('CollabRoom tracks connected clients', () => {
     const room = new CollabRoom('session-abc');
     const fakeSocket = { send: jest.fn(), readyState: 1 };
     room.join('user-1', fakeSocket as any);
     expect(room.clientCount).toBe(1);
     room.broadcast('user-1', { type: 'selection', file: 'src/auth.ts' });
     // user-1 should not receive their own message
     expect(fakeSocket.send).not.toHaveBeenCalled();
   });

   test('CollabRoom broadcasts to other clients', () => {
     const room = new CollabRoom('session-abc');
     const s1 = { send: jest.fn(), readyState: 1 };
     const s2 = { send: jest.fn(), readyState: 1 };
     room.join('user-1', s1 as any);
     room.join('user-2', s2 as any);
     room.broadcast('user-1', { type: 'selection', file: 'src/auth.ts' });
     expect(s2.send).toHaveBeenCalledWith(expect.stringContaining('auth.ts'));
     expect(s1.send).not.toHaveBeenCalled();
   });
   ```
2. Create `saas/src/collab.ts`:
   ```typescript
   import type WebSocket from 'ws';

   export class CollabRoom {
     private clients = new Map<string, WebSocket>();
     constructor(public readonly sessionId: string) {}

     get clientCount(): number { return this.clients.size; }

     join(userId: string, ws: WebSocket): void {
       this.clients.set(userId, ws);
       ws.on('close', () => this.clients.delete(userId));
     }

     broadcast(fromUserId: string, message: unknown): void {
       const payload = JSON.stringify(message);
       for (const [uid, ws] of this.clients) {
         if (uid !== fromUserId && ws.readyState === 1) ws.send(payload);
       }
     }
   }

   export class CollabServer {
     private rooms = new Map<string, CollabRoom>();

     getOrCreate(sessionId: string): CollabRoom {
       if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new CollabRoom(sessionId));
       return this.rooms.get(sessionId)!;
     }
   }
   ```
3. Wire WebSocket server into `saas/src/server.ts`: `ws://host/collab/:session_id` endpoint
4. Add collab client in `index.html`: when user opens shared session, connect to WebSocket and sync node selections
5. Verify: `npm test -- --testPathPattern=collab` → `PASS (2 tests)`
6. Commit: `git commit -m "feat: real-time collaboration — WebSocket collab rooms, shared node selection sync"`

---

## Task 30: Microservices / distributed mode — service graph from OTEL + static

**Files:** `mcp/src/distributed.ts` (create), `mcp/src/index.ts` (modify)

**Steps:**
1. Write failing test:
   ```typescript
   // mcp/tests/distributed.test.ts
   import { buildServiceGraph } from '../src/distributed.js';

   test('buildServiceGraph merges OTEL service names with file paths', () => {
     const traces = [
       { service: 'auth-service', calls: [{ to: 'user-service', count: 150 }] },
       { service: 'user-service', calls: [] },
     ];
     const graph = buildServiceGraph(traces);
     expect(graph.services).toHaveLength(2);
     expect(graph.edges[0]).toMatchObject({ from: 'auth-service', to: 'user-service', weight: 150 });
   });
   ```
2. Create `mcp/src/distributed.ts`:
   ```typescript
   export interface ServiceCall { to: string; count: number }
   export interface ServiceTrace { service: string; calls: ServiceCall[] }
   export interface ServiceEdge { from: string; to: string; weight: number }
   export interface ServiceGraph { services: string[]; edges: ServiceEdge[] }

   export function buildServiceGraph(traces: ServiceTrace[]): ServiceGraph {
     const services = [...new Set(traces.map(t => t.service))];
     const edges: ServiceEdge[] = [];
     for (const trace of traces) {
       for (const call of trace.calls) {
         edges.push({ from: trace.service, to: call.to, weight: call.count });
       }
     }
     return { services, edges };
   }
   ```
3. Register `grasp_service_graph` MCP tool that accepts OTEL JSON and returns a service-level dependency graph
4. Verify: `npm test -- --testPathPattern=distributed` → `PASS`
5. Commit: `git commit -m "feat: distributed/microservices mode — grasp_service_graph from OTEL traces"`

---

## Task 31: Emacs plugin (basic)

**Files:** `emacs-plugin/grasp.el` (create), `emacs-plugin/README.md` (create)

**Steps:**
1. Create `emacs-plugin/grasp.el`:
   ```elisp
   ;;; grasp.el --- Grasp code architecture analysis for Emacs -*- lexical-binding: t; -*-
   ;; Author: Ashforde OÜ
   ;; Version: 1.0.0
   ;; Package-Requires: ((emacs "27.1"))
   ;; URL: https://github.com/ashfordeOU/grasp

   ;;; Code:
   (defgroup grasp nil "Grasp code architecture analysis." :group 'tools)

   (defcustom grasp-cli-path "npx"
     "Path to grasp CLI or npx." :type 'string :group 'grasp)

   (defcustom grasp-args '("grasp-mcp-server" "grasp")
     "Arguments to pass before the grasp subcommand." :type '(repeat string) :group 'grasp)

   (defun grasp-analyze ()
     "Analyze the current project with Grasp."
     (interactive)
     (let* ((root (or (locate-dominating-file default-directory "package.json")
                      default-directory))
            (buf (get-buffer-create "*grasp*"))
            (cmd (append (list grasp-cli-path) grasp-args (list root))))
       (with-current-buffer buf (erase-buffer))
       (message "Grasp: analyzing %s..." root)
       (make-process :name "grasp" :buffer buf :command cmd
                     :sentinel (lambda (_proc event)
                                 (when (string-prefix-p "finished" event)
                                   (with-current-buffer buf (goto-char (point-min)))
                                   (display-buffer buf)
                                   (message "Grasp: analysis complete."))))))

   (defun grasp-open ()
     "Open the Grasp UI in the default browser."
     (interactive)
     (browse-url "https://grasp.ashforde.org"))

   ;;;###autoload
   (define-minor-mode grasp-mode
     "Minor mode for Grasp code analysis."
     :lighter " Grasp"
     :keymap (let ((map (make-sparse-keymap)))
               (define-key map (kbd "C-c g a") #'grasp-analyze)
               (define-key map (kbd "C-c g o") #'grasp-open)
               map))

   (provide 'grasp)
   ;;; grasp.el ends here
   ```
2. Create `emacs-plugin/README.md` with installation via `use-package`, MELPA submission guide
3. Commit: `git commit -m "feat: Emacs plugin — grasp.el with grasp-analyze, grasp-open, grasp-mode"`

---

## Task 32: Final launch — version bump, changelogs, npm publish, all registries

**Files:** `mcp/package.json`, `mcp/server.json`, `index.html`, `team-dashboard.html`, `CHANGELOG.md` (create)

**Steps:**
1. Create `CHANGELOG.md` with all phases documented
2. Bump `mcp/package.json` version to `3.0.0`
3. Bump `mcp/server.json` version to `3.0.0`
4. Update both HTML files: GRASP_VERSION → `'3.0.0'`
5. Build MCP: `cd mcp && npm run build && npm test` → 212+ tests pass
6. Publish to npm: `cd mcp && npm publish`
7. Publish to MCP registry: `mcp-publisher login github && mcp-publisher publish`
8. Tag and push: `git tag v3.0.0 && git push origin main --tags`
9. Publish JetBrains plugin: `cd jetbrains-plugin && ./gradlew publishPlugin`
10. Publish GitHub App to Marketplace: Follow marketplace.github.com submission flow
11. Commit: `git commit -m "release: v3.0.0 — full launch across all platforms"`

---

## Summary

| Phase | Tasks | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| Phase 1 — Foundation | 1–12 | 4 weeks | None |
| Phase 2 — Market Expansion | 13–20 | 6 weeks | Phase 1 |
| Phase 3 — Enterprise | 21–26 | 8 weeks | Phase 2 + cloud infra decision |
| Phase 4 — Moat | 27–32 | 12 weeks | Phase 3 + SaaS hosting live |

**Total: 32 tasks, ~30 weeks to full v3.0.0 launch**

All Phase 1 tasks are self-contained and can be executed immediately. Phase 2 tasks require some external accounts (GitHub Marketplace application). Phases 3–4 require live SaaS infrastructure.
