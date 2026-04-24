# Plan: Multi-Provider Auth
Date: 2026-04-24
Goal: Wire Bitbucket, Azure DevOps, Gitea, and GitHub Enterprise into both the MCP analyzer and the browser app UI so every supported Git host shows the correct auth fields and routes correctly.
Architecture: MCP server gets new source routing branches; browser app gets detectProvider() replacing isGitLabUrl() and per-provider auth field rendering; all non-GitHub providers show a helpful MCP command string instead of silently failing.
Tech stack: TypeScript (MCP server), vanilla React JSX in index.html, Jest

Branch: `feature/multi-provider-auth` (cut from main)

---

## Task 1: Extend RepoSource and AnalysisResult types

**Files:** `mcp/src/types.ts` (modify)

**Steps:**
1. Open `mcp/src/types.ts`. Find line 101 (`sourceType`) and line 148 (`type` in RepoSource).
2. Replace the `AnalysisResult.sourceType` line:
   ```typescript
   // BEFORE (line ~101):
   sourceType: 'github' | 'gitlab' | 'local';
   // AFTER:
   sourceType: 'github' | 'gitlab' | 'local' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
   ```
3. Replace the `RepoSource` interface:
   ```typescript
   // BEFORE:
   export interface RepoSource {
     type: 'github' | 'local' | 'gitlab';
     // For GitHub
     owner?: string;
     repo?: string;
     token?: string;
     // For local
     path?: string;
     // For GitLab
     host?: string;
     namespace?: string;
     project?: string;
   }

   // AFTER:
   export interface RepoSource {
     type: 'github' | 'local' | 'gitlab' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
     // GitHub / GitHub Enterprise / Gitea (shared fields)
     owner?: string;
     repo?: string;
     token?: string;
     // Local
     path?: string;
     // GitLab / GitHub Enterprise / Gitea (shared host field)
     host?: string;
     namespace?: string;
     project?: string;
     // Bitbucket
     workspace?: string;
     bitbucketUsername?: string;
     bitbucketPassword?: string;
     // Azure DevOps
     azureOrg?: string;
     azurePat?: string;
   }
   ```
4. Verify: `cd mcp && npx tsc --noEmit 2>&1 | head -20` → expect no errors on this file (errors in other files are expected until later tasks complete)
5. Commit: `git commit -m "feat: extend RepoSource type for Bitbucket, Azure, Gitea, GHE"`

---

## Task 2: Add baseUrl support to GitHubSource + parseGitHubEnterpriseUrl

**Files:** `mcp/src/sources/github.ts` (modify)

**Steps:**
1. Find the `GitHubSource` constructor (line ~14):
   ```typescript
   // BEFORE:
   constructor(owner: string, repo: string, token?: string) {
     this.owner = owner;
     this.repo = repo;
     this.octokit = new Octokit({ auth: token });
   }

   // AFTER:
   constructor(owner: string, repo: string, token?: string, baseUrl?: string) {
     this.owner = owner;
     this.repo = repo;
     this.octokit = new Octokit({
       auth: token,
       ...(baseUrl ? { baseUrl } : {}),
     });
   }
   ```
2. Add `parseGitHubEnterpriseUrl` export at the bottom of the file (after `parseGitHubUrl`):
   ```typescript
   export function parseGitHubEnterpriseUrl(
     input: string
   ): { host: string; owner: string; repo: string } | null {
     // Matches github.mycompany.com/owner/repo — any github.* that is NOT github.com or api.github.com
     const m = input.match(
       /(?:https?:\/\/)?([a-zA-Z0-9_.-]*github[a-zA-Z0-9_.-]*\.[a-zA-Z]{2,})\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
     );
     if (
       m &&
       m[1].toLowerCase() !== 'github.com' &&
       m[1].toLowerCase() !== 'api.github.com' &&
       !m[1].toLowerCase().endsWith('github.io')
     ) {
       return { host: m[1], owner: m[2], repo: m[3].replace(/\.git$/, '') };
     }
     return null;
   }
   ```
