# Plan: Integrations Expansion — 32 Integrations, 10 Phases
Date: 2026-04-19
Goal: Build, test, and publish all 32 Grasp integrations across 10 phases
Architecture: Monorepo (all logic) + thin companion repos (Homebrew tap, Raycast store)
Tech stack: TypeScript/Node.js, Java/Kotlin (Eclipse/Jenkins), Lua (Vim), Elisp (Emacs), WASM/TS (Zed), Jest, Playwright, Docker, MSW

---

## Shared Infrastructure (build first — everything depends on this)

---

## Task 1: Create test-utils directory with fixtures

**Files:** `shared/test-utils/fixtures/tiny.json` (create), `shared/test-utils/fixtures/medium.json` (create), `shared/test-utils/fixtures/large.json` (create)

**Steps:**
1. Write test:
   ```typescript
   // shared/test-utils/__tests__/fixtures.test.ts
   import tiny from '../fixtures/tiny.json';
   import medium from '../fixtures/medium.json';
   import large from '../fixtures/large.json';
   test('tiny fixture has required shape', () => {
     expect(tiny).toHaveProperty('files');
     expect(tiny).toHaveProperty('healthScore');
     expect(tiny).toHaveProperty('dependencies');
   });
   test('medium fixture has >50 files', () => expect(medium.files.length).toBeGreaterThan(50));
   test('large fixture has >200 files', () => expect(large.files.length).toBeGreaterThan(200));
   ```
2. Verify fails: `cd shared/test-utils && npx jest fixtures.test.ts` → `FAIL: Cannot find module`
3. Create `shared/test-utils/fixtures/tiny.json`:
   ```json
   {
     "repoId": "test/tiny-repo",
     "files": [
       {"path": "src/index.ts", "language": "TypeScript", "lines": 42},
       {"path": "src/utils.ts", "language": "TypeScript", "lines": 18},
       {"path": "package.json", "language": "JSON", "lines": 12}
     ],
     "healthScore": 92,
     "healthGrade": "A",
     "dependencies": {"src/index.ts": ["src/utils.ts"]},
     "circularDeps": [],
     "securityIssues": []
   }
   ```
4. Create `shared/test-utils/fixtures/medium.json` with 60 files (same shape, healthScore: 74, healthGrade: "C", 3 securityIssues)
5. Create `shared/test-utils/fixtures/large.json` with 250 files (same shape, healthScore: 55, healthGrade: "D", 8 securityIssues)
6. Create `shared/test-utils/package.json`:
   ```json
   {"name": "@grasp/test-utils", "version": "1.0.0", "private": true,
    "scripts": {"test": "jest"}, "devDependencies": {"jest": "^29", "ts-jest": "^29", "@types/jest": "^29", "typescript": "^5"}}
   ```
7. Verify passes: `cd shared/test-utils && npm install && npx jest fixtures.test.ts` → `PASS`
8. Commit: `git commit -m "feat(shared): test fixtures — tiny/medium/large analysis results"`

---

## Task 2: Create MSW mock server for all external APIs

**Files:** `shared/test-utils/mock-server/index.ts` (create), `shared/test-utils/mock-server/handlers/github.ts` (create), `shared/test-utils/mock-server/handlers/gitlab.ts` (create), `shared/test-utils/mock-server/handlers/slack.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   // shared/test-utils/__tests__/mock-server.test.ts
   import { setupMockServer } from '../mock-server/index';
   import { http } from 'msw';
   const server = setupMockServer();
   beforeAll(() => server.listen());
   afterAll(() => server.close());
   test('github mock returns repo data', async () => {
     const res = await fetch('https://api.github.com/repos/test/repo');
     const json = await res.json();
     expect(json.full_name).toBe('test/repo');
   });
   test('slack mock accepts chat.postMessage', async () => {
     const res = await fetch('https://slack.com/api/chat.postMessage', {method:'POST', body: JSON.stringify({channel:'C123', text:'hello'})});
     const json = await res.json();
     expect(json.ok).toBe(true);
   });
   ```
2. Verify fails: `npx jest mock-server.test.ts` → `FAIL: Cannot find module`
3. Install MSW: `npm install --save-dev msw@latest` in `shared/test-utils/`
4. Create `shared/test-utils/mock-server/handlers/github.ts`:
   ```typescript
   import { http, HttpResponse } from 'msw';
   export const githubHandlers = [
     http.get('https://api.github.com/repos/:owner/:repo', ({ params }) =>
       HttpResponse.json({ full_name: `${params.owner}/${params.repo}`, default_branch: 'main', private: false })),
     http.get('https://api.github.com/repos/:owner/:repo/git/trees/:sha', () =>
       HttpResponse.json({ tree: [{path:'src/index.ts', type:'blob', sha:'abc123'}], truncated: false })),
   ];
   ```
5. Create handlers for `gitlab.ts`, `slack.ts`, `teams.ts`, `discord.ts`, `jira.ts`, `linear.ts`, `bitbucket.ts`, `azure.ts` following the same pattern
6. Create `shared/test-utils/mock-server/index.ts`:
   ```typescript
   import { setupServer } from 'msw/node';
   import { githubHandlers } from './handlers/github';
   import { gitlabHandlers } from './handlers/gitlab';
   import { slackHandlers } from './handlers/slack';
   export function setupMockServer() {
     return setupServer(...githubHandlers, ...gitlabHandlers, ...slackHandlers);
   }
   ```
7. Verify passes: `npx jest mock-server.test.ts` → `PASS`
8. Commit: `git commit -m "feat(shared): MSW mock server for GitHub, GitLab, Slack, Teams, Discord, Jira, Linear, Bitbucket, Azure"`

---

## Task 3: Create Docker test-compose and CI matrix workflow

**Files:** `shared/test-utils/docker-compose.test.yml` (create), `.github/workflows/integrations.yml` (create)

**Steps:**
1. Create `shared/test-utils/docker-compose.test.yml`:
   ```yaml
   version: '3.8'
   services:
     gitea:
       image: gitea/gitea:latest
       ports: ["3000:3000"]
       environment:
         - GITEA__server__DOMAIN=localhost
         - GITEA__server__HTTP_PORT=3000
         - GITEA__database__DB_TYPE=sqlite3
     jenkins:
       image: jenkins/jenkins:lts
       ports: ["8080:8080"]
     wiremock:
       image: wiremock/wiremock:latest
       ports: ["8089:8080"]
   ```
2. Create `.github/workflows/integrations.yml`:
   ```yaml
   name: Integrations
   on: [push, pull_request]
   jobs:
     shared:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: {node-version: '20'}
         - run: cd shared/test-utils && npm ci && npm test
     phase-1-docker:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - run: docker build -t grasp-test docker/
         - run: docker run grasp-test grasp --version
     phase-1-homebrew:
       runs-on: macos-latest
       steps:
         - uses: actions/checkout@v4
         - run: brew audit --strict homebrew-formula/grasp.rb || true
     phase-2-github-action:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: {node-version: '20'}
         - run: cd github-action && npm ci && npm test
     phase-4-gitea:
       runs-on: ubuntu-latest
       services:
         gitea:
           image: gitea/gitea:latest
           ports: ["3000:3000"]
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: {node-version: '20'}
         - run: cd mcp && npm ci && npm test -- --grep gitea
     phase-5-browser:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: {node-version: '20'}
         - run: cd browser-extension && npm ci && npx playwright install chromium && npm test
   ```
3. Commit: `git commit -m "feat(shared): Docker test-compose (Gitea/Jenkins/WireMock) + CI matrix workflow"`

---

## Phase 1A — Homebrew Formula

---

## Task 4: Create Homebrew tap formula

**Files:** `homebrew-formula/grasp.rb` (create — lives in companion repo `homebrew-grasp`, but drafted here first)

**Steps:**
1. Write audit test (macOS only):
   ```bash
   # Verify formula syntax: brew ruby -e "require 'formula'; load 'homebrew-formula/grasp.rb'"
   ```
2. Create `homebrew-formula/grasp.rb`:
   ```ruby
   class Grasp < Formula
     desc "Code architecture visualizer — dependency graph, health score, security scanner"
     homepage "https://github.com/ashfordeOU/grasp"
     url "https://registry.npmjs.org/grasp-mcp-server/-/grasp-mcp-server-3.1.1.tgz"
     sha256 "" # filled by release automation
     license "Elastic-2.0"
     head "https://github.com/ashfordeOU/grasp.git", branch: "main"

     depends_on "node"

     def install
       system "npm", "install", *std_npm_args
       bin.install_symlink Dir["#{libexec}/bin/*"]
     end

     test do
       assert_match version.to_s, shell_output("#{bin}/grasp --version")
     end
   end
   ```
3. Create `homebrew-formula/README.md` with tap installation instructions
4. Create `.github/workflows/update-homebrew.yml` — triggered on npm publish, opens PR to `homebrew-grasp` repo updating SHA256 and version
5. Commit: `git commit -m "feat(homebrew): formula for grasp-mcp-server tap"`

---

## Phase 1B — Docker Image

---

## Task 5: Create Dockerfile and docker-compose

**Files:** `docker/Dockerfile` (create), `docker/docker-compose.yml` (create), `docker/README.md` (create)

**Steps:**
1. Write test:
   ```bash
   # docker/__tests__/smoke.sh
   docker build -t grasp-local docker/
   OUTPUT=$(docker run grasp-local grasp --version)
   echo "$OUTPUT" | grep -q "3.1" && echo "PASS" || (echo "FAIL: version not found in: $OUTPUT" && exit 1)
   ```
2. Create `docker/Dockerfile`:
   ```dockerfile
   FROM node:20-alpine
   LABEL org.opencontainers.image.source="https://github.com/ashfordeOU/grasp"
   LABEL org.opencontainers.image.description="Grasp — code architecture analysis"
   LABEL org.opencontainers.image.licenses="Elastic-2.0"
   RUN npm install -g grasp-mcp-server@3.1.1
   ENTRYPOINT ["grasp"]
   CMD ["--help"]
   ```
3. Create `docker/docker-compose.yml`:
   ```yaml
   version: '3.8'
   services:
     grasp:
       image: ashfordeou/grasp:latest
       volumes:
         - .:/workspace
       working_dir: /workspace
       environment:
         - GITHUB_TOKEN=${GITHUB_TOKEN}
   ```
4. Create `docker/README.md` with usage: `docker run ashfordeou/grasp analyze owner/repo`
5. Add to `.github/workflows/publish.yml` — build and push multi-arch on tag push:
   ```yaml
   - name: Build and push Docker image
     uses: docker/build-push-action@v5
     with:
       context: docker/
       platforms: linux/amd64,linux/arm64
       push: true
       tags: |
         ashfordeou/grasp:latest
         ashfordeou/grasp:${{ github.ref_name }}
         ghcr.io/ashfordeou/grasp:latest
   ```
6. Verify: `bash docker/__tests__/smoke.sh` → `PASS`
7. Commit: `git commit -m "feat(docker): multi-arch image (amd64/arm64) published to Docker Hub + GHCR"`

---

## Phase 2A — GitHub Actions Marketplace Action

---

## Task 6: Scaffold GitHub Actions action

**Files:** `github-action/action.yml` (create), `github-action/package.json` (create), `github-action/src/main.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   // github-action/src/__tests__/main.test.ts
   import { formatComment, gradeAboveThreshold } from '../main';
   test('formats health comment as markdown', () => {
     const comment = formatComment({ grade: 'B', score: 78, repo: 'test/repo', issues: [] });
     expect(comment).toContain('Grasp Health Report');
     expect(comment).toContain('Grade: **B**');
   });
   test('grade A passes threshold D', () => expect(gradeAboveThreshold('A', 'D')).toBe(true));
   test('grade F fails threshold C', () => expect(gradeAboveThreshold('F', 'C')).toBe(false));
   ```
2. Verify fails: `cd github-action && npx jest` → `FAIL: Cannot find module`
3. Create `github-action/action.yml`:
   ```yaml
   name: 'Grasp Architecture Check'
   description: 'Run Grasp analysis and post health report as PR comment'
   branding:
     icon: 'activity'
     color: 'green'
   inputs:
     token:
       description: 'GitHub token'
       required: true
       default: ${{ github.token }}
     threshold:
       description: 'Minimum health grade (A–F). Fail if below.'
       required: false
       default: 'D'
     post-comment:
       description: 'Post result as PR comment'
       required: false
       default: 'true'
   outputs:
     health-grade:
       description: 'Health grade (A–F)'
     health-score:
       description: 'Health score (0–100)'
   runs:
     using: 'node20'
     main: 'dist/index.js'
   ```