3. Verify: `cd mcp && npx tsc --noEmit 2>&1 | grep sources/github` → no errors
4. Commit: `git commit -m "feat: add baseUrl param to GitHubSource for GHE + parseGitHubEnterpriseUrl"`

---

## Task 3: Extend parseSource() in analyzer.ts for all 4 new URL types

**Files:** `mcp/src/analyzer.ts` (modify)

**Steps:**
1. Find the imports at the top of `mcp/src/analyzer.ts`. Add three new source imports and the new GHE parser:
   ```typescript
   // Add after the existing GitHubSource import line:
   import { parseGitHubEnterpriseUrl } from './sources/github.js';
   import { BitbucketSource } from './sources/bitbucket.js';
   import { AzureSource } from './sources/azure.js';
   import { GiteaSource } from './sources/gitea.js';
   ```
2. Add four URL parser helpers just above `parseSource` (before `export function parseSource`):
   ```typescript
   function parseBitbucketUrl(input: string): { workspace: string; repo: string } | null {
     const m = input.match(
       /(?:https?:\/\/)?bitbucket\.org\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
     );
     return m ? { workspace: m[1], repo: m[2].replace(/\.git$/, '') } : null;
   }

   function parseAzureUrl(
     input: string
   ): { org: string; project: string; repo: string } | null {
     // dev.azure.com/org/project/_git/repo
     const m1 = input.match(
       /(?:https?:\/\/)?dev\.azure\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i
     );
     if (m1) return { org: m1[1], project: m1[2], repo: m1[3].replace(/\.git$/, '') };
     // org.visualstudio.com/project/_git/repo
     const m2 = input.match(
       /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.visualstudio\.com\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i
     );
     if (m2) return { org: m2[1], project: m2[2], repo: m2[3].replace(/\.git$/, '') };
     return null;
   }

   function parseGiteaUrl(
     input: string
   ): { host: string; owner: string; repo: string } | null {
     // Any https://host/owner/repo NOT matched by known providers
     const m = input.match(
       /(?:https?:\/\/)?([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
     );
     if (!m) return null;
     const host = m[1].toLowerCase();
     if (
       host.includes('github') ||
       host.includes('gitlab') ||
       host.includes('bitbucket') ||
       host === 'dev.azure.com' ||
       host.endsWith('.visualstudio.com')
     )
       return null;
     return { host: `https://${m[1]}`, owner: m[2], repo: m[3].replace(/\.git$/, '') };
   }
   ```
3. Replace the body of `parseSource` with the extended version:
   ```typescript
   export function parseSource(
     input: string,
     token?: string,
     gitlabToken?: string,
     gitlabHost?: string,
     extra?: {
       gheToken?: string;
       gheHost?: string;
       bbUsername?: string;
       bbPassword?: string;
       azurePat?: string;
       gitToken?: string;
       gitHost?: string;
     }
   ): RepoSource | null {
     if (isLocalPath(input)) {
       return { type: 'local', path: resolveLocalPath(input) };
     }
     if (isGitLabSource(input)) {
       const gl = normalizeGitLabUrl(input);
       if (gl) {
         const glToken = gitlabToken ?? token ?? process.env['GITLAB_TOKEN'];
         const resolvedHost = gitlabHost ?? gl.host;
         return { type: 'gitlab', host: resolvedHost, namespace: gl.namespace, project: gl.project, token: glToken };
       }
     }
     const bb = parseBitbucketUrl(input);
     if (bb) {
       return {
         type: 'bitbucket',
         workspace: bb.workspace,
         repo: bb.repo,
         bitbucketUsername: extra?.bbUsername ?? process.env['BITBUCKET_USERNAME'],
         bitbucketPassword: extra?.bbPassword ?? process.env['BITBUCKET_PASSWORD'],
       };
     }
     const az = parseAzureUrl(input);
     if (az) {
       return {
         type: 'azure',
         azureOrg: az.org,
         project: az.project,
         repo: az.repo,
         azurePat: extra?.azurePat ?? process.env['AZURE_DEVOPS_PAT'],
       };
     }
     const ghe = parseGitHubEnterpriseUrl(input);
     if (ghe) {
       return {
         type: 'github-enterprise',
         host: extra?.gheHost ?? ghe.host,
         owner: ghe.owner,
         repo: ghe.repo,
         token: extra?.gheToken ?? process.env['GHE_TOKEN'],
       };
     }
     const gt = parseGiteaUrl(input);
     if (gt) {
       return {
         type: 'gitea',
         host: extra?.gitHost ?? gt.host,
         owner: gt.owner,
         repo: gt.repo,
         token: extra?.gitToken ?? process.env['GITEA_TOKEN'],
       };
     }
     const gh = parseGitHubUrl(input);
     if (gh) {
       return { type: 'github', owner: gh.owner, repo: gh.repo, token };
     }
     return null;
   }
   ```
4. Verify: `cd mcp && npx tsc --noEmit 2>&1 | grep parseSource` → no errors on parseSource
5. Commit: `git commit -m "feat: extend parseSource() to detect Bitbucket, Azure, Gitea, GHE URLs"`

---

## Task 4: Extend analyzeSource() routing for the 4 new source types

**Files:** `mcp/src/analyzer.ts` (modify)

**Steps:**
1. Find the `let sourceType` variable declaration inside `analyzeSource` (around line 112). Change its type:
   ```typescript
   // BEFORE:
   let sourceType: 'github' | 'gitlab' | 'local';
   // AFTER:
   let sourceType: 'github' | 'gitlab' | 'local' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
   ```
2. Find the `else if (source.type === 'github')` block. Add 4 new branches BEFORE the final `else` (local) block:
   ```typescript
   } else if (source.type === 'bitbucket') {
     const bb = new BitbucketSource(
       source.workspace!, source.repo!,
       source.bitbucketUsername!, source.bitbucketPassword!
     );
     sourceLabel = `${source.workspace}/${source.repo}`;
     sourceType = 'bitbucket';
     fileEntries = await bb.getFileTree();
     fetchContent = (f) => bb.getFileContent(f.path).then(c => c).catch(() => null);
     fetchChurn = async () => 0;
   } else if (source.type === 'azure') {
     const az = new AzureSource(
       source.azureOrg!, source.project!, source.repo!, source.azurePat!
     );
     sourceLabel = `${source.azureOrg}/${source.project}/${source.repo}`;
     sourceType = 'azure';
     fileEntries = await az.getFileTree();
     fetchContent = (f) => az.getFileContent(f.path).then(c => c).catch(() => null);
     fetchChurn = async () => 0;
   } else if (source.type === 'gitea') {
     const gt = new GiteaSource(
       source.host!, source.owner!, source.repo!, source.token
     );
     sourceLabel = `${source.owner}/${source.repo}`;
     sourceType = 'gitea';
     fileEntries = await gt.getFileTree();
     fetchContent = (f) => gt.getFileContent(f.path).then(c => c).catch(() => null);
     fetchChurn = async () => 0;
   } else if (source.type === 'github-enterprise') {
     const gh = new GitHubSource(
       source.owner!, source.repo!, source.token,
       `https://${source.host}/api/v3`
     );
     sourceLabel = `${source.owner}/${source.repo}`;
     sourceType = 'github-enterprise';
     fileEntries = await gh.getFileTree();
     fetchContent = (f) => gh.getFileContent(f.path);
     fetchChurn = (f) => gh.getFileCommitCount(f.path, 10);
   ```
   (These go between the `github` branch and the `else` local branch.)
3. Verify: `cd mcp && npx tsc --noEmit 2>&1 | head -30` → no type errors
4. Run existing tests: `cd mcp && npx jest --testPathPattern=analyzer --passWithNoTests` → passes
5. Commit: `git commit -m "feat: add Bitbucket, Azure, Gitea, GHE routing in analyzeSource()"`

---

## Task 5: Extend grasp_analyze MCP tool schema + pass new auth params

**Files:** `mcp/src/index.ts` (modify)

**Steps:**
1. Find the `grasp_analyze` `inputSchema` (around line 113). Replace:
   ```typescript
   // BEFORE:
   inputSchema: z.object({
     source: z.string().describe('GitHub "owner/repo", GitHub URL, or local filesystem path'),
     token: z.string().optional().describe('GitHub personal access token (optional, increases rate limit)'),
   }).strict(),

   // AFTER:
   inputSchema: z.object({
     source: z.string().describe(
       'Repo URL or path: GitHub "owner/repo", GitHub URL, GitLab URL, Bitbucket URL, Azure DevOps URL, Gitea URL, or local filesystem path'
     ),
     token: z.string().optional().describe('GitHub personal access token'),
     ghe_token: z.string().optional().describe('GitHub Enterprise Server PAT'),
     ghe_host: z.string().optional().describe('GitHub Enterprise Server hostname, e.g. github.mycompany.com (auto-detected from URL if omitted)'),
     gitlab_token: z.string().optional().describe('GitLab personal access token (glpat-...)'),
     gitlab_host: z.string().optional().describe('Self-hosted GitLab hostname, e.g. gitlab.corp.com (auto-detected from URL if omitted)'),
     bitbucket_username: z.string().optional().describe('Bitbucket username'),
     bitbucket_password: z.string().optional().describe('Bitbucket app password'),
     azure_pat: z.string().optional().describe('Azure DevOps personal access token'),
     gitea_token: z.string().optional().describe('Gitea access token'),
     gitea_host: z.string().optional().describe('Gitea base URL, e.g. https://git.mycompany.com (auto-detected from URL if omitted)'),
   }).strict(),
   ```
2. Find the handler function signature `async ({ source, token }) =>` and replace it:
   ```typescript
   async ({ source, token, ghe_token, ghe_host, gitlab_token, gitlab_host, bitbucket_username, bitbucket_password, azure_pat, gitea_token, gitea_host }) => {
   ```
3. Find `const repoSource = parseSource(source, token);` and replace it:
   ```typescript
   const repoSource = parseSource(source, token, gitlab_token, gitlab_host, {
     gheToken: ghe_token,
     gheHost: ghe_host,
     bbUsername: bitbucket_username,
     bbPassword: bitbucket_password,
     azurePat: azure_pat,
     gitToken: gitea_token,
     gitHost: gitea_host,
   });
   ```
4. Verify: `cd mcp && npx tsc --noEmit` → 0 errors
5. Build: `cd mcp && node build.mjs` → expect `Build complete: dist/index.js + ...`
6. Smoke: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | node mcp/dist/index.js 2>/dev/null` → expect JSON response
7. Commit: `git commit -m "feat: extend grasp_analyze schema with Bitbucket, Azure, Gitea, GHE auth params"`

---

## Task 6: Add parseSource tests for the 4 new URL types

**Files:** `mcp/tests/analyzer.test.ts` (modify)

**Steps:**
1. Find the existing `describe('parseSource', ...)` block. Append these tests inside it:
   ```typescript
   test('parseSource: bitbucket.org URL', () => {
     const src = parseSource('https://bitbucket.org/myworkspace/myrepo');
     expect(src?.type).toBe('bitbucket');
     expect(src?.workspace).toBe('myworkspace');
     expect(src?.repo).toBe('myrepo');
   });

   test('parseSource: bitbucket with extra auth', () => {
     const src = parseSource(
       'https://bitbucket.org/ws/repo', undefined, undefined, undefined,
       { bbUsername: 'user', bbPassword: 'pass' }
     );
     expect(src?.bitbucketUsername).toBe('user');
     expect(src?.bitbucketPassword).toBe('pass');
   });

   test('parseSource: Azure DevOps dev.azure.com URL', () => {
     const src = parseSource('https://dev.azure.com/myorg/myproject/_git/myrepo');
     expect(src?.type).toBe('azure');
     expect(src?.azureOrg).toBe('myorg');
     expect(src?.project).toBe('myproject');
     expect(src?.repo).toBe('myrepo');
   });

   test('parseSource: Azure DevOps visualstudio.com URL', () => {
     const src = parseSource('https://myorg.visualstudio.com/myproject/_git/myrepo');
     expect(src?.type).toBe('azure');
     expect(src?.azureOrg).toBe('myorg');
   });

   test('parseSource: GitHub Enterprise URL', () => {
     const src = parseSource('https://github.mycompany.com/owner/repo');
     expect(src?.type).toBe('github-enterprise');
     expect(src?.host).toBe('github.mycompany.com');
     expect(src?.owner).toBe('owner');
     expect(src?.repo).toBe('repo');
   });

   test('parseSource: github.com still routes to github not github-enterprise', () => {
     const src = parseSource('https://github.com/facebook/react');
     expect(src?.type).toBe('github');
   });

   test('parseSource: Gitea URL', () => {
     const src = parseSource('https://git.example.com/owner/repo');
     expect(src?.type).toBe('gitea');
     expect(src?.host).toBe('https://git.example.com');
     expect(src?.owner).toBe('owner');
     expect(src?.repo).toBe('repo');
   });

   test('parseSource: gitea_host override via extra', () => {
     const src = parseSource(
       'https://git.example.com/owner/repo', undefined, undefined, undefined,
       { gitHost: 'https://git.override.com' }
     );
     expect(src?.host).toBe('https://git.override.com');
   });
   ```
2. Run: `cd mcp && npx jest --testPathPattern=analyzer` → all tests pass
3. Commit: `git commit -m "test: parseSource tests for Bitbucket, Azure, GHE, Gitea URL detection"`

---

## Task 7: Add detectProvider() + new auth state hooks in index.html

**Files:** `index.html` (modify)

**Steps:**
1. Find `function isGitLabUrl(input){` and add `detectProvider` immediately before it:
   ```javascript
   function detectProvider(url){
       if(!url)return 'github';
       var u=(url||'').trim().toLowerCase();
       // Most specific first
       if(/github\.com/.test(u))return 'github';
       if(/gitlab\./.test(u))return 'gitlab';
       if(/bitbucket\.org/.test(u))return 'bitbucket';
       if(/dev\.azure\.com/.test(u)||/\.visualstudio\.com/.test(u))return 'azure';
       // GHE: github.* that isn't github.com or github.io
       if(/github\.[a-z]/.test(u)&&!/github\.com/.test(u)&&!/github\.io/.test(u))return 'github-enterprise';
       // Any remaining full URL (has protocol or hostname with a dot before /owner/repo)
       if(/^(?:https?:\/\/)?[a-z0-9_-]+\.[a-z]{2,}\/[^/]+\/[^/]+/.test(u))return 'gitea';
       // Bare owner/repo → GitHub
       return 'github';
   }
   ```
2. Find the `useEffect` block that persists `gitlabToken`/`gitlabHost` (around line 5478). Add a new `useEffect` immediately after it:
   ```javascript
   useEffect(function(){
       try{
           if(gheToken){localStorage.setItem('grasp_ghe_token',gheToken);}
           else{localStorage.removeItem('grasp_ghe_token');}
           if(gheHost){localStorage.setItem('grasp_ghe_host',gheHost);}
           else{localStorage.removeItem('grasp_ghe_host');}
           if(bbUsername){localStorage.setItem('grasp_bitbucket_username',bbUsername);}
           else{localStorage.removeItem('grasp_bitbucket_username');}
           if(bbPassword){localStorage.setItem('grasp_bitbucket_password',bbPassword);}
           else{localStorage.removeItem('grasp_bitbucket_password');}
           if(azurePat){localStorage.setItem('grasp_azure_token',azurePat);}
           else{localStorage.removeItem('grasp_azure_token');}
           if(giteaToken){localStorage.setItem('grasp_gitea_token',giteaToken);}
           else{localStorage.removeItem('grasp_gitea_token');}
           if(giteaHost){localStorage.setItem('grasp_gitea_host',giteaHost);}
           else{localStorage.removeItem('grasp_gitea_host');}
       }catch(e){}
   },[gheToken,gheHost,bbUsername,bbPassword,azurePat,giteaToken,giteaHost]);
   ```
3. Find the existing auth state hooks (the `_gl`, `_gh` lines around 5228–5229). Add after them:
   ```javascript
   var _ghe=useState(function(){try{return localStorage.getItem('grasp_ghe_token')||'';}catch(e){return '';}}),gheToken=_ghe[0],setGheToken=_ghe[1];
   var _gheH=useState(function(){try{return localStorage.getItem('grasp_ghe_host')||'';}catch(e){return '';}}),gheHost=_gheH[0],setGheHost=_gheH[1];
   var _bbU=useState(function(){try{return localStorage.getItem('grasp_bitbucket_username')||'';}catch(e){return '';}}),bbUsername=_bbU[0],setBbUsername=_bbU[1];
   var _bbP=useState(function(){try{return localStorage.getItem('grasp_bitbucket_password')||'';}catch(e){return '';}}),bbPassword=_bbP[0],setBbPassword=_bbP[1];
   var _azP=useState(function(){try{return localStorage.getItem('grasp_azure_token')||'';}catch(e){return '';}}),azurePat=_azP[0],setAzurePat=_azP[1];
   var _gtT=useState(function(){try{return localStorage.getItem('grasp_gitea_token')||'';}catch(e){return '';}}),giteaToken=_gtT[0],setGiteaToken=_gtT[1];
   var _gtH=useState(function(){try{return localStorage.getItem('grasp_gitea_host')||'';}catch(e){return '';}}),giteaHost=_gtH[0],setGiteaHost=_gtH[1];
   ```
4. Find `var isGitLab=isGitLabUrl(repoUrl);` (around line 8444). Replace it:
   ```javascript
   var provider=detectProvider(repoUrl);
   var isGitLab=provider==='gitlab';
   ```
5. Find `var hasSavedAuth=(authMethod==='pat'&&!!token)||(authMethod==='github_app'&&!!appId);`. Replace:
   ```javascript
   var hasSavedAuth=(authMethod==='pat'&&!!token)||(authMethod==='github_app'&&!!appId)||!!gheToken||!!bbUsername||!!azurePat||!!giteaToken||!!gitlabToken;
   ```
6. Verify: open `index.html` in browser, open DevTools console → no JS errors on load
7. Commit: `git commit -m "feat: add detectProvider() and new auth state hooks for 6 providers"`

---

## Task 8: Update auth UI, parseUrl(), and analyze() routing messages

**Files:** `index.html` (modify)

**Steps:**
1. Find the topbar auth UI block (around line 8497). Replace the entire `!isGitLab&&...` + `isGitLab&&...` block with:
   ```javascript
   provider==='github'&&React.createElement('select',{className:'auth-select'+(hasSavedAuth?' saved':''),'aria-label':'Authentication Method',value:authMethod,onChange:function(e){setAuthMethod(e.target.value);}},
       React.createElement('option',{value:'none'},'No Auth'),
       React.createElement('option',{value:'pat'},'Token'),
       React.createElement('option',{value:'github_app'},'GitHub App')
   ),
   provider==='github'&&authMethod==='pat'&&React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'GitHub Token',placeholder:'ghp_…',value:token,onChange:function(e){setToken(e.target.value);},onKeyDown:function(e){if(e.key==='Enter'&&!loading)analyze();}}),
   provider==='github'&&authMethod==='github_app'&&React.createElement(React.Fragment,null,
       React.createElement('input',{className:'repo-input',type:'text','aria-label':'App ID',placeholder:'App ID',value:appId,onChange:function(e){setAppId(e.target.value);},style:{width:72}}),
       React.createElement('button',{className:'private-key-btn'+(privateKey?' has-key':''),'aria-label':'Set Private Key',onClick:function(){setShowKeyModal(true);},type:'button'},privateKey?'Key Set':'Key')
   ),
   provider==='gitlab'&&React.createElement(React.Fragment,null,
       React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'GitLab Token',placeholder:'glpat-…',value:gitlabToken,onChange:function(e){setGitlabToken(e.target.value);},title:'GitLab PAT — required for private repos'}),
       React.createElement('input',{className:'repo-input',type:'text','aria-label':'GitLab Host',placeholder:'Self-hosted host (optional)',value:gitlabHost,onChange:function(e){setGitlabHost(e.target.value);},style:{width:150}})
   ),
   provider==='github-enterprise'&&React.createElement(React.Fragment,null,
       React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'GHE Token',placeholder:'ghp_… (GHE PAT)',value:gheToken,onChange:function(e){setGheToken(e.target.value);}}),
       React.createElement('input',{className:'repo-input',type:'text','aria-label':'GHE Host',placeholder:'github.corp.com',value:gheHost,onChange:function(e){setGheHost(e.target.value);},style:{width:150}})
   ),
   provider==='bitbucket'&&React.createElement(React.Fragment,null,
       React.createElement('input',{className:'repo-input',type:'text','aria-label':'Bitbucket Username',placeholder:'Username',value:bbUsername,onChange:function(e){setBbUsername(e.target.value);},style:{width:100}}),
       React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'Bitbucket App Password',placeholder:'App password',value:bbPassword,onChange:function(e){setBbPassword(e.target.value);}})
   ),
   provider==='azure'&&React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'Azure DevOps PAT',placeholder:'Azure DevOps PAT',value:azurePat,onChange:function(e){setAzurePat(e.target.value);}}),
   provider==='gitea'&&React.createElement(React.Fragment,null,
       React.createElement('input',{className:'repo-input topbar-token',type:'password','aria-label':'Gitea Token',placeholder:'Gitea token',value:giteaToken,onChange:function(e){setGiteaToken(e.target.value);}}),
       React.createElement('input',{className:'repo-input',type:'text','aria-label':'Gitea Host',placeholder:'https://git.corp.com',value:giteaHost,onChange:function(e){setGiteaHost(e.target.value);},style:{width:150}})
   ),
   ```
2. Find `parseUrl` function. After the GitLab detection block and before the `owner/repo` fallback, add:
   ```javascript
   // Bitbucket
   var bbm=url.match(/(?:https?:\/\/)?bitbucket\.org\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
   if(bbm)return{type:'bitbucket',workspace:bbm[1],repo:bbm[2].replace(/\.git$/,'')};
   // Azure DevOps (dev.azure.com)
   var azm=url.match(/(?:https?:\/\/)?dev\.azure\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i);
   if(azm)return{type:'azure',org:azm[1],project:azm[2],repo:azm[3].replace(/\.git$/,'')};
   // Azure DevOps (visualstudio.com)
   var azm2=url.match(/(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.visualstudio\.com\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i);
   if(azm2)return{type:'azure',org:azm2[1],project:azm2[2],repo:azm2[3].replace(/\.git$/,'')};
   // GitHub Enterprise (github.* != github.com, github.io)
   var ghem=url.match(/(?:https?:\/\/)?([a-zA-Z0-9_.-]*github[a-zA-Z0-9_.-]*\.[a-zA-Z]{2,})\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
   if(ghem&&ghem[1].toLowerCase()!=='github.com'&&!ghem[1].toLowerCase().endsWith('github.io')){
       return{type:'github-enterprise',host:ghem[1],owner:ghem[2],repo:ghem[3].replace(/\.git$/,'')};
   }
   // Gitea (any remaining full URL with a hostname)
   var gteam=url.match(/(?:https?:\/\/)?([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
   if(gteam)return{type:'gitea',host:gteam[1],owner:gteam[2],repo:gteam[3].replace(/\.git$/,'')};
   ```
3. Find the error message for GitLab in `analyze()` (around line 5771) and replace/extend:
   ```javascript
   if(p.type==='gitlab'){
       setError('GitLab analysis requires the Grasp MCP server. Run: npx grasp-mcp-server, then: grasp_analyze source="'+repoUrl+'" gitlab_token="glpat-..."');
       return;
   }
   if(p.type==='github-enterprise'){
       setError('GitHub Enterprise: use the Grasp MCP tool → grasp_analyze source="'+repoUrl+'" ghe_token="<PAT>" ghe_host="'+(p.host||'github.corp.com')+'"');
       return;
   }
   if(p.type==='bitbucket'){
       setError('Bitbucket: use the Grasp MCP tool → grasp_analyze source="'+repoUrl+'" bitbucket_username="<user>" bitbucket_password="<app-password>"');
       return;
   }
   if(p.type==='azure'){
       setError('Azure DevOps: use the Grasp MCP tool → grasp_analyze source="'+repoUrl+'" azure_pat="<PAT>"');
       return;
   }
   if(p.type==='gitea'){
       setError('Gitea: use the Grasp MCP tool → grasp_analyze source="'+repoUrl+'" gitea_token="<token>" gitea_host="'+(p.host||'https://git.corp.com')+'"');
       return;
   }
   ```
4. Update the URL input placeholder from `'owner/repo, GitHub URL, or GitLab URL'` to `'owner/repo or any Git host URL'`
5. Verify in browser: paste `https://bitbucket.org/atlassian/python-bitbucket` → Username + App Password fields appear. Paste `dev.azure.com/myorg/myproject/_git/myrepo` → Azure PAT field. Paste `github.corp.com/owner/repo` → GHE fields. Paste `facebook/react` → GitHub fields unchanged.
6. Commit: `git commit -m "feat: per-provider auth UI, parseUrl() for all 6 providers, helpful MCP command in error messages"`

---

## Task 9: Rebuild MCP, bump to v3.9.5, tag

**Files:** `mcp/` (rebuild), version files (34 files per CLAUDE.md checklist)

**Steps:**
1. Build: `cd mcp && node build.mjs` → `Build complete`
2. Full test suite: `cd mcp && npx jest` → all pass
3. Bump version to `3.9.5` across all 34 files listed in CLAUDE.md. Use the Python JSON patch approach for package.json/lock files (never global sed on lock files). Key files:
   - `mcp/package.json`, `mcp/package-lock.json`, `mcp/server.json` (×2)
   - `browser-extension/package.json` + manifests + lock
   - `vscode-extension/package.json` + lock
   - `jetbrains-plugin/build.gradle.kts` (×2 + changeNotes: add "v3.9.5: Multi-provider auth — Bitbucket, Azure DevOps, Gitea, GitHub Enterprise now fully wired in MCP analyzer and UI; per-provider auth fields and helpful MCP command strings in error messages")
   - `eclipse-plugin/pom.xml`, `jenkins-plugin/pom.xml`
   - All other `package.json` in: `amazon-q-plugin`, `copilot-extension`, `continue-provider`, `discord-bot`, `github-action`, `gitlab-app`, `gitlab-ci-component`, `gpt-actions`, `jira-integration`, `linear-integration`, `raycast-grasp`, `teams-bot`
   - `gpt-actions/src/server.ts`
   - `index.html` (×2 occurrences: `window.GRASP_VERSION = 'X.Y.Z'` and `window.GRASP_VERSION || 'X.Y.Z'`)
   - `team-dashboard.html`, `docs/index.html` (×2), `docker/Dockerfile`, `docker/README.md`, `README.md`
4. Add CHANGELOG entry at top:
   ```markdown
   ## v3.9.5 — Multi-Provider Auth

   ### New Features
   - Bitbucket Cloud: `bitbucket_username` + `bitbucket_password` — wired into `grasp_analyze` and URL detection
   - Azure DevOps: `azure_pat` — supports `dev.azure.com` and `org.visualstudio.com` URL formats
   - Gitea (self-hosted): `gitea_token` + `gitea_host` — auto-detected from any URL not matching known providers
   - GitHub Enterprise Server: `ghe_token` + `ghe_host` — detected from `github.*` hostnames that aren't `github.com`
   - Browser UI shows correct per-provider auth fields when URL is typed
   - Non-GitHub repos show exact MCP command string in error (e.g. `grasp_analyze source="..." azure_pat="..."`)
   - `BITBUCKET_USERNAME`, `BITBUCKET_PASSWORD`, `AZURE_DEVOPS_PAT`, `GHE_TOKEN`, `GITEA_TOKEN` env var fallbacks
   ```
5. Update `CLAUDE.md` current version to `v3.9.5`
6. Commit all version changes: `git commit -m "chore: bump to v3.9.5"`
7. Push branch: `git push origin feature/multi-provider-auth`
8. Tag and push: `git tag v3.9.5 && git push origin v3.9.5`
9. Merge to main: from the parent repo directory (not worktree): `cd /Users/chak/Documents/Code/Claudecode/grasp && git fetch --no-tags origin main && git merge origin/feature/multi-provider-auth --no-edit && git push origin main`