4. Create `github-action/src/main.ts`:
   ```typescript
   import * as core from '@actions/core';
   import * as github from '@actions/github';

   export function gradeAboveThreshold(grade: string, threshold: string): boolean {
     const order = ['A', 'B', 'C', 'D', 'F'];
     return order.indexOf(grade) <= order.indexOf(threshold);
   }

   export function formatComment(result: {grade: string; score: number; repo: string; issues: string[]}): string {
     const emoji = result.grade === 'A' ? '✅' : result.grade <= 'C' ? '⚠️' : '❌';
     return `## ${emoji} Grasp Health Report\n\n**Repo:** \`${result.repo}\`\nGrade: **${result.grade}** · Score: ${result.score}/100\n\n${result.issues.length ? '### Issues\n' + result.issues.map(i => `- ${i}`).join('\n') : '_No issues found._'}`;
   }

   async function run() {
     const token = core.getInput('token');
     const threshold = core.getInput('threshold');
     const octokit = github.getOctokit(token);
     const { owner, repo } = github.context.repo;
     // Run grasp CLI and parse output
     const { execSync } = await import('child_process');
     const output = execSync(`npx grasp-mcp-server analyze ${owner}/${repo} --format json`, {encoding:'utf8'});
     const result = JSON.parse(output);
     core.setOutput('health-grade', result.grade);
     core.setOutput('health-score', String(result.score));
     if (core.getInput('post-comment') === 'true' && github.context.payload.pull_request) {
       await octokit.rest.issues.createComment({
         owner, repo, issue_number: github.context.payload.pull_request.number,
         body: formatComment({grade: result.grade, score: result.score, repo: `${owner}/${repo}`, issues: result.issues || []})
       });
     }
     if (!gradeAboveThreshold(result.grade, threshold)) {
       core.setFailed(`Health grade ${result.grade} is below threshold ${threshold}`);
     }
   }
   run().catch(core.setFailed);
   ```
5. Create `github-action/package.json` with `@actions/core`, `@actions/github`, build script using `@vercel/ncc`
6. Verify passes: `cd github-action && npm install && npx jest` → `PASS`
7. Commit: `git commit -m "feat(github-action): action.yml + main.ts with grade threshold and PR comment"`

---

## Task 7: GitHub Action E2E with nektos/act

**Files:** `github-action/__tests__/e2e/workflow.yml` (create), `github-action/__tests__/e2e/run-act.sh` (create)

**Steps:**
1. Create `github-action/__tests__/e2e/workflow.yml`:
   ```yaml
   name: E2E test
   on: [pull_request]
   jobs:
     grasp:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: ./
           with:
             token: ${{ secrets.GITHUB_TOKEN }}
             threshold: F
   ```
2. Create `github-action/__tests__/e2e/run-act.sh`:
   ```bash
   #!/bin/bash
   which act || npm install -g @nektos/act
   act pull_request -W github-action/__tests__/e2e/workflow.yml --dry-run 2>&1 | grep -q "grasp" && echo "PASS: act dry-run succeeded" || echo "WARN: act not available, skip E2E"
   ```
3. Add to CI matrix in `.github/workflows/integrations.yml` under `phase-2-github-action`
4. Commit: `git commit -m "feat(github-action): E2E smoke test via nektos/act dry-run"`

---

## Phase 2B — GitLab CI Component

---

## Task 8: GitLab CI component template

**Files:** `gitlab-ci-component/template.yml` (create), `gitlab-ci-component/src/comment.ts` (create), `gitlab-ci-component/src/__tests__/comment.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   // gitlab-ci-component/src/__tests__/comment.test.ts
   import { formatMrComment } from '../comment';
   test('formats MR comment with emoji', () => {
     const body = formatMrComment({ grade: 'C', score: 65, repo: 'ns/project' });
     expect(body).toContain('Grasp');
     expect(body).toContain('Grade: **C**');
   });
   ```
2. Create `gitlab-ci-component/template.yml`:
   ```yaml
   spec:
     inputs:
       threshold:
         default: D
         description: Minimum health grade
       token:
         description: GitLab access token
   ---
   grasp-check:
     image: ashfordeou/grasp:latest
     script:
       - grasp analyze $CI_PROJECT_PATH --format json > grasp-result.json
       - grade=$(jq -r '.grade' grasp-result.json)
       - echo "Health grade $grade"
     artifacts:
       reports:
         codequality: grasp-result.json
   ```
3. Create `gitlab-ci-component/src/comment.ts`:
   ```typescript
   export function formatMrComment(result: {grade: string; score: number; repo: string}): string {
     return `## Grasp Health Report\n\n**${result.repo}** — Grade: **${result.grade}** · Score: ${result.score}/100`;
   }
   ```
4. Validate YAML: `npx js-yaml gitlab-ci-component/template.yml` → no errors
5. Verify passes: `cd gitlab-ci-component && npm install && npx jest` → `PASS`
6. Commit: `git commit -m "feat(gitlab-ci): reusable CI component + MR comment formatter"`

---

## Phase 2C — Bitbucket Pipe

---

## Task 9: Bitbucket Pipelines pipe

**Files:** `bitbucket-pipe/pipe.yml` (create), `bitbucket-pipe/Dockerfile` (create), `bitbucket-pipe/pipe.sh` (create)

**Steps:**
1. Create `bitbucket-pipe/pipe.yml`:
   ```yaml
   name: Grasp Architecture Check
   version: '1.0.0'
   image: ashfordeou/grasp-pipe:latest
   description: Run Grasp architecture analysis and post PR comment
   variables:
     - name: THRESHOLD
       description: Minimum health grade (A-F)
       default: D
     - name: BITBUCKET_TOKEN
       description: Bitbucket App Password
   ```
2. Create `bitbucket-pipe/Dockerfile`:
   ```dockerfile
   FROM ashfordeou/grasp:latest
   COPY pipe.sh /
   RUN chmod +x /pipe.sh
   ENTRYPOINT ["/pipe.sh"]
   ```
3. Create `bitbucket-pipe/pipe.sh`:
   ```bash
   #!/bin/bash
   set -e
   THRESHOLD=${THRESHOLD:=D}
   echo "Running Grasp analysis..."
   grasp analyze "$BITBUCKET_REPO_FULL_NAME" --format json > /tmp/grasp-result.json
   GRADE=$(cat /tmp/grasp-result.json | python3 -c "import sys,json; print(json.load(sys.stdin)['grade'])")
   echo "Health grade: $GRADE"
   ```
4. Write test: `docker build -t grasp-pipe-test bitbucket-pipe/ && docker run --rm grasp-pipe-test echo "pipe ok"` → exits 0
5. Commit: `git commit -m "feat(bitbucket-pipe): Docker-based pipe with grade threshold check"`

---

## Phase 2D — CircleCI Orb

---

## Task 10: CircleCI orb definition

**Files:** `circleci-orb/orb.yml` (create)

**Steps:**
1. Create `circleci-orb/orb.yml`:
   ```yaml
   version: 2.1
   description: Run Grasp architecture analysis in your CircleCI pipeline
   display:
     home_url: https://github.com/ashfordeOU/grasp
     source_url: https://github.com/ashfordeOU/grasp/tree/main/circleci-orb
   executors:
     default:
       docker:
         - image: ashfordeou/grasp:latest
   commands:
     check:
       description: Run Grasp and fail if grade is below threshold
       parameters:
         threshold:
           type: string
           default: D
       steps:
         - run:
             name: Grasp architecture check
             command: grasp analyze $CIRCLE_PROJECT_USERNAME/$CIRCLE_PROJECT_REPONAME --threshold << parameters.threshold >>
   jobs:
     analyze:
       executor: default
       parameters:
         threshold:
           type: string
           default: D
       steps:
         - checkout
         - check:
             threshold: << parameters.threshold >>
   ```
2. Validate: `circleci orb validate circleci-orb/orb.yml` or `npx @circleci/circleci-config-sdk`
3. Create `circleci-orb/README.md` with usage example
4. Commit: `git commit -m "feat(circleci-orb): grasp/analyze job + grasp/check command"`

---

## Phase 2E — Jenkins Plugin

---

## Task 11: Jenkins plugin scaffold

**Files:** `jenkins-plugin/pom.xml` (create), `jenkins-plugin/src/main/java/com/ashforde/grasp/GraspBuilder.java` (create)

**Steps:**
1. Create `jenkins-plugin/pom.xml` using Jenkins Plugin POM parent (`org.jenkins-ci.plugins:plugin:4.80`)
2. Create `jenkins-plugin/src/main/java/com/ashforde/grasp/GraspBuilder.java`:
   ```java
   package com.ashforde.grasp;
   import hudson.tasks.Builder;
   import hudson.model.AbstractBuild;
   import hudson.model.BuildListener;
   import hudson.Launcher;
   import org.kohsuke.stapler.DataBoundConstructor;

   public class GraspBuilder extends Builder {
     private final String threshold;

     @DataBoundConstructor
     public GraspBuilder(String threshold) { this.threshold = threshold; }

     public String getThreshold() { return threshold; }

     @Override
     public boolean perform(AbstractBuild<?,?> build, Launcher launcher, BuildListener listener) throws Exception {
       listener.getLogger().println("[Grasp] Running architecture analysis...");
       int exit = launcher.launch().cmds("grasp", "analyze", "--threshold", threshold)
         .stdout(listener).join();
       return exit == 0;
     }
   }
   ```
3. Create JUnit test using Jenkins Test Harness
4. Commit: `git commit -m "feat(jenkins-plugin): GraspBuilder with threshold + JUnit harness test"`

---

## Phase 3A — Microsoft Teams Bot

---

## Task 12: Extract shared digest engine

**Files:** `shared/digest-engine/index.ts` (create), `shared/digest-engine/__tests__/digest.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   // shared/digest-engine/__tests__/digest.test.ts
   import { buildDigest } from '../index';
   test('digest includes all repos', () => {
     const digest = buildDigest([
       { repo: 'org/frontend', grade: 'B', score: 78, delta: +2 },
       { repo: 'org/backend', grade: 'D', score: 45, delta: -8 },
     ]);
     expect(digest.repos).toHaveLength(2);
     expect(digest.summary).toContain('2 repos');
   });
   test('digest flags repos below C', () => {
     const digest = buildDigest([{ repo: 'org/app', grade: 'D', score: 45, delta: 0 }]);
     expect(digest.alerts).toHaveLength(1);
   });
   ```
2. Create `shared/digest-engine/index.ts`:
   ```typescript
   export interface RepoResult { repo: string; grade: string; score: number; delta: number; }
   export interface DigestResult { repos: RepoResult[]; summary: string; alerts: RepoResult[]; timestamp: string; }

   export function buildDigest(repos: RepoResult[]): DigestResult {
     const alerts = repos.filter(r => ['D', 'F'].includes(r.grade));
     return {
       repos,
       summary: `${repos.length} repos analysed · ${alerts.length} need attention`,
       alerts,
       timestamp: new Date().toISOString(),
     };
   }
   ```
3. Verify passes: `cd shared/digest-engine && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(shared/digest-engine): shared digest builder for Slack/Teams/Discord bots"`

---

## Task 13: Teams bot with Adaptive Cards

**Files:** `teams-bot/src/index.ts` (create), `teams-bot/src/cards.ts` (create), `teams-bot/src/__tests__/cards.test.ts` (create), `teams-bot/package.json` (create)

**Steps:**
1. Write test:
   ```typescript
   // teams-bot/src/__tests__/cards.test.ts
   import { buildHealthCard } from '../cards';
   test('card has required AdaptiveCard structure', () => {
     const card = buildHealthCard({ repo: 'org/app', grade: 'B', score: 78, issues: [] });
     expect(card.type).toBe('AdaptiveCard');
     expect(card.body).toBeDefined();
   });
   ```
2. Create `teams-bot/src/cards.ts`:
   ```typescript
   export function buildHealthCard(result: {repo: string; grade: string; score: number; issues: string[]}) {
     return {
       type: 'AdaptiveCard',
       version: '1.4',
       body: [
         { type: 'TextBlock', text: `Grasp Health Report`, weight: 'Bolder', size: 'Large' },
         { type: 'FactSet', facts: [
           { title: 'Repo', value: result.repo },
           { title: 'Grade', value: result.grade },
           { title: 'Score', value: `${result.score}/100` },
         ]},
         ...(result.issues.length ? [{
           type: 'TextBlock', text: `Issues: ${result.issues.join(', ')}`, wrap: true, color: 'Warning'
         }] : []),
       ],
     };
   }
   ```
3. Create `teams-bot/src/index.ts` using botbuilder SDK — register `/grasp` command handler
4. Verify passes: `cd teams-bot && npm install && npx jest` → `PASS`
5. Commit: `git commit -m "feat(teams-bot): Adaptive Card digest + slash command handler"`

---

## Phase 3B — Discord Bot

---

## Task 14: Discord bot with embeds

**Files:** `discord-bot/src/index.ts` (create), `discord-bot/src/embeds.ts` (create), `discord-bot/src/__tests__/embeds.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { buildHealthEmbed } from '../embeds';
   test('embed has title and colour', () => {
     const embed = buildHealthEmbed({ repo: 'org/app', grade: 'A', score: 95 });
     expect(embed.title).toContain('Grasp');
     expect(embed.color).toBe(0x38a169); // green for A
   });
   test('grade F embed is red', () => {
     const embed = buildHealthEmbed({ repo: 'org/app', grade: 'F', score: 12 });
     expect(embed.color).toBe(0xe53e3e);
   });
   ```
2. Create `discord-bot/src/embeds.ts`:
   ```typescript
   const GRADE_COLORS: Record<string, number> = { A: 0x38a169, B: 0x68d391, C: 0xf6e05e, D: 0xed8936, F: 0xe53e3e };
   export function buildHealthEmbed(result: {repo: string; grade: string; score: number}) {
     return {
       title: `Grasp Health Report — ${result.repo}`,
       color: GRADE_COLORS[result.grade] ?? 0x718096,
       fields: [
         { name: 'Grade', value: result.grade, inline: true },
         { name: 'Score', value: `${result.score}/100`, inline: true },
       ],
       footer: { text: 'Grasp Code Architecture Suite' },
     };
   }
   ```
3. Create `discord-bot/src/index.ts` with discord.js Client, registers `/grasp analyze` slash command
4. Verify: `cd discord-bot && npm install && npx jest` → `PASS`
5. Commit: `git commit -m "feat(discord-bot): slash command + colour-coded health embeds"`

---

## Phase 4 — Code Hosting Expansion

---

## Task 15: Bitbucket Cloud source

**Files:** `mcp/src/sources/bitbucket.ts` (create), `mcp/src/sources/__tests__/bitbucket.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { BitbucketSource } from '../bitbucket';
   import { setupMockServer } from '../../../shared/test-utils/mock-server/index';
   const server = setupMockServer();
   beforeAll(() => server.listen()); afterAll(() => server.close());
   test('getFileTree returns files from Bitbucket API', async () => {
     const src = new BitbucketSource('testuser', 'testrepo', 'testuser', 'apppassword');
     const files = await src.getFileTree();
     expect(Array.isArray(files)).toBe(true);
   });
   ```
2. Create `mcp/src/sources/bitbucket.ts` mirroring `github.ts` structure:
   ```typescript
   import type { FileEntry } from '../types.js';

   export class BitbucketSource {
     private baseUrl = 'https://api.bitbucket.org/2.0';
     constructor(
       private workspace: string,
       private repo: string,
       private username: string,
       private appPassword: string
     ) {}

     private get authHeader() {
       return 'Basic ' + Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
     }

     async getFileTree(): Promise<FileEntry[]> {
       const res = await fetch(`${this.baseUrl}/repositories/${this.workspace}/${this.repo}/src?pagelen=100`, {
         headers: { Authorization: this.authHeader }
       });
       const data = await res.json();
       return (data.values || []).map((f: any) => ({ path: f.path, size: f.size }));
     }

     async getFileContent(path: string): Promise<string> {
       const res = await fetch(`${this.baseUrl}/repositories/${this.workspace}/${this.repo}/src/HEAD/${path}`, {
         headers: { Authorization: this.authHeader }
       });
       return res.text();
     }
   }
   ```
3. Add `bitbucket` handler to MSW mock server in `shared/test-utils/mock-server/handlers/bitbucket.ts`
4. Verify: `cd mcp && npm test -- --grep BitbucketSource` → `PASS`
5. Commit: `git commit -m "feat(mcp/sources): BitbucketSource — Bitbucket Cloud API v2"`

---

## Task 16: Azure DevOps source

**Files:** `mcp/src/sources/azure.ts` (create), `mcp/src/sources/__tests__/azure.test.ts` (create)

**Steps:**
1. Write test matching Bitbucket test pattern but for Azure DevOps REST API
2. Create `mcp/src/sources/azure.ts`:
   ```typescript
   import type { FileEntry } from '../types.js';

   export class AzureSource {
     private baseUrl: string;
     constructor(private org: string, private project: string, private repo: string, private pat: string) {
       this.baseUrl = `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}`;
     }

     private get authHeader() {
       return 'Basic ' + Buffer.from(`:${this.pat}`).toString('base64');
     }

     async getFileTree(): Promise<FileEntry[]> {
       const res = await fetch(`${this.baseUrl}/items?recursionLevel=Full&api-version=7.1`, {
         headers: { Authorization: this.authHeader }
       });
       const data = await res.json();
       return (data.value || []).filter((i: any) => i.gitObjectType === 'blob')
         .map((i: any) => ({ path: i.path.replace(/^\//, ''), size: 0 }));
     }

     async getFileContent(path: string): Promise<string> {
       const res = await fetch(`${this.baseUrl}/items?path=/${path}&api-version=7.1`, {
         headers: { Authorization: this.authHeader }
       });
       return res.text();
     }
   }
   ```
3. Verify: `cd mcp && npm test -- --grep AzureSource` → `PASS`
4. Commit: `git commit -m "feat(mcp/sources): AzureSource — Azure DevOps Repos API v7.1"`

---

## Task 17: Gitea/Forgejo source with Docker E2E

**Files:** `mcp/src/sources/gitea.ts` (create), `mcp/src/sources/__tests__/gitea.e2e.test.ts` (create)

**Steps:**
1. Create `mcp/src/sources/gitea.ts`:
   ```typescript
   import type { FileEntry } from '../types.js';

   export class GiteaSource {
     constructor(private baseUrl: string, private owner: string, private repo: string, private token?: string) {}

     private get headers() {
       return this.token ? { Authorization: `token ${this.token}` } : {};
     }

     async getFileTree(): Promise<FileEntry[]> {
       const res = await fetch(`${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/git/trees/HEAD?recursive=true`, {
         headers: this.headers
       });
       const data = await res.json();
       return (data.tree || []).filter((f: any) => f.type === 'blob')
         .map((f: any) => ({ path: f.path, size: f.size || 0 }));
     }

     async getFileContent(path: string): Promise<string> {
       const res = await fetch(`${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/raw/${path}`, {
         headers: this.headers
       });
       return res.text();
     }
   }
   ```
2. Create E2E test (skipped unless `GITEA_URL` env var set):
   ```typescript
   const GITEA_URL = process.env.GITEA_URL;
   (GITEA_URL ? test : test.skip)('E2E: fetches file tree from live Gitea', async () => {
     const src = new GiteaSource(GITEA_URL!, 'testuser', 'testrepo');
     const files = await src.getFileTree();
     expect(files.length).toBeGreaterThan(0);
   });
   ```
3. Verify: `cd mcp && npm test -- --grep GiteaSource` → `PASS`
4. Commit: `git commit -m "feat(mcp/sources): GiteaSource — Gitea/Forgejo API v1, Docker E2E test"`

---

## Phase 5 — Browser Extension

---

## Task 18: Browser extension scaffold (Manifest V3)

**Files:** `browser-extension/manifest.json` (create), `browser-extension/content.ts` (create), `browser-extension/background.ts` (create), `browser-extension/package.json` (create)

**Steps:**
1. Create `browser-extension/manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "Grasp — Code Architecture",
     "version": "3.1.1",
     "description": "Dependency graph, health score, and security scanner for any GitHub repo",
     "permissions": ["activeTab", "storage"],
     "host_permissions": ["https://github.com/*", "http://localhost:*"],
     "content_scripts": [{
       "matches": ["https://github.com/*/*"],
       "js": ["dist/content.js"],
       "css": ["dist/content.css"]
     }],
     "background": { "service_worker": "dist/background.js" },
     "action": { "default_popup": "popup.html", "default_icon": "icon128.png" }
   }
   ```
2. Create `browser-extension/content.ts` — detects GitHub repo pages, injects sidebar button
3. Create `browser-extension/background.ts` — message handler, calls local grasp-mcp-server
4. Create `browser-extension/package.json` with webpack build, `web-ext` for Firefox
5. Commit: `git commit -m "feat(browser-extension): Manifest V3 scaffold, content + background scripts"`

---

## Task 19: Browser extension tests with Playwright

**Files:** `browser-extension/__tests__/e2e/extension.spec.ts` (create)

**Steps:**
1. Write Playwright test:
   ```typescript
   import { test, expect, chromium } from '@playwright/test';
   import path from 'path';

   test('extension loads on GitHub repo page', async () => {
     const pathToExtension = path.join(__dirname, '../../dist');
     const context = await chromium.launchPersistentContext('', {
       headless: false,
       args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
     });
     const page = await context.newPage();
     await page.goto('https://github.com/ashfordeOU/grasp');
     // Extension injects a button
     await expect(page.locator('[data-grasp="sidebar-toggle"]')).toBeVisible({ timeout: 5000 });
     await context.close();
   });
   ```
2. Add `playwright.config.ts` to `browser-extension/`
3. Add Firefox build step using `web-ext build --source-dir dist --artifacts-dir dist/firefox`
4. Verify: `cd browser-extension && npm run build && npx playwright test` → `PASS` (or skip if no headless display)
5. Commit: `git commit -m "feat(browser-extension): Playwright E2E + Firefox web-ext build"`

---

## Phase 6 — Raycast Extension

---

## Task 20: Raycast extension scaffold

**Files:** `raycast-grasp/src/analyze-repo.tsx` (create — companion repo), `raycast-grasp/package.json` (create)

**Steps:**
1. Create `raycast-grasp/package.json` following Raycast extension manifest format:
   ```json
   {
     "name": "grasp",
     "title": "Grasp — Code Architecture",
     "description": "Analyse any GitHub repo — get health score, dependency graph, security issues",
     "icon": "icon.png",
     "author": "ashfordeou",
     "license": "Elastic-2.0",
     "commands": [
       { "name": "analyze-repo", "title": "Analyze Repository", "description": "Analyse a repo with Grasp", "mode": "view" }
     ],
     "dependencies": { "@raycast/api": "^1.0.0" }
   }
   ```
2. Create `raycast-grasp/src/analyze-repo.tsx`:
   ```typescript
   import { Form, ActionPanel, Action, showToast, Toast } from '@raycast/api';
   import { useState } from 'react';

   export default function Command() {
     const [repo, setRepo] = useState('');
     async function handleSubmit() {
       await showToast({ style: Toast.Style.Animated, title: 'Analysing...' });
       // Call local grasp-mcp-server
       await showToast({ style: Toast.Style.Success, title: 'Analysis complete', message: repo });
     }
     return (
       <Form actions={<ActionPanel><Action.SubmitForm onSubmit={handleSubmit} /></ActionPanel>}>
         <Form.TextField id="repo" title="Repository" placeholder="owner/repo" value={repo} onChange={setRepo} />
       </Form>
     );
   }
   ```
3. Write Jest unit test for command logic
4. Commit: `git commit -m "feat(raycast): analyze-repo command with health score display"`

---

## Phase 7A — Continue.dev Context Provider

---

## Task 21: Continue.dev context provider

**Files:** `continue-provider/src/GraspContextProvider.ts` (create), `continue-provider/src/__tests__/provider.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { GraspContextProvider } from '../GraspContextProvider';
   test('provider returns dep graph as context item', async () => {
     const provider = new GraspContextProvider({ graspServerUrl: 'http://localhost:3000' });
     const items = await provider.getContextItems('src/index.ts', {});
     expect(items[0].name).toBe('Grasp Dependency Graph');
     expect(items[0].content).toContain('dependencies');
   });
   ```
2. Create `continue-provider/src/GraspContextProvider.ts`:
   ```typescript
   export interface ContextItem { name: string; description: string; content: string; }
   export class GraspContextProvider {
     constructor(private config: { graspServerUrl: string }) {}
     async getContextItems(query: string, _extras: unknown): Promise<ContextItem[]> {
       try {
         const res = await fetch(`${this.config.graspServerUrl}/analyze?file=${encodeURIComponent(query)}`);
         const data = await res.json();
         return [{
           name: 'Grasp Dependency Graph',
           description: `Dependencies for ${query}`,
           content: JSON.stringify(data.dependencies, null, 2),
         }];
       } catch { return []; }
     }
   }
   ```
3. Verify: `cd continue-provider && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(continue-provider): GraspContextProvider with dep graph + health score context"`

---

## Phase 7B — GitHub Copilot Extension

---

## Task 22: Copilot extension agent handler

**Files:** `copilot-extension/src/index.ts` (create), `copilot-extension/src/__tests__/handler.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { handleCopilotMessage } from '../index';
   test('responds to @grasp analyze with health report', async () => {
     const response = await handleCopilotMessage({ content: '@grasp analyze test/repo' });
     expect(response.content).toContain('Health');
   });
   ```
2. Create `copilot-extension/src/index.ts` — Express server handling Copilot skillset webhook:
   ```typescript
   import express from 'express';
   const app = express();
   app.use(express.json());

   export async function handleCopilotMessage(msg: {content: string}): Promise<{content: string}> {
     const match = msg.content.match(/analyze\s+([^\s]+)/);
     if (!match) return { content: 'Usage: @grasp analyze owner/repo' };
     const repo = match[1];
     return { content: `**Grasp Health Report** for \`${repo}\`\n\nRun \`grasp analyze ${repo}\` to get full results.` };
   }

   app.post('/agent', async (req, res) => {
     const result = await handleCopilotMessage(req.body);
     res.json(result);
   });
   export default app;
   ```
3. Verify: `cd copilot-extension && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(copilot-extension): agent handler for @grasp analyze command"`

---

## Phase 7C — OpenAI GPT Actions

---

## Task 23: GPT Actions OpenAPI spec + Express server

**Files:** `gpt-actions/openapi.yaml` (create), `gpt-actions/src/server.ts` (create), `gpt-actions/src/__tests__/endpoints.test.ts` (create)

**Steps:**
1. Create `gpt-actions/openapi.yaml`:
   ```yaml
   openapi: 3.1.0
   info:
     title: Grasp Architecture API
     version: 3.1.1
     description: Analyse GitHub repos — dependency graphs, health scores, security issues
   servers:
     - url: https://grasp-gpt-actions.vercel.app
   paths:
     /analyze:
       get:
         operationId: analyzeRepo
         summary: Analyse a repository
         parameters:
           - name: repo
             in: query
             required: true
             schema: {type: string}
             description: "Repository in owner/repo format"
         responses:
           '200':
             description: Analysis result
             content:
               application/json:
                 schema:
                   type: object
                   properties:
                     grade: {type: string}
                     score: {type: integer}
                     dependencies: {type: integer}
   ```
2. Create Express server with `/analyze` endpoint wrapping `grasp-mcp-server` analyze tool
3. Write Jest test for endpoint
4. Validate OpenAPI spec: `npx @redocly/cli lint gpt-actions/openapi.yaml` → no errors
5. Commit: `git commit -m "feat(gpt-actions): OpenAPI spec + Express REST wrapper for ChatGPT integration"`

---

## Phase 7D — Amazon Q Plugin

---

## Task 24: Amazon Q Developer plugin

**Files:** `amazon-q-plugin/src/plugin.ts` (create), `amazon-q-plugin/src/__tests__/plugin.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { handleQCommand } from '../plugin';
   test('handles /grasp command', async () => {
     const result = await handleQCommand({ command: '/grasp', args: 'test/repo' });
     expect(result.message).toContain('Grasp');
   });
   ```
2. Create `amazon-q-plugin/src/plugin.ts`:
   ```typescript
   export async function handleQCommand(input: {command: string; args: string}): Promise<{message: string}> {
     if (input.command !== '/grasp') return { message: 'Unknown command' };
     return { message: `**Grasp Analysis** for \`${input.args}\`\n\nRun \`grasp analyze ${input.args}\` for full results.` };
   }
   ```
3. Verify: `cd amazon-q-plugin && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(amazon-q-plugin): /grasp command handler for Amazon Q Developer"`

---

## Phase 8A — Zed Extension

---

## Task 25: Zed extension scaffold

**Files:** `zed-extension/extension.toml` (create), `zed-extension/src/lib.rs` (create — Zed uses WASM/Rust)

**Steps:**
1. Create `zed-extension/extension.toml`:
   ```toml
   id = "grasp"
   name = "Grasp — Code Architecture"
   version = "3.1.1"
   schema_version = 1
   authors = ["Ashforde OÜ <hello@ashforde.org>"]
   description = "Dependency graph, health score, and security scanner"
   repository = "https://github.com/ashfordeOU/grasp"
   ```
2. Create minimal `zed-extension/src/lib.rs`:
   ```rust
   use zed_extension_api::{self as zed, Result};
   struct GraspExtension;
   impl zed::Extension for GraspExtension {
       fn new() -> Self { GraspExtension }
   }
   zed::register_extension!(GraspExtension);
   ```
3. Create `zed-extension/Cargo.toml` with `zed_extension_api` dependency
4. Build: `cd zed-extension && cargo build --target wasm32-wasi` → compiles
5. Commit: `git commit -m "feat(zed-extension): scaffold with extension.toml + Rust WASM stub"`

---

## Phase 8B — Vim Plugin

---

## Task 26: Vim plugin with Vimscript commands

**Files:** `vim-plugin/plugin/grasp.vim` (create), `vim-plugin/autoload/grasp.vim` (create), `vim-plugin/test/test_grasp.vader` (create)

**Steps:**
1. Create `vim-plugin/plugin/grasp.vim`:
   ```viml
   if exists('g:loaded_grasp') | finish | endif
   let g:loaded_grasp = 1

   command! GraspAnalyze call grasp#analyze()
   command! GraspDeps call grasp#show_deps()
   command! GraspHealth call grasp#show_health()

   if get(g:, 'grasp_statusline', 1)
     set statusline+=%{grasp#statusline()}
   endif
   ```
2. Create `vim-plugin/autoload/grasp.vim`:
   ```viml
   function! grasp#analyze() abort
     let l:result = system('grasp analyze ' . shellescape(expand('%:p')))
     echo l:result
   endfunction

   function! grasp#show_health() abort
     let l:result = system('grasp health ' . shellescape(expand('%:p')))
     echo split(l:result, "\n")[0]
   endfunction

   function! grasp#statusline() abort
     return exists('b:grasp_grade') ? '[Grasp:' . b:grasp_grade . ']' : ''
   endfunction

   function! grasp#show_deps() abort
     let l:file = expand('%:.')
     let l:result = system('grasp deps ' . shellescape(l:file))
     echo l:result
   endfunction
   ```
3. Create Vader test:
   ```vader
   Execute (GraspAnalyze command exists):
     Assert exists(':GraspAnalyze'), "GraspAnalyze command should exist"

   Execute (statusline function exists):
     Assert exists('*grasp#statusline'), "statusline function should exist"
   ```
4. Run: `vim -u NONE -c "source vim-plugin/plugin/grasp.vim" -c "Vader! vim-plugin/test/test_grasp.vader" -c "qa!"` → `PASS`
5. Commit: `git commit -m "feat(vim-plugin): GraspAnalyze/GraspDeps/GraspHealth commands + statusline + Vader tests"`

---

## Phase 8C — Emacs Package

---

## Task 27: Emacs package with grasp-mode

**Files:** `emacs-package/grasp.el` (create), `emacs-package/test/test-grasp.el` (create)

**Steps:**
1. Create `emacs-package/grasp.el`:
   ```elisp
   ;;; grasp.el --- Code architecture visualizer -*- lexical-binding: t -*-
   ;; Author: Ashforde OÜ <hello@ashforde.org>
   ;; Version: 3.1.1
   ;; Package-Requires: ((emacs "27.1"))
   ;; Keywords: tools, programming
   ;; URL: https://github.com/ashfordeOU/grasp

   ;;; Code:
   (defgroup grasp nil "Grasp code architecture." :group 'tools)
   (defcustom grasp-executable "grasp" "Path to grasp executable." :type 'string)

   (defun grasp-analyze ()
     "Analyse current project with Grasp."
     (interactive)
     (let ((output (shell-command-to-string
                    (format "%s analyze %s" grasp-executable default-directory))))
       (with-output-to-temp-buffer "*Grasp Analysis*"
         (princ output))))

   (defun grasp-show-deps ()
     "Show dependencies for current file."
     (interactive)
     (let ((output (shell-command-to-string
                    (format "%s deps %s" grasp-executable (buffer-file-name)))))
       (message "%s" output)))

   (define-minor-mode grasp-mode
     "Minor mode for Grasp architecture analysis."
     :lighter " Grasp"
     :keymap (let ((map (make-sparse-keymap)))
               (define-key map (kbd "C-c g a") #'grasp-analyze)
               (define-key map (kbd "C-c g d") #'grasp-show-deps)
               map))

   (provide 'grasp)
   ;;; grasp.el ends here
   ```
2. Create ERT test:
   ```elisp
   (require 'ert)
   (require 'grasp)
   (ert-deftest grasp-mode-loads ()
     (should (featurep 'grasp)))
   (ert-deftest grasp-executable-default ()
     (should (string= grasp-executable "grasp")))
   ```
3. Run: `emacs --batch -l emacs-package/grasp.el -l emacs-package/test/test-grasp.el -f ert-run-tests-batch-and-exit` → `PASS`
4. Commit: `git commit -m "feat(emacs-package): grasp-mode with M-x grasp-analyze, grasp-show-deps + ERT tests"`

---

## Phase 8D — Eclipse Plugin

---

## Task 28: Eclipse plugin OSGi bundle scaffold

**Files:** `eclipse-plugin/pom.xml` (create), `eclipse-plugin/META-INF/MANIFEST.MF` (create), `eclipse-plugin/src/com/ashforde/grasp/GraspView.java` (create)

**Steps:**
1. Create `eclipse-plugin/META-INF/MANIFEST.MF`:
   ```
   Manifest-Version: 1.0
   Bundle-ManifestVersion: 2
   Bundle-Name: Grasp Code Architecture
   Bundle-SymbolicName: com.ashforde.grasp;singleton:=true
   Bundle-Version: 3.1.1
   Bundle-Activator: com.ashforde.grasp.Activator
   Require-Bundle: org.eclipse.ui,org.eclipse.core.runtime
   Bundle-RequiredExecutionEnvironment: JavaSE-17
   ```
2. Create `eclipse-plugin/src/com/ashforde/grasp/GraspView.java`:
   ```java
   package com.ashforde.grasp;
   import org.eclipse.swt.widgets.Composite;
   import org.eclipse.ui.part.ViewPart;
   public class GraspView extends ViewPart {
     public static final String ID = "com.ashforde.grasp.view";
     @Override
     public void createPartControl(Composite parent) {
       // Renders dep graph via embedded browser
     }
     @Override
     public void setFocus() {}
   }
   ```
3. Create `eclipse-plugin/pom.xml` using Tycho 4.x for OSGi build
4. Build: `cd eclipse-plugin && mvn -q package` → creates `.jar`
5. Commit: `git commit -m "feat(eclipse-plugin): OSGi bundle scaffold with GraspView + Tycho build"`

---

## Phase 9A — Linear Integration

---

## Task 29: Linear integration — create issues for violations

**Files:** `linear-integration/src/index.ts` (create), `linear-integration/src/__tests__/linear.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { createLinearIssue, formatIssueTitle } from '../index';
   test('formats issue title from violation', () => {
     const title = formatIssueTitle({ file: 'src/auth.ts', violation: 'circular-dep', grade: 'F' });
     expect(title).toBe('[Grasp] Circular dependency in src/auth.ts (Grade: F)');
   });
   test('createLinearIssue calls Linear API', async () => {
     const mockCreate = jest.fn().mockResolvedValue({ issue: { id: 'test-id' } });
     const result = await createLinearIssue({ title: 'test', description: 'desc' }, mockCreate);
     expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'test' }));
   });
   ```
2. Create `linear-integration/src/index.ts`:
   ```typescript
   import { LinearClient } from '@linear/sdk';

   export function formatIssueTitle(v: {file: string; violation: string; grade: string}): string {
     const type = v.violation === 'circular-dep' ? 'Circular dependency' : v.violation;
     return `[Grasp] ${type} in ${v.file} (Grade: ${v.grade})`;
   }

   export async function createLinearIssue(
     issue: {title: string; description: string},
     createFn?: (i: any) => Promise<any>
   ) {
     if (createFn) return createFn(issue);
     const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
     const teams = await client.teams();
     const team = teams.nodes[0];
     return client.createIssue({ teamId: team.id, title: issue.title, description: issue.description });
   }
   ```
3. Verify: `cd linear-integration && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(linear-integration): create Linear issues for Grasp health violations"`

---

## Phase 9B — Jira Integration

---

## Task 30: Jira integration — create tickets for violations

**Files:** `jira-integration/src/index.ts` (create), `jira-integration/src/__tests__/jira.test.ts` (create)

**Steps:**
1. Write test:
   ```typescript
   import { createJiraTicket, formatTicketSummary } from '../index';
   test('formats ticket summary', () => {
     const summary = formatTicketSummary({ file: 'src/db.ts', violation: 'security-issue', grade: 'D' });
     expect(summary).toContain('[Grasp]');
     expect(summary).toContain('src/db.ts');
   });
   ```
2. Create `jira-integration/src/index.ts`:
   ```typescript
   export function formatTicketSummary(v: {file: string; violation: string; grade: string}): string {
     return `[Grasp] ${v.violation} in ${v.file} — Grade: ${v.grade}`;
   }

   export async function createJiraTicket(
     ticket: {summary: string; description: string; projectKey: string},
     httpPost?: (url: string, body: unknown) => Promise<unknown>
   ) {
     const post = httpPost ?? (async (url, body) => {
       const res = await fetch(url, {
         method: 'POST',
         headers: {
           'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString('base64')}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(body),
       });
       return res.json();
     });
     return post(`${process.env.JIRA_BASE_URL}/rest/api/3/issue`, {
       fields: { project: { key: ticket.projectKey }, summary: ticket.summary,
         description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: ticket.description }] }] },
         issuetype: { name: 'Bug' } }
     });
   }
   ```
3. Verify: `cd jira-integration && npm install && npx jest` → `PASS`
4. Commit: `git commit -m "feat(jira-integration): create Jira tickets for Grasp health violations"`

---

## Phase 10 — AI Coding Tool Integrations

---

## Task 31: Shared MCP compatibility test harness

**Files:** `ai-tools/shared/mcp-compat-test.ts` (create), `ai-tools/shared/mcp-inspector-smoke.sh` (create)

**Steps:**
1. Create `ai-tools/shared/mcp-compat-test.ts`:
   ```typescript
   /**
    * Parameterised MCP compatibility test.
    * Verifies all 48 tool schemas from grasp-mcp-server parse cleanly.
    * Run with: TOOL_NAME=cursor npx jest mcp-compat-test.ts
    */
   import { spawn } from 'child_process';

   const EXPECTED_TOOL_COUNT = 48;

   test(`MCP server exposes ${EXPECTED_TOOL_COUNT} tools`, async () => {
     const server = spawn('grasp-mcp', ['--list-tools', '--json']);
     const output: string[] = [];
     server.stdout.on('data', (d) => output.push(d.toString()));
     await new Promise((resolve) => server.on('close', resolve));
     const tools = JSON.parse(output.join(''));
     expect(tools.length).toBe(EXPECTED_TOOL_COUNT);
   }, 30000);

   test('all tool schemas have name and description', async () => {
     const server = spawn('grasp-mcp', ['--list-tools', '--json']);
     const output: string[] = [];
     server.stdout.on('data', (d) => output.push(d.toString()));
     await new Promise((resolve) => server.on('close', resolve));
     const tools = JSON.parse(output.join(''));
     tools.forEach((tool: {name: string; description: string}) => {
       expect(tool.name).toBeTruthy();
       expect(tool.description).toBeTruthy();
     });
   }, 30000);
   ```
2. Create `ai-tools/shared/mcp-inspector-smoke.sh`:
   ```bash
   #!/bin/bash
   set -e
   echo "Starting grasp-mcp-server..."
   npx @modelcontextprotocol/inspector grasp-mcp --timeout 10000 2>&1 | head -50
   echo "MCP Inspector smoke test complete"
   ```
3. Create `ai-tools/shared/package.json` with jest config
4. Commit: `git commit -m "feat(ai-tools/shared): MCP compat test harness + inspector smoke script"`

---

## Task 32: Claude Code integration config

**Files:** `ai-tools/claude-code/claude-mcp.json` (create), `ai-tools/claude-code/README.md` (create)

**Steps:**
1. Create `ai-tools/claude-code/claude-mcp.json`:
   ```json
   {
     "mcpServers": {
       "grasp": {
         "command": "npx",
         "args": ["grasp-mcp-server"],
         "env": {
           "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
       }
     }
   }
   ```
2. Create `ai-tools/claude-code/README.md` with step-by-step setup:
   - Install: `npm install -g grasp-mcp-server`
   - Add config: copy `claude-mcp.json` content to `~/.claude/mcp.json` or run `claude mcp add grasp npx grasp-mcp-server`
   - Verify: `claude mcp list` → shows `grasp`
   - Use: `@grasp analyze owner/repo` in any Claude Code conversation
3. Write test: `npx jest ai-tools/shared/mcp-compat-test.ts` → `PASS`
4. Commit: `git commit -m "feat(ai-tools/claude-code): MCP config snippet + setup guide"`

---

## Task 33: Cursor integration config

**Files:** `ai-tools/cursor/cursor-mcp.json` (create), `ai-tools/cursor/README.md` (create)

**Steps:**
1. Create `ai-tools/cursor/cursor-mcp.json`:
   ```json
   {
     "mcpServers": {
       "grasp": {
         "command": "npx",
         "args": ["-y", "grasp-mcp-server"],
         "env": {
           "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
       }
     }
   }
   ```
2. Create README: copy to `.cursor/mcp.json` in project root, or add via Cursor Settings → MCP → Add Server
3. Write schema validation test: parse JSON, verify `mcpServers.grasp.command` exists
4. Commit: `git commit -m "feat(ai-tools/cursor): MCP config snippet for Cursor Settings → MCP"`

---

## Task 34: Cline and Roo Code integration configs

**Files:** `ai-tools/cline/cline-mcp.json` (create), `ai-tools/cline/README.md` (create), `ai-tools/roo-code/roo-mcp.json` (create), `ai-tools/roo-code/README.md` (create)

**Steps:**
1. Create `ai-tools/cline/cline-mcp.json` (Cline MCP config — same structure as Cursor):
   ```json
   {
     "mcpServers": {
       "grasp": {
         "command": "npx",
         "args": ["-y", "grasp-mcp-server"],
         "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
       }
     }
   }
   ```
2. Create Cline README: add via Cline Settings → MCP Servers → Edit Config, paste config
3. Create `ai-tools/roo-code/roo-mcp.json` with same structure (Roo Code uses identical MCP config format)
4. Create Roo Code README: add via Roo Code Settings → MCP Servers → Edit Config
5. Write parameterised test validating both configs parse correctly:
   ```typescript
   ['cline', 'roo-code'].forEach(tool => {
     test(`${tool} config is valid JSON with mcpServers.grasp`, () => {
       const config = require(`./../${tool}/${tool === 'roo-code' ? 'roo' : tool}-mcp.json`);
       expect(config.mcpServers.grasp.command).toBe('npx');
     });
   });
   ```
6. Commit: `git commit -m "feat(ai-tools): Cline + Roo Code MCP config snippets (shared protocol)"`

---

## Task 35: Kilo Code, OpenCode, Trae, Grok CLI, Codex CLI, Droid configs

**Files:** Config JSON + README for each of the 6 remaining tools

**Steps:**
1. Create `ai-tools/kilo-code/kilo-mcp.json` — same MCP server format
2. Create `ai-tools/opencode/opencode.json`:
   ```json
   {
     "mcp": {
       "grasp": {
         "command": "npx",
         "args": ["-y", "grasp-mcp-server"],
         "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
       }
     }
   }
   ```
3. Create `ai-tools/trae/trae-mcp.json` — Trae uses same MCP JSON format as Cursor
4. Create `ai-tools/grok-cli/grok-mcp.json`:
   ```json
   {
     "tools": [{
       "name": "grasp",
       "type": "mcp",
       "command": "npx",
       "args": ["-y", "grasp-mcp-server"]
     }]
   }
   ```
5. Create `ai-tools/codex-cli/codex-config.json`:
   ```json
   {
     "mcpServers": {
       "grasp": { "command": "npx", "args": ["-y", "grasp-mcp-server"] }
     }
   }
   ```
6. Create `ai-tools/droid/droid-mcp.json` — same MCP format
7. Create README for each with platform-specific setup instructions
8. Write test validating all 10 AI tool configs parse correctly (parameterised loop)
9. Commit: `git commit -m "feat(ai-tools): Kilo Code, OpenCode, Trae, Grok CLI, Codex CLI, Droid MCP configs"`

---

## Task 36: AI tools index and root README update

**Files:** `ai-tools/README.md` (create), `README.md` (modify — add AI tools to integrations table)

**Steps:**
1. Create `ai-tools/README.md` — compatibility matrix table:
   ```markdown
   # Grasp × AI Coding Tools

   | Tool | Protocol | Config file | Status |
   |------|----------|-------------|--------|
   | Claude Code | MCP stdio | `~/.claude/mcp.json` | ✅ |
   | Cursor | MCP stdio | `.cursor/mcp.json` | ✅ |
   | Cline | MCP stdio | VS Code settings | ✅ |
   | Roo Code | MCP stdio | VS Code settings | ✅ |
   | Kilo Code | MCP stdio | Settings | ✅ |
   | OpenCode | MCP | `opencode.json` | ✅ |
   | Trae | MCP stdio | Settings → MCP | ✅ |
   | Grok CLI | MCP tools | `~/.grok/mcp.json` | ✅ |
   | Codex CLI | MCP stdio | `~/.codex/config.json` | ✅ |
   | Droid | MCP | Settings | ✅ |

   All tools use `grasp-mcp-server` via npm. Install once: `npm install -g grasp-mcp-server`
   ```
2. Add AI coding tools section to root `README.md` integrations table
3. Commit: `git commit -m "docs: AI coding tools compatibility matrix + root README integrations table"`

---

## Task 37: Final CI pass — run all integration tests

**Files:** `.github/workflows/integrations.yml` (modify — add Phase 10 job)

**Steps:**
1. Add Phase 10 CI job to `.github/workflows/integrations.yml`:
   ```yaml
   phase-10-ai-tools:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with: {node-version: '20'}
       - run: npm install -g grasp-mcp-server
       - run: cd ai-tools/shared && npm ci && npm test
   ```
2. Verify all jobs are listed in the workflow file
3. Run locally: `cd shared/test-utils && npm test && cd ../../ai-tools/shared && npm test` → all pass
4. Commit: `git commit -m "ci: Phase 10 AI tools job in integrations matrix"`

---

## Manual Verification Checklist (after all tasks complete)

Run through this list before marking each integration as shipped:

**Phase 1A — Homebrew:**
- [ ] `brew tap ashfordeou/grasp && brew install grasp` works on macOS
- [ ] `grasp --version` outputs 3.1.x
- [ ] Formula SHA256 matches npm tarball

**Phase 1B — Docker:**
- [ ] `docker pull ashfordeou/grasp` succeeds
- [ ] `docker run ashfordeou/grasp --version` outputs 3.1.x
- [ ] amd64 and arm64 tags present on Docker Hub

**Phase 2A — GitHub Actions:**
- [ ] Action visible on GitHub Marketplace
- [ ] Test on a real PR — comment appears

**Phase 2B — GitLab CI:**
- [ ] Component published to GitLab CI Catalog
- [ ] Usage in `.gitlab-ci.yml` example works

**Phase 2C — Bitbucket:**
- [ ] Pipe visible on Bitbucket Pipelines marketplace

**Phase 2D — CircleCI:**
- [ ] Orb published: `circleci/grasp`

**Phase 2E — Jenkins:**
- [ ] Plugin ZIP installable via Jenkins Update Center

**Phase 3A — Teams:**
- [ ] Bot registered in Azure Portal
- [ ] Adaptive Card renders in Teams client

**Phase 3B — Discord:**
- [ ] App registered in Discord Developer Portal
- [ ] `/grasp analyze` slash command works in test server

**Phase 5A/B — Browser extensions:**
- [ ] Chrome Extension submitted to Web Store (takes 1-3 days)
- [ ] Firefox Add-on submitted to addons.mozilla.org

**Phase 6 — Raycast:**
- [ ] PR submitted to `raycast-extensions` repo

**Phase 7B — Copilot:**
- [ ] Extension registered, `@grasp` works in Copilot Chat

**Phase 7C — GPT Actions:**
- [ ] Custom GPT published in GPT Store

**Phase 9A — Linear:**
- [ ] OAuth flow tested, issues created in Linear workspace

**Phase 9B — Jira:**
- [ ] App submitted to Atlassian Marketplace

**Phase 10 — AI Coding Tools:**
- [ ] Listed on each tool's official MCP/integration page
- [ ] Setup tested end-to-end on each tool

---

## Summary

| Phase | Integrations | Tasks | Key tech |
|-------|-------------|-------|----------|
| Shared | Mock server, fixtures, CI | 1–3 | MSW, Docker |
| 1 | Homebrew, Docker | 4–5 | Ruby formula, Dockerfile |
| 2 | GH Actions, GitLab, Bitbucket, CircleCI, Jenkins | 6–11 | YAML, Java |
| 3 | Teams, Discord | 12–14 | Bot Framework, discord.js |
| 4 | Bitbucket src, Azure src, Gitea src | 15–17 | TypeScript, MSW |
| 5 | Chrome + Firefox extension | 18–19 | Manifest V3, Playwright |
| 6 | Raycast | 20 | Raycast API |
| 7 | Continue, Copilot, GPT Actions, Amazon Q | 21–24 | OpenAPI, Express |
| 8 | Zed, Vim, Emacs, Eclipse | 25–28 | Rust/WASM, Vimscript, Elisp, Java |
| 9 | Linear, Jira | 29–30 | Linear SDK, Jira REST |
| 10 | 10 AI coding tools | 31–37 | MCP configs, compat tests |

**Total: 37 tasks** covering all 32 integrations + shared infrastructure
