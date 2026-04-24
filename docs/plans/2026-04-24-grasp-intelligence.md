# Grasp Intelligence Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five interlocking capabilities — Brain (persistent index), Setup (agent hooks), Diff (architectural blast radius), Daemon (live re-indexing), Ask (health-aware Q&A) — that make Grasp the first architecture-aware AI context layer, uniquely differentiated from GitNexus by health grades, complexity scores, and debt data woven into every feature.

**Architecture:** `BrainStore` extends the existing `~/.grasp/sessions.db` pattern with a second SQLite file (`brain.db`) containing structured, queryable tables for repos, files, functions, and edges. `SetupManager` writes Claude Code / Cursor hooks that inject health context before every file edit. `askArchitecture()` does keyword + structural SQL search over Brain tables with health-ranked results — no embeddings needed.

**Tech Stack:** TypeScript, better-sqlite3 (already a dep), Node.js `fs.watch` (stdlib, no new dep for daemon), zod (already a dep for MCP tools), React (already used in index.html single-file app).

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `mcp/src/brain.ts` | **Create** | BrainStore — structured SQLite index |
| `mcp/src/setup.ts` | **Create** | SetupManager — editor detection + hook/context generation |
| `mcp/src/arch-diff.ts` | **Create** | computeArchDiff — branch-aware health delta |
| `mcp/src/watcher.ts` | **Create** | WatchDaemon — file-system watcher + brain updater |
| `mcp/src/ask.ts` | **Create** | askArchitecture — keyword search + health-aware Q&A |
| `mcp/src/index.ts` | **Modify** | Add 5 new MCP tools: grasp_brain_index, grasp_brain_status, grasp_context, grasp_arch_diff, grasp_ask |
| `mcp/src/cli.ts` | **Modify** | Add subcommands: index, setup, diff, daemon, context |
| `mcp/tests/brain.test.ts` | **Create** | BrainStore tests |
| `mcp/tests/setup.test.ts` | **Create** | SetupManager tests |
| `mcp/tests/arch-diff.test.ts` | **Create** | computeArchDiff tests |
| `mcp/tests/ask.test.ts` | **Create** | askArchitecture tests |
| `index.html` | **Modify** | Add browser chat panel (Ask Grasp) |

---

## Phase 1: Grasp Brain

### Task 1: BrainStore — schema + CRUD

**Files:**
- Create: `mcp/src/brain.ts`
- Create: `mcp/tests/brain.test.ts`

- [ ] **Step 1: Write failing tests for BrainStore construction and repo CRUD**

```typescript
// mcp/tests/brain.test.ts
import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-brain-test-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('creates brain.db in the given directory', () => {
  expect(fs.existsSync(path.join(tmpDir, 'brain.db'))).toBe(true);
});

test('upsertRepo stores a repo and getRepo retrieves it', () => {
  brain.upsertRepo({
    source: 'owner/repo',
    sourceType: 'github',
    healthScore: 72,
    healthGrade: 'C',
    fileCount: 50,
    functionCount: 300,
    issueCount: 5,
    securityIssueCount: 1,
    circularDepCount: 2,
    sessionId: 'abc123',
  });
  const r = brain.getRepo('owner/repo');
  expect(r).not.toBeNull();
  expect(r!.healthScore).toBe(72);
  expect(r!.healthGrade).toBe('C');
});

test('listRepos returns all upserted repos', () => {
  brain.upsertRepo({ source: 'a/b', sourceType: 'github', healthScore: 80, healthGrade: 'B', fileCount: 10, functionCount: 50, issueCount: 0, securityIssueCount: 0, circularDepCount: 0, sessionId: 's1' });
  brain.upsertRepo({ source: 'c/d', sourceType: 'github', healthScore: 60, healthGrade: 'D', fileCount: 20, functionCount: 100, issueCount: 3, securityIssueCount: 0, circularDepCount: 1, sessionId: 's2' });
  expect(brain.listRepos()).toHaveLength(2);
});

test('deleteRepo removes the repo', () => {
  brain.upsertRepo({ source: 'del/me', sourceType: 'local', healthScore: 50, healthGrade: 'D', fileCount: 5, functionCount: 20, issueCount: 1, securityIssueCount: 0, circularDepCount: 0, sessionId: 's3' });
  brain.deleteRepo('del/me');
  expect(brain.getRepo('del/me')).toBeNull();
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mcp && npm test -- --testPathPattern="brain" 2>&1 | tail -10
```
Expected: `Cannot find module '../src/brain.js'`

- [ ] **Step 3: Create `mcp/src/brain.ts` with schema + CRUD**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';

const DEFAULT_DB_DIR = path.join(os.homedir(), '.grasp');

export interface RepoRecord {
  source: string;
  sourceType: string;
  healthScore: number;
  healthGrade: string;
  fileCount: number;
  functionCount: number;
  issueCount: number;
  securityIssueCount: number;
  circularDepCount: number;
  sessionId: string;
  indexedAt?: number;
}

export interface FileRecord {
  repoId: string;
  path: string;
  layer: string;
  lines: number;
  complexity: number;
  couplingIn: number;
  couplingOut: number;
  churn: number;
  healthGrade: string;
}

export interface FnRecord {
  repoId: string;
  filePath: string;
  name: string;
  line: number;
  type: string;
}

function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export class BrainStore {
  private db: Database.Database;

  constructor(dbDir?: string) {
    const dir = dbDir ?? DEFAULT_DB_DIR;
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, 'brain.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL UNIQUE,
        source_type TEXT,
        indexed_at INTEGER DEFAULT (unixepoch()),
        health_score INTEGER,
        health_grade TEXT,
        file_count INTEGER,
        function_count INTEGER,
        issue_count INTEGER,
        security_issue_count INTEGER,
        circular_dep_count INTEGER,
        session_id TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        repo_id TEXT,
        path TEXT,
        layer TEXT,
        lines INTEGER,
        complexity REAL,
        coupling_in INTEGER,
        coupling_out INTEGER,
        churn INTEGER,
        health_grade TEXT,
        PRIMARY KEY (repo_id, path)
      );
      CREATE TABLE IF NOT EXISTS functions (
        repo_id TEXT,
        file_path TEXT,
        name TEXT,
        line INTEGER,
        type TEXT,
        PRIMARY KEY (repo_id, file_path, name)
      );
      CREATE TABLE IF NOT EXISTS edges (
        repo_id TEXT,
        from_path TEXT,
        to_path TEXT,
        fn_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(repo_id, to_path);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(repo_id, from_path);
      CREATE INDEX IF NOT EXISTS idx_files_layer ON files(repo_id, layer);
      CREATE INDEX IF NOT EXISTS idx_files_grade ON files(repo_id, health_grade);
      CREATE INDEX IF NOT EXISTS idx_fns_name ON functions(repo_id, name);
    `);
  }

  upsertRepo(rec: RepoRecord): string {
    const id = repoId(rec.source);
    this.db.prepare(`
      INSERT OR REPLACE INTO repos
        (id, source, source_type, indexed_at, health_score, health_grade, file_count, function_count, issue_count, security_issue_count, circular_dep_count, session_id)
      VALUES (?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, rec.source, rec.sourceType, rec.healthScore, rec.healthGrade, rec.fileCount, rec.functionCount, rec.issueCount, rec.securityIssueCount, rec.circularDepCount, rec.sessionId);
    return id;
  }

  getRepo(source: string): (RepoRecord & { id: string; indexedAt: number }) | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE source = ?').get(source) as any;
    if (!row) return null;
    return {
      id: row.id, source: row.source, sourceType: row.source_type,
      healthScore: row.health_score, healthGrade: row.health_grade,
      fileCount: row.file_count, functionCount: row.function_count,
      issueCount: row.issue_count, securityIssueCount: row.security_issue_count,
      circularDepCount: row.circular_dep_count, sessionId: row.session_id,
      indexedAt: row.indexed_at,
    };
  }

  listRepos(): Array<RepoRecord & { id: string; indexedAt: number }> {
    return (this.db.prepare('SELECT * FROM repos ORDER BY indexed_at DESC').all() as any[]).map(row => ({
      id: row.id, source: row.source, sourceType: row.source_type,
      healthScore: row.health_score, healthGrade: row.health_grade,
      fileCount: row.file_count, functionCount: row.function_count,
      issueCount: row.issue_count, securityIssueCount: row.security_issue_count,
      circularDepCount: row.circular_dep_count, sessionId: row.session_id,
      indexedAt: row.indexed_at,
    }));
  }

  deleteRepo(source: string): void {
    const id = repoId(source);
    this.db.prepare('DELETE FROM edges WHERE repo_id = ?').run(id);
    this.db.prepare('DELETE FROM functions WHERE repo_id = ?').run(id);
    this.db.prepare('DELETE FROM files WHERE repo_id = ?').run(id);
    this.db.prepare('DELETE FROM repos WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd mcp && npm test -- --testPathPattern="brain" 2>&1 | tail -10
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add mcp/src/brain.ts mcp/tests/brain.test.ts
git commit -m "feat: add BrainStore structured SQLite index"
```

---

### Task 2: BrainStore — index from AnalysisResult

**Files:**
- Modify: `mcp/src/brain.ts` (add `indexResult`, `queryFiles`, `queryFunctions`, `getFileContext`)
- Modify: `mcp/tests/brain.test.ts` (add indexing tests)

- [ ] **Step 1: Add indexing tests**

```typescript
// append to mcp/tests/brain.test.ts
import type { AnalysisResult } from '../src/types.js';

function makeResult(source: string): AnalysisResult {
  return {
    sessionId: 'sess1',
    source,
    sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/auth.ts', name: 'auth.ts', folder: 'src', content: null, functions: [{ name: 'login', file: 'src/auth.ts', line: 5 }], lines: 100, layer: 'services', churn: 3, isCode: true, complexity: 15, nestingDepth: 3 },
      { path: 'src/utils.ts', name: 'utils.ts', folder: 'src', content: null, functions: [], lines: 50, layer: 'utils', churn: 1, isCode: true, complexity: 4, nestingDepth: 1 },
    ],
    connections: [
      { source: 'src/auth.ts', target: 'src/utils.ts', fn: 'formatDate', count: 2 },
    ],
    issues: [], patterns: [], security: [
      { type: 'hardcoded-secret', severity: 'high', file: 'src/auth.ts', line: 10, desc: 'Hardcoded token', match: 'secret=' },
    ], duplicates: [], layerViolations: [], folders: ['src'], layers: ['services', 'utils'],
    summary: { fileCount: 2, codeFileCount: 2, functionCount: 1, connectionCount: 1, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 1, healthScore: 68, healthGrade: 'C', layers: ['services', 'utils'], topFolders: [], languages: [] },
  };
}

test('indexResult populates files table', () => {
  const result = makeResult('/tmp/repo');
  brain.indexResult(result);
  const files = brain.queryFiles('/tmp/repo', {});
  expect(files).toHaveLength(2);
});

test('indexResult populates functions table', () => {
  const result = makeResult('/tmp/repo');
  brain.indexResult(result);
  const fns = brain.queryFunctions('/tmp/repo', 'login');
  expect(fns).toHaveLength(1);
  expect(fns[0].name).toBe('login');
});

test('getFileContext returns health data + dependents + security', () => {
  const result = makeResult('/tmp/repo');
  brain.indexResult(result);
  const ctx = brain.getFileContext('/tmp/repo', 'src/auth.ts');
  expect(ctx).not.toBeNull();
  expect(ctx!.layer).toBe('services');
  expect(ctx!.couplingOut).toBe(1);
  expect(ctx!.security).toHaveLength(1);
  expect(ctx!.dependents).toContain('src/utils.ts');
});

test('queryFiles filters by layer', () => {
  brain.indexResult(makeResult('/tmp/repo'));
  const services = brain.queryFiles('/tmp/repo', { layer: 'services' });
  expect(services).toHaveLength(1);
  expect(services[0].path).toBe('src/auth.ts');
});
```

- [ ] **Step 2: Run tests — expect failure on new tests**

```bash
cd mcp && npm test -- --testPathPattern="brain" 2>&1 | tail -10
```
Expected: `TypeError: brain.indexResult is not a function`

- [ ] **Step 3: Add indexResult, queryFiles, queryFunctions, getFileContext to `mcp/src/brain.ts`**

Add after the `close()` method, before the closing `}`:

```typescript
  indexResult(result: import('./types.js').AnalysisResult): void {
    const id = this.upsertRepo({
      source: result.source,
      sourceType: result.sourceType,
      healthScore: result.summary.healthScore,
      healthGrade: result.summary.healthGrade,
      fileCount: result.summary.fileCount,
      functionCount: result.summary.functionCount,
      issueCount: result.summary.issueCount,
      securityIssueCount: result.summary.securityIssueCount,
      circularDepCount: result.summary.circularDepCount,
      sessionId: result.sessionId,
    });

    // Build coupling maps
    const couplingIn = new Map<string, number>();
    const couplingOut = new Map<string, number>();
    for (const conn of result.connections) {
      couplingIn.set(conn.target, (couplingIn.get(conn.target) ?? 0) + 1);
      couplingOut.set(conn.source, (couplingOut.get(conn.source) ?? 0) + 1);
    }

    // Grade per file (proxy: use overall grade scaled by complexity)
    const gradeForComplexity = (c: number): string => {
      if (c >= 30) return 'F';
      if (c >= 20) return 'D';
      if (c >= 10) return 'C';
      if (c >= 5) return 'B';
      return 'A';
    };

    const upsertFile = this.db.prepare(`
      INSERT OR REPLACE INTO files (repo_id, path, layer, lines, complexity, coupling_in, coupling_out, churn, health_grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertFn = this.db.prepare(`
      INSERT OR REPLACE INTO functions (repo_id, file_path, name, line, type)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertFiles = this.db.transaction(() => {
      this.db.prepare('DELETE FROM files WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM functions WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM edges WHERE repo_id = ?').run(id);
      for (const f of result.files) {
        const complexity = f.complexity ?? 1;
        upsertFile.run(id, f.path, f.layer, f.lines, complexity, couplingIn.get(f.path) ?? 0, couplingOut.get(f.path) ?? 0, f.churn, gradeForComplexity(complexity));
        for (const fn of f.functions) {
          upsertFn.run(id, f.path, fn.name, fn.line, fn.type ?? 'function');
        }
      }
    });
    insertFiles();

    const insertEdge = this.db.prepare('INSERT INTO edges (repo_id, from_path, to_path, fn_name) VALUES (?, ?, ?, ?)');
    const insertEdges = this.db.transaction(() => {
      for (const conn of result.connections) {
        insertEdge.run(id, conn.source, conn.target, conn.fn);
      }
    });
    insertEdges();

    // Store security issues in a JSON column on files
    this.db.exec(`ALTER TABLE files ADD COLUMN security_json TEXT`).valueOf();
  }

  queryFiles(source: string, opts: { layer?: string; minComplexity?: number; limit?: number }): FileRecord[] {
    const id = repoId(source);
    let sql = 'SELECT * FROM files WHERE repo_id = ?';
    const params: unknown[] = [id];
    if (opts.layer) { sql += ' AND layer = ?'; params.push(opts.layer); }
    if (opts.minComplexity !== undefined) { sql += ' AND complexity >= ?'; params.push(opts.minComplexity); }
    sql += ' ORDER BY complexity DESC LIMIT ?';
    params.push(opts.limit ?? 100);
    return (this.db.prepare(sql).all(...params) as any[]).map(row => ({
      repoId: row.repo_id, path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
    }));
  }

  queryFunctions(source: string, namePattern: string): FnRecord[] {
    const id = repoId(source);
    return (this.db.prepare('SELECT * FROM functions WHERE repo_id = ? AND name LIKE ? LIMIT 50').all(id, `%${namePattern}%`) as any[]).map(row => ({
      repoId: row.repo_id, filePath: row.file_path, name: row.name, line: row.line, type: row.type,
    }));
  }

  getFileContext(source: string, filePath: string): {
    path: string; layer: string; lines: number; complexity: number;
    couplingIn: number; couplingOut: number; churn: number; healthGrade: string;
    dependents: string[]; dependencies: string[]; security: Array<{ severity: string; desc: string }>;
  } | null {
    const id = repoId(source);
    const row = this.db.prepare('SELECT * FROM files WHERE repo_id = ? AND path = ?').get(id, filePath) as any;
    if (!row) return null;
    const dependents = (this.db.prepare('SELECT DISTINCT from_path FROM edges WHERE repo_id = ? AND to_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.from_path);
    const dependencies = (this.db.prepare('SELECT DISTINCT to_path FROM edges WHERE repo_id = ? AND from_path = ? LIMIT 20').all(id, filePath) as any[]).map(r => r.to_path);
    const security = row.security_json ? JSON.parse(row.security_json) : [];
    return {
      path: row.path, layer: row.layer, lines: row.lines,
      complexity: row.complexity, couplingIn: row.coupling_in, couplingOut: row.coupling_out,
      churn: row.churn, healthGrade: row.health_grade,
      dependents, dependencies, security,
    };
  }
```

> **Note:** The `ALTER TABLE ... ADD COLUMN` in `indexResult` will error on the second call (column already exists). Move it to the constructor's `CREATE TABLE` instead. Replace the `ALTER TABLE` line in `indexResult` with nothing, and add `security_json TEXT` to the `CREATE TABLE IF NOT EXISTS files` block in the constructor.

Fix the constructor's files table definition to:

```sql
CREATE TABLE IF NOT EXISTS files (
  repo_id TEXT,
  path TEXT,
  layer TEXT,
  lines INTEGER,
  complexity REAL,
  coupling_in INTEGER,
  coupling_out INTEGER,
  churn INTEGER,
  health_grade TEXT,
  security_json TEXT,
  PRIMARY KEY (repo_id, path)
);
```

And remove the `ALTER TABLE` line from `indexResult`.

Also update `indexResult`'s file loop to capture security:

```typescript
// After the insertFiles() call, add security storage
const secByFile = new Map<string, Array<{severity: string; desc: string}>>();
for (const sec of result.security) {
  if (!secByFile.has(sec.file)) secByFile.set(sec.file, []);
  secByFile.get(sec.file)!.push({ severity: sec.severity, desc: sec.desc });
}
if (secByFile.size > 0) {
  const updateSec = this.db.prepare('UPDATE files SET security_json = ? WHERE repo_id = ? AND path = ?');
  const updateAll = this.db.transaction(() => {
    for (const [fp, secs] of secByFile) updateSec.run(JSON.stringify(secs), id, fp);
  });
  updateAll();
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd mcp && npm test -- --testPathPattern="brain" 2>&1 | tail -10
```
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add mcp/src/brain.ts mcp/tests/brain.test.ts
git commit -m "feat: BrainStore indexResult + queryFiles + getFileContext"
```

---

### Task 3: grasp_brain_index + grasp_brain_status MCP tools

**Files:**
- Modify: `mcp/src/index.ts` (add two tools near the top, after sessionStore init)

- [ ] **Step 1: Add BrainStore import to `mcp/src/index.ts`**

Find line 68 (`const sessionStore = new SessionStore();`) and add above it:

```typescript
import { BrainStore } from './brain.js';
const brainStore = new BrainStore();
```

- [ ] **Step 2: Add `grasp_brain_index` tool after `grasp_analyze` (after line ~238)**

```typescript
// =====================================================================
// TOOL: grasp_brain_index
// =====================================================================
server.registerTool(
  'grasp_brain_index',
  {
    title: 'Index Repo into Grasp Brain',
    description: `Analyze a repository and persist the results into Grasp Brain — a structured local index at ~/.grasp/brain.db. Unlike grasp_analyze (session-only), Brain persists across restarts and enables grasp_context and grasp_ask without re-analyzing.

Parameters:
  source — same as grasp_analyze: "owner/repo", local path, GitLab URL, etc.
  token, gitlab_token — optional auth tokens

Returns: repo summary + index stats.`,
    inputSchema: z.object({
      source: z.string().describe('Repo URL, "owner/repo", or local path'),
      token: z.string().optional(),
      gitlab_token: z.string().optional(),
      gitlab_host: z.string().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ source, token, gitlab_token, gitlab_host }) => {
    const repoSource = parseSource(source, token, gitlab_token, gitlab_host);
    if (!repoSource) return { content: [{ type: 'text', text: `Cannot parse source "${source}"` }] };
    try {
      const result = await analyzeSource(repoSource, (msg) => { process.stderr.write(`[grasp-brain] ${msg}\n`); });
      await sessionStore.set(result.sessionId, result);
      brainStore.indexResult(result);
      const output = {
        indexed: true, source: result.source, session_id: result.sessionId,
        health_score: result.summary.healthScore, health_grade: result.summary.healthGrade,
        files_indexed: result.summary.fileCount, functions_indexed: result.summary.functionCount,
        message: `Brain updated. Use grasp_context or grasp_ask to query.`,
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error indexing "${source}": ${msg}` }] };
    }
  }
);

// =====================================================================
// TOOL: grasp_brain_status
// =====================================================================
server.registerTool(
  'grasp_brain_status',
  {
    title: 'Grasp Brain Index Status',
    description: 'List all repos currently indexed in Grasp Brain, with health grades and index timestamps.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const repos = brainStore.listRepos();
    if (repos.length === 0) {
      return { content: [{ type: 'text', text: 'Brain is empty. Run grasp_brain_index to index a repo.' }] };
    }
    const output = repos.map(r => ({
      source: r.source, source_type: r.sourceType,
      health_score: r.healthScore, health_grade: r.healthGrade,
      files: r.fileCount, functions: r.functionCount,
      issues: r.issueCount, security: r.securityIssueCount,
      indexed_at: new Date(r.indexedAt * 1000).toISOString(),
    }));
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: { repos: output } };
  }
);
```

- [ ] **Step 3: Typecheck**

```bash
cd mcp && ./node_modules/.bin/tsc --noEmit -p tsconfig.check.json 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 4: Build and smoke test**

```bash
cd mcp && npm run build && node dist/cli.js --help 2>&1 | head -5
```
Expected: shows help without errors

- [ ] **Step 5: Commit**

```bash
git add mcp/src/index.ts
git commit -m "feat: add grasp_brain_index and grasp_brain_status MCP tools"
```

---

### Task 4: grasp_context MCP tool

**Files:**
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Add `grasp_context` tool after `grasp_brain_status`**

```typescript
// =====================================================================
// TOOL: grasp_context
// =====================================================================
server.registerTool(
  'grasp_context',
  {
    title: 'Get Health Context for a File',
    description: `Returns architectural health context for a file — its health grade, complexity score, coupling, blast radius (files that depend on it), its own dependencies, and any security findings. Use this before editing a file to understand risk.

If the repo is indexed in Grasp Brain, results are instant. Otherwise requires a session_id from grasp_analyze.

Parameters:
  file_path — relative path to the file (e.g. "src/auth/session.ts")
  repo_source — the repo source string used when indexing (e.g. "/path/to/repo" or "owner/repo")
  session_id — optional: use an active analysis session instead of Brain`,
    inputSchema: z.object({
      file_path: z.string().describe('Relative file path'),
      repo_source: z.string().optional().describe('Repo source (same as used in grasp_brain_index or grasp_analyze)'),
      session_id: z.string().optional().describe('Active session ID from grasp_analyze'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ file_path, repo_source, session_id }) => {
    // Try Brain first
    if (repo_source) {
      const ctx = brainStore.getFileContext(repo_source, file_path);
      if (ctx) {
        const riskLevel = ctx.complexity >= 20 ? 'HIGH' : ctx.complexity >= 10 ? 'MEDIUM' : 'LOW';
        const warning = riskLevel === 'HIGH'
          ? `⚠️  HIGH RISK: complexity ${ctx.complexity}, grade ${ctx.healthGrade}. ${ctx.dependents.length} files depend on this. Changes here have a wide blast radius.`
          : riskLevel === 'MEDIUM'
          ? `⚡ MEDIUM RISK: complexity ${ctx.complexity}, grade ${ctx.healthGrade}. Review dependents before editing.`
          : `✓ LOW RISK: complexity ${ctx.complexity}, grade ${ctx.healthGrade}.`;

        const output = {
          file: file_path, layer: ctx.layer, lines: ctx.lines,
          complexity: ctx.complexity, health_grade: ctx.healthGrade,
          coupling: { in: ctx.couplingIn, out: ctx.couplingOut },
          blast_radius: { dependent_count: ctx.dependents.length, dependents: ctx.dependents.slice(0, 10) },
          dependencies: ctx.dependencies.slice(0, 10),
          security_issues: ctx.security,
          risk: riskLevel, warning,
          source: 'brain',
        };
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
      }
    }

    // Fall back to session
    if (session_id) {
      const data = await getSession(session_id);
      if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found.` }] };
      const file = data.files.find(f => f.path === file_path || f.path.endsWith(file_path));
      if (!file) return { content: [{ type: 'text', text: `File "${file_path}" not found in session.` }] };
      const dependents = data.connections.filter(c => c.target === file.path).map(c => c.source);
      const dependencies = data.connections.filter(c => c.source === file.path).map(c => c.target);
      const security = data.security.filter(s => s.file === file.path);
      const complexity = file.complexity ?? 1;
      const riskLevel = complexity >= 20 ? 'HIGH' : complexity >= 10 ? 'MEDIUM' : 'LOW';
      const output = {
        file: file.path, layer: file.layer, lines: file.lines,
        complexity, health_grade: complexity >= 20 ? 'D' : complexity >= 10 ? 'C' : 'A',
        coupling: { in: dependents.length, out: dependencies.length },
        blast_radius: { dependent_count: dependents.length, dependents: dependents.slice(0, 10) },
        dependencies: [...new Set(dependencies)].slice(0, 10),
        security_issues: security.map(s => ({ severity: s.severity, desc: s.desc })),
        risk: riskLevel,
        warning: riskLevel === 'HIGH' ? `⚠️  HIGH RISK: complexity ${complexity}. ${dependents.length} dependents.` : `✓ Risk: ${riskLevel}`,
        source: 'session',
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }

    return { content: [{ type: 'text', text: `Provide repo_source (for Brain lookup) or session_id (for session lookup).` }] };
  }
);
```

- [ ] **Step 2: Typecheck + build**

```bash
cd mcp && ./node_modules/.bin/tsc --noEmit -p tsconfig.check.json 2>&1 | head -10 && npm run build 2>&1 | tail -5
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add mcp/src/index.ts
git commit -m "feat: add grasp_context MCP tool with health-aware risk warnings"
```

---

### Task 5: grasp index + grasp context CLI subcommands

**Files:**
- Modify: `mcp/src/cli.ts`

- [ ] **Step 1: Add subcommand dispatch at the top of `main()` in `cli.ts`**

Find `async function main() {` (line ~421) and add this block immediately after the opening brace:

```typescript
  // ── subcommand dispatch ─────────────────────────────────────────────
  const SUBCOMMANDS = new Set(['index', 'setup', 'diff', 'daemon', 'context']);
  if (SUBCOMMANDS.has(positional[0])) {
    const sub = positional[0];
    const { BrainStore } = await import('./brain.js');
    const brain = new BrainStore();

    if (sub === 'index') {
      const targetPath = resolve(positional[1] || '.');
      console.log(c.bold('\n  🧠 Grasp Brain — Indexing\n'));
      console.log(c.dim(`  Target: ${targetPath}\n`));
      const src = parseSource(targetPath, token, gitlabToken, gitlabHost);
      if (!src) { console.error(c.red(`  Cannot parse: ${targetPath}`)); process.exit(1); }
      try {
        const { analyzeSource } = await import('./analyzer.js');
        const { SessionStore } = await import('./session-store.js');
        const store = new SessionStore();
        let lastMsg = '';
        const result = await analyzeSource(src, (msg) => {
          if (msg !== lastMsg) { process.stdout.write(c.dim(`\r  ${msg}                    `)); lastMsg = msg; }
        });
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        await store.set(result.sessionId, result);
        brain.indexResult(result);
        console.log(`  ${c.green('✓')} Indexed ${c.bold(String(result.summary.fileCount))} files, ${c.bold(String(result.summary.functionCount))} functions`);
        console.log(`  ${c.bold('Health:')} ${gradeColour(result.summary.healthGrade)} ${result.summary.healthScore}/100`);
        console.log(c.dim(`\n  Brain updated at ~/.grasp/brain.db`));
        console.log(c.dim(`  Run: grasp context <file> to check any file's health\n`));
      } catch (err: any) { console.error(c.red(`  Error: ${err.message}`)); process.exit(1); }
      process.exit(0);
    }

    if (sub === 'context') {
      const filePath = positional[1];
      const repoPathArg = positional[2] || '.';
      if (!filePath) { console.error(c.red('  Usage: grasp context <file> [repo-path]')); process.exit(1); }
      const repoSrc = resolve(repoPathArg.startsWith('/') ? repoPathArg : repoPathArg);
      const repos = brain.listRepos();
      // Find best matching repo
      const repo = repos.find(r => r.source === repoSrc) ?? repos.find(r => filePath.startsWith(r.source)) ?? repos[0];
      if (!repo) { console.log('No repos indexed. Run: grasp index <path>'); process.exit(0); }
      const ctx = brain.getFileContext(repo.source, filePath);
      if (!ctx) { console.log(`File not found in Brain: ${filePath}`); process.exit(0); }
      const riskIcon = ctx.complexity >= 20 ? c.red('⚠') : ctx.complexity >= 10 ? c.yellow('⚡') : c.green('✓');
      console.log(`\n${riskIcon} ${c.bold(filePath)}`);
      console.log(`  Layer: ${ctx.layer}  Lines: ${ctx.lines}  Complexity: ${c.bold(String(ctx.complexity))}  Grade: ${gradeColour(ctx.healthGrade)}`);
      console.log(`  Coupling: ${ctx.couplingIn} in / ${ctx.couplingOut} out`);
      if (ctx.dependents.length > 0) console.log(`  ${c.yellow(`Blast radius: ${ctx.dependents.length} files depend on this`)}`);
      if (ctx.security.length > 0) console.log(`  ${c.red(`Security: ${ctx.security.length} issue(s)`)}`);
      console.log('');
      process.exit(0);
    }

    brain.close();
    process.exit(0);
  }
```

- [ ] **Step 2: Build and test `grasp index`**

```bash
cd mcp && npm run build && node dist/cli.js index . 2>&1 | head -10
```
Expected: shows `✓ Indexed N files` (or an error if path has issues — that's fine for this smoke test)

- [ ] **Step 3: Commit**

```bash
git add mcp/src/cli.ts
git commit -m "feat: add 'grasp index' and 'grasp context' CLI subcommands"
```

---

## Phase 2: Grasp Setup

### Task 6: SetupManager — editor detection + hook templates

**Files:**
- Create: `mcp/src/setup.ts`
- Create: `mcp/tests/setup.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// mcp/tests/setup.test.ts
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { SetupManager } from '../src/setup.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-setup-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHookScript returns valid shell script containing grasp context', () => {
  const mgr = new SetupManager({ configDir: tmpDir });
  const script = mgr.generateHookScript();
  expect(script).toContain('grasp context');
  expect(script).toContain('#!/bin/sh');
});

test('generateClaudeMd includes health summary', () => {
  const mgr = new SetupManager({ configDir: tmpDir });
  const md = mgr.generateClaudeMd({
    source: '/tmp/myrepo',
    healthScore: 72,
    healthGrade: 'C',
    fileCount: 50,
    functionCount: 300,
    issues: 5,
    security: 2,
    cycles: 1,
    highRiskFiles: [{ path: 'src/auth.ts', complexity: 22, grade: 'D', dependents: 7 }],
    layers: ['services', 'utils', 'routes'],
  });
  expect(md).toContain('72/100');
  expect(md).toContain('Grade: C');
  expect(md).toContain('src/auth.ts');
  expect(md).toContain('grasp_context');
});

test('writeHooks creates hook file in configDir', () => {
  const mgr = new SetupManager({ configDir: tmpDir });
  mgr.writeHooks();
  expect(fs.existsSync(path.join(tmpDir, 'hooks', 'grasp-pre-tool-use.sh'))).toBe(true);
});

test('detectEditors returns an array (may be empty in CI)', () => {
  const mgr = new SetupManager({ configDir: tmpDir });
  const editors = mgr.detectEditors();
  expect(Array.isArray(editors)).toBe(true);
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mcp && npm test -- --testPathPattern="setup" 2>&1 | tail -5
```
Expected: `Cannot find module '../src/setup.js'`

- [ ] **Step 3: Create `mcp/src/setup.ts`**

```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface SetupOpts {
  configDir?: string;  // override ~/.claude for tests
}

export interface ClaudeMdContext {
  source: string;
  healthScore: number;
  healthGrade: string;
  fileCount: number;
  functionCount: number;
  issues: number;
  security: number;
  cycles: number;
  highRiskFiles: Array<{ path: string; complexity: number; grade: string; dependents: number }>;
  layers: string[];
}

export interface EditorInfo {
  name: string;
  configDir: string;
  hooksDir: string;
  settingsFile: string;
}

export class SetupManager {
  private configDir: string;

  constructor(opts: SetupOpts = {}) {
    this.configDir = opts.configDir ?? path.join(os.homedir(), '.claude');
  }

  detectEditors(): EditorInfo[] {
    const editors: EditorInfo[] = [];
    const home = os.homedir();

    const candidates: EditorInfo[] = [
      {
        name: 'Claude Code',
        configDir: path.join(home, '.claude'),
        hooksDir: path.join(home, '.claude', 'hooks'),
        settingsFile: path.join(home, '.claude', 'settings.json'),
      },
      {
        name: 'Cursor',
        configDir: path.join(home, '.cursor'),
        hooksDir: path.join(home, '.cursor', 'hooks'),
        settingsFile: path.join(home, '.cursor', 'settings.json'),
      },
      {
        name: 'Windsurf',
        configDir: path.join(home, '.codeium', 'windsurf'),
        hooksDir: path.join(home, '.codeium', 'windsurf', 'hooks'),
        settingsFile: path.join(home, '.codeium', 'windsurf', 'settings.json'),
      },
    ];

    for (const e of candidates) {
      if (fs.existsSync(e.configDir)) editors.push(e);
    }
    return editors;
  }

  generateHookScript(): string {
    return `#!/bin/sh
# Grasp Pre-Tool-Use Hook — injects health context before file edits
# Installed by: grasp setup
set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
    try { const p=JSON.parse(d); console.log(p.tool_input?.file_path||p.tool_input?.path||''); } catch{console.log('');}
  });
")

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Only run if grasp is installed
if ! command -v grasp >/dev/null 2>&1; then exit 0; fi

grasp context "$FILE_PATH" 2>/dev/null || true
`;
  }

  generateClaudeMd(ctx: ClaudeMdContext): string {
    const riskSection = ctx.highRiskFiles.length > 0
      ? `\n## High-Risk Files (Grade D or F)\nThink carefully before editing these — high complexity and wide blast radius:\n\n${ctx.highRiskFiles.map(f => `- \`${f.path}\` — complexity ${f.complexity}, grade ${f.grade}, ${f.dependents} dependents`).join('\n')}\n`
      : '';

    return `# Grasp Architecture Context

> Auto-generated by \`grasp setup\`. Re-run after major refactors.

## Health Summary
- Score: **${ctx.healthScore}/100** (Grade: **${ctx.healthGrade}**)
- Files: ${ctx.fileCount} | Functions: ${ctx.functionCount}
- Issues: ${ctx.issues} | Security: ${ctx.security} | Circular deps: ${ctx.cycles}

## Architecture Layers
${ctx.layers.map(l => `- \`${l}/\``).join('\n')}
${riskSection}
## AI Agent Instructions

Before editing any file, run:
\`\`\`
grasp_context file_path="<file>" repo_source="${ctx.source}"
\`\`\`

This tells you the file's health grade, complexity, and which files depend on it (blast radius). High-risk files (grade D/F) require extra care — changes there cascade widely.

Use \`grasp_ask\` to answer architectural questions:
- "Which files have the highest coupling?"
- "What is the blast radius of src/auth.ts?"
- "Which files have security issues?"
`;
  }

  generateAgentsMd(ctx: ClaudeMdContext): string {
    return `# Grasp Architecture Context (AGENTS.md)

Health: ${ctx.healthScore}/100 (${ctx.healthGrade}) | Files: ${ctx.fileCount} | Functions: ${ctx.functionCount}

## MCP Tools
- grasp_context: health context for any file before editing
- grasp_ask: architectural Q&A
- grasp_hotspots: highest-risk files to change
- grasp_dependents: blast radius for any file

## High-Risk Files
${ctx.highRiskFiles.length > 0 ? ctx.highRiskFiles.map(f => `- ${f.path} (grade ${f.grade}, complexity ${f.complexity})`).join('\n') : 'None detected.'}
`;
  }

  writeHooks(): void {
    const hooksDir = path.join(this.configDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, 'grasp-pre-tool-use.sh');
    fs.writeFileSync(hookPath, this.generateHookScript(), { mode: 0o755 });
  }

  writeSettings(): void {
    const settingsPath = path.join(this.configDir, 'settings.json');
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch { /* use empty */ }
    }
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
    const preToolUse: unknown[] = (hooks.PreToolUse as unknown[]) ?? [];

    const hookEntry = {
      matcher: 'Write|Edit|MultiEdit',
      hooks: [{ type: 'command', command: path.join(this.configDir, 'hooks', 'grasp-pre-tool-use.sh') }],
    };
    // Avoid duplicate registration
    const alreadyRegistered = preToolUse.some((h: any) => h.hooks?.[0]?.command?.includes('grasp'));
    if (!alreadyRegistered) preToolUse.push(hookEntry);

    settings.hooks = { ...hooks, PreToolUse: preToolUse };
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd mcp && npm test -- --testPathPattern="setup" 2>&1 | tail -5
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add mcp/src/setup.ts mcp/tests/setup.test.ts
git commit -m "feat: add SetupManager with editor detection and hook generation"
```

---

### Task 7: grasp setup CLI subcommand

**Files:**
- Modify: `mcp/src/cli.ts`

- [ ] **Step 1: Add `setup` handler inside the subcommand dispatch block in `cli.ts`**

Inside the `if (SUBCOMMANDS.has(positional[0]))` block, after the `context` handler:

```typescript
    if (sub === 'setup') {
      const targetPath = resolve(positional[1] || '.');
      console.log(c.bold('\n  🔧 Grasp Setup\n'));

      const { SetupManager } = await import('./setup.js');
      const { analyzeSource } = await import('./analyzer.js');
      const { SessionStore } = await import('./session-store.js');

      const mgr = new SetupManager();
      const editors = mgr.detectEditors();

      if (editors.length === 0) {
        console.log(c.yellow('  No supported editors detected (Claude Code, Cursor, Windsurf)'));
        console.log(c.dim('  Hook generation skipped. Context files will still be written.\n'));
      } else {
        console.log(`  Detected editors: ${editors.map(e => c.bold(e.name)).join(', ')}\n`);
      }

      // Index the repo first
      const src = parseSource(targetPath, token, gitlabToken, gitlabHost);
      let analysisCtx: import('./setup.js').ClaudeMdContext | null = null;

      if (src) {
        process.stdout.write(c.dim('  Analyzing repo for context...\n'));
        try {
          const result = await analyzeSource(src, () => {});
          const store = new SessionStore();
          await store.set(result.sessionId, result);
          brain.indexResult(result);

          // Find high-risk files (complexity >= 20)
          const couplingIn = new Map<string, number>();
          for (const conn of result.connections) couplingIn.set(conn.target, (couplingIn.get(conn.target) ?? 0) + 1);
          const highRisk = result.files
            .filter(f => (f.complexity ?? 0) >= 20)
            .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
            .slice(0, 8)
            .map(f => ({ path: f.path, complexity: f.complexity ?? 0, grade: (f.complexity ?? 0) >= 30 ? 'F' : 'D', dependents: couplingIn.get(f.path) ?? 0 }));

          analysisCtx = {
            source: targetPath,
            healthScore: result.summary.healthScore,
            healthGrade: result.summary.healthGrade,
            fileCount: result.summary.fileCount,
            functionCount: result.summary.functionCount,
            issues: result.summary.issueCount,
            security: result.summary.securityIssueCount,
            cycles: result.summary.circularDepCount,
            highRiskFiles: highRisk,
            layers: result.summary.layers,
          };
          console.log(`  ${c.green('✓')} Analysis complete — health ${result.summary.healthScore}/100 (${result.summary.healthGrade})`);
        } catch { console.log(c.yellow('  Analysis failed — generating context files without health data')); }
      }

      const ctx: import('./setup.js').ClaudeMdContext = analysisCtx ?? {
        source: targetPath, healthScore: 0, healthGrade: '?',
        fileCount: 0, functionCount: 0, issues: 0, security: 0, cycles: 0,
        highRiskFiles: [], layers: [],
      };

      // Write hooks for each detected editor
      for (const editor of editors) {
        const editorMgr = new SetupManager({ configDir: editor.configDir });
        editorMgr.writeHooks();
        editorMgr.writeSettings();
        console.log(`  ${c.green('✓')} Hooks written → ${editor.hooksDir}`);
      }

      // Write CLAUDE.md and AGENTS.md
      const claudeMdPath = join(targetPath, 'CLAUDE.md');
      const agentsMdPath = join(targetPath, 'AGENTS.md');
      fs.writeFileSync(claudeMdPath, mgr.generateClaudeMd(ctx));
      fs.writeFileSync(agentsMdPath, mgr.generateAgentsMd(ctx));
      console.log(`  ${c.green('✓')} CLAUDE.md written`);
      console.log(`  ${c.green('✓')} AGENTS.md written`);

      console.log(c.bold('\n  ✅ Grasp Setup complete\n'));
      console.log(c.dim('  AI agents will now receive health context before editing files.'));
      console.log(c.dim('  Use grasp_ask in Claude Code to query architecture.\n'));
      process.exit(0);
    }
```

Also add `import { writeFileSync as fsWriteFile } from 'fs';` to cli.ts imports — but check: `writeFileSync` is already imported as `writeFileSync` from fs at line 15. Use it directly. The variable `fs` isn't in scope in cli.ts — use the already-imported named export `writeFileSync`.

Replace `fs.writeFileSync(claudeMdPath, ...)` and `fs.writeFileSync(agentsMdPath, ...)` with:
```typescript
writeFileSync(claudeMdPath, mgr.generateClaudeMd(ctx));
writeFileSync(agentsMdPath, mgr.generateAgentsMd(ctx));
```

- [ ] **Step 2: Build**

```bash
cd mcp && npm run build 2>&1 | tail -10
```
Expected: 0 errors

- [ ] **Step 3: Smoke test setup (safe — just prints, doesn't write if no editors detected)**

```bash
node mcp/dist/cli.js setup /tmp 2>&1 | head -10
```
Expected: Shows `🔧 Grasp Setup` and either detects editors or skips hooks

- [ ] **Step 4: Commit**

```bash
git add mcp/src/cli.ts
git commit -m "feat: add 'grasp setup' CLI subcommand with editor hook + CLAUDE.md generation"
```

---

## Phase 3: Grasp Diff

### Task 8: computeArchDiff + grasp_arch_diff tool

**Files:**
- Create: `mcp/src/arch-diff.ts`
- Create: `mcp/tests/arch-diff.test.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// mcp/tests/arch-diff.test.ts
import { computeArchDiff } from '../src/arch-diff.js';
import type { AnalysisResult } from '../src/types.js';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    sessionId: 'sess', source: '/repo', sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'a.ts', name: 'a.ts', folder: '', content: null, functions: [], lines: 50, layer: 'services', churn: 1, isCode: true, complexity: 8 },
    ],
    connections: [], issues: [], patterns: [], security: [], duplicates: [], layerViolations: [],
    folders: [], layers: ['services'],
    summary: { fileCount: 1, codeFileCount: 1, functionCount: 0, connectionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, healthScore: 85, healthGrade: 'A', layers: ['services'], topFolders: [], languages: [] },
    ...overrides,
  };
}

test('detects added files', () => {
  const base = makeResult();
  const current = makeResult({ files: [...base.files, { path: 'b.ts', name: 'b.ts', folder: '', content: null, functions: [], lines: 20, layer: 'utils', churn: 0, isCode: true }], summary: { ...base.summary, fileCount: 2 } });
  const diff = computeArchDiff(base, current);
  expect(diff.files.added).toContain('b.ts');
});

test('detects removed files', () => {
  const base = makeResult();
  const current = makeResult({ files: [], summary: { ...base.summary, fileCount: 0 } });
  const diff = computeArchDiff(base, current);
  expect(diff.files.removed).toContain('a.ts');
});

test('computes health delta', () => {
  const base = makeResult();
  const worse = makeResult({ summary: { ...base.summary, healthScore: 60, healthGrade: 'D' } });
  const diff = computeArchDiff(base, worse);
  expect(diff.health.delta).toBe(-25);
  expect(diff.health.improved).toBe(false);
});

test('detects grade-worsened files', () => {
  const base = makeResult();
  const current = makeResult({
    files: [{ path: 'a.ts', name: 'a.ts', folder: '', content: null, functions: [], lines: 50, layer: 'services', churn: 1, isCode: true, complexity: 25 }],
  });
  const diff = computeArchDiff(base, current);
  expect(diff.files.gradeWorsened.some(f => f.path === 'a.ts')).toBe(true);
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mcp && npm test -- --testPathPattern="arch-diff" 2>&1 | tail -5
```
Expected: `Cannot find module '../src/arch-diff.js'`

- [ ] **Step 3: Create `mcp/src/arch-diff.ts`**

```typescript
import type { AnalysisResult } from './types.js';

function complexityGrade(c: number): string {
  if (c >= 30) return 'F';
  if (c >= 20) return 'D';
  if (c >= 10) return 'C';
  if (c >= 5) return 'B';
  return 'A';
}

export interface ArchDiff {
  baseline: { source: string; analyzedAt: string; healthScore: number; healthGrade: string };
  current: { source: string; analyzedAt: string; healthScore: number; healthGrade: string };
  health: { delta: number; improved: boolean; baselineScore: number; currentScore: number; baselineGrade: string; currentGrade: string };
  files: {
    added: string[];
    removed: string[];
    gradeWorsened: Array<{ path: string; before: string; after: string; complexityDelta: number }>;
    gradeImproved: Array<{ path: string; before: string; after: string }>;
  };
  issues: { added: string[]; resolved: string[]; net: number };
  security: { added: Array<{ file: string; severity: string; desc: string }>; resolved: number };
  cycles: { added: string[]; resolved: string[]; net: number };
  summary: string;
}

export function computeArchDiff(baseline: AnalysisResult, current: AnalysisResult): ArchDiff {
  const baseFiles = new Map(baseline.files.map(f => [f.path, f]));
  const currFiles = new Map(current.files.map(f => [f.path, f]));

  const added = [...currFiles.keys()].filter(p => !baseFiles.has(p));
  const removed = [...baseFiles.keys()].filter(p => !currFiles.has(p));

  const gradeWorsened: ArchDiff['files']['gradeWorsened'] = [];
  const gradeImproved: ArchDiff['files']['gradeImproved'] = [];

  for (const [path, curr] of currFiles) {
    const base = baseFiles.get(path);
    if (!base) continue;
    const baseGrade = complexityGrade(base.complexity ?? 1);
    const currGrade = complexityGrade(curr.complexity ?? 1);
    if (currGrade > baseGrade) { // alphabetically D > A etc. No — D is worse. Use index.
      const grades = ['A', 'B', 'C', 'D', 'F'];
      const bi = grades.indexOf(baseGrade), ci = grades.indexOf(currGrade);
      if (ci > bi) gradeWorsened.push({ path, before: baseGrade, after: currGrade, complexityDelta: (curr.complexity ?? 1) - (base.complexity ?? 1) });
      if (ci < bi) gradeImproved.push({ path, before: baseGrade, after: currGrade });
    }
  }

  const baseIssueTitles = new Set(baseline.issues.map(i => i.title));
  const currIssueTitles = new Set(current.issues.map(i => i.title));
  const addedIssues = [...currIssueTitles].filter(t => !baseIssueTitles.has(t));
  const resolvedIssues = [...baseIssueTitles].filter(t => !currIssueTitles.has(t));

  const baseSecFiles = new Set(baseline.security.map(s => `${s.file}:${s.desc}`));
  const addedSecurity = current.security.filter(s => !baseSecFiles.has(`${s.file}:${s.desc}`));
  const resolvedSecurity = baseline.security.filter(s => !new Set(current.security.map(x => `${x.file}:${x.desc}`)).has(`${s.file}:${s.desc}`));

  const baseCycles = new Set((baseline as any).cycles?.map((c: string[]) => c.join('→')) ?? []);
  const currCycles = new Set((current as any).cycles?.map((c: string[]) => c.join('→')) ?? []);
  const addedCycles = [...currCycles].filter(c => !baseCycles.has(c));
  const resolvedCycles = [...baseCycles].filter(c => !currCycles.has(c));

  const delta = current.summary.healthScore - baseline.summary.healthScore;
  const summary = [
    `Health: ${baseline.summary.healthGrade}(${baseline.summary.healthScore}) → ${current.summary.healthGrade}(${current.summary.healthScore}) (${delta >= 0 ? '+' : ''}${delta})`,
    added.length > 0 ? `+${added.length} files added` : '',
    removed.length > 0 ? `${removed.length} files removed` : '',
    gradeWorsened.length > 0 ? `${gradeWorsened.length} files grade-worsened` : '',
    addedIssues.length > 0 ? `${addedIssues.length} new issues` : '',
    addedSecurity.length > 0 ? `⚠ ${addedSecurity.length} new security findings` : '',
  ].filter(Boolean).join(' | ');

  return {
    baseline: { source: baseline.source, analyzedAt: baseline.analyzedAt, healthScore: baseline.summary.healthScore, healthGrade: baseline.summary.healthGrade },
    current: { source: current.source, analyzedAt: current.analyzedAt, healthScore: current.summary.healthScore, healthGrade: current.summary.healthGrade },
    health: { delta, improved: delta > 0, baselineScore: baseline.summary.healthScore, currentScore: current.summary.healthScore, baselineGrade: baseline.summary.healthGrade, currentGrade: current.summary.healthGrade },
    files: { added, removed, gradeWorsened, gradeImproved },
    issues: { added: addedIssues, resolved: resolvedIssues, net: current.issues.length - baseline.issues.length },
    security: { added: addedSecurity.map(s => ({ file: s.file, severity: s.severity, desc: s.desc })), resolved: resolvedSecurity.length },
    cycles: { added: addedCycles, resolved: resolvedCycles, net: addedCycles.length - resolvedCycles.length },
    summary,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd mcp && npm test -- --testPathPattern="arch-diff" 2>&1 | tail -5
```
Expected: `4 passed`

- [ ] **Step 5: Add `grasp_arch_diff` MCP tool to `mcp/src/index.ts`**

Add import near the top of index.ts (after the SessionStore import):
```typescript
import { computeArchDiff } from './arch-diff.js';
```

Add tool after `grasp_diff`:

```typescript
// =====================================================================
// TOOL: grasp_arch_diff
// =====================================================================
server.registerTool(
  'grasp_arch_diff',
  {
    title: 'Architectural Health Diff',
    description: `Compare the architectural health of a codebase against a baseline — detects files whose health grades worsened, new security findings, new issues, and health score delta. Use on PRs to understand the quality impact of changes.

Parameters:
  session_id_baseline — session from before the change (or from main branch)
  session_id_current  — session from after the change (current branch)

Returns a structured diff including health delta, grade changes per file, new security findings, and an overall summary.`,
    inputSchema: z.object({
      session_id_baseline: z.string().describe('Baseline session (e.g. main branch)'),
      session_id_current: z.string().describe('Current session (e.g. PR branch)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id_baseline, session_id_current }) => {
    const base = await getSession(session_id_baseline);
    const curr = await getSession(session_id_current);
    if (!base) return { content: [{ type: 'text', text: `Baseline session not found: ${session_id_baseline}` }], isError: true };
    if (!curr) return { content: [{ type: 'text', text: `Current session not found: ${session_id_current}` }], isError: true };
    const diff = computeArchDiff(base, curr);
    return { content: [{ type: 'text', text: truncate(JSON.stringify(diff, null, 2)) }], structuredContent: diff };
  }
);
```

- [ ] **Step 6: Add `grasp diff` CLI subcommand to `cli.ts`**

Inside the subcommand dispatch block:

```typescript
    if (sub === 'diff') {
      const branch = positional[1] || 'main';
      const targetPath = resolve(positional[2] || '.');
      console.log(c.bold(`\n  📊 Grasp Diff — ${targetPath} vs ${branch}\n`));

      const { analyzeSource } = await import('./analyzer.js');
      const { SessionStore } = await import('./session-store.js');
      const { computeArchDiff } = await import('./arch-diff.js');
      const { execSync } = await import('child_process');
      const store = new SessionStore();

      // Analyze current state
      const currSrc = parseSource(targetPath, token, gitlabToken, gitlabHost);
      if (!currSrc) { console.error(c.red('Cannot parse path')); process.exit(1); }

      process.stdout.write(c.dim('  Analyzing current state...'));
      const current = await analyzeSource(currSrc, () => {});
      await store.set(current.sessionId, current);
      process.stdout.write(c.green(' done\n'));

      // Check out baseline branch into a temp dir and analyze
      let baseline = current; // fallback: diff against self
      try {
        const tmpBase = '/tmp/grasp-diff-base-' + Date.now();
        execSync(`git -C "${targetPath}" worktree add "${tmpBase}" "${branch}" 2>/dev/null`, { stdio: 'ignore' });
        process.stdout.write(c.dim(`  Analyzing ${branch} branch...`));
        const baseSrc = parseSource(tmpBase, token, gitlabToken, gitlabHost);
        if (baseSrc) baseline = await analyzeSource(baseSrc, () => {});
        await store.set(baseline.sessionId, baseline);
        process.stdout.write(c.green(' done\n'));
        execSync(`git -C "${targetPath}" worktree remove --force "${tmpBase}" 2>/dev/null`, { stdio: 'ignore' });
      } catch {
        console.log(c.yellow(`  Could not checkout ${branch} — comparing current state to itself`));
      }

      const diff = computeArchDiff(baseline, current);
      console.log(`\n  ${c.bold('Summary:')} ${diff.summary}`);
      console.log(`  Health: ${gradeColour(diff.baseline.healthGrade)}${diff.baseline.healthScore} → ${gradeColour(diff.current.healthGrade)}${diff.current.healthScore} (${diff.health.delta >= 0 ? c.green('+' + diff.health.delta) : c.red(String(diff.health.delta))})`);
      if (diff.files.gradeWorsened.length > 0) {
        console.log(`\n  ${c.yellow('⚠ Grade-worsened files:')}`);
        diff.files.gradeWorsened.slice(0, 5).forEach(f => console.log(`    ${f.path}: ${f.before} → ${f.after} (+${f.complexityDelta} complexity)`));
      }
      if (diff.security.added.length > 0) {
        console.log(`\n  ${c.red('✗ New security findings:')}`);
        diff.security.added.slice(0, 5).forEach(s => console.log(`    [${s.severity}] ${s.file}: ${s.desc}`));
      }
      console.log('');
      process.exit(0);
    }
```

- [ ] **Step 7: Build + typecheck**

```bash
cd mcp && npm run build 2>&1 | tail -5 && ./node_modules/.bin/tsc --noEmit -p tsconfig.check.json 2>&1 | head -10
```
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add mcp/src/arch-diff.ts mcp/tests/arch-diff.test.ts mcp/src/index.ts mcp/src/cli.ts
git commit -m "feat: add computeArchDiff, grasp_arch_diff MCP tool, and grasp diff CLI"
```

---

## Phase 4: Grasp Daemon

### Task 9: WatchDaemon + grasp daemon CLI

**Files:**
- Create: `mcp/src/watcher.ts`
- Modify: `mcp/src/cli.ts`

- [ ] **Step 1: Create `mcp/src/watcher.ts`**

```typescript
import { watch as fsWatch } from 'fs';
import { analyzeSource } from './analyzer.js';
import { SessionStore } from './session-store.js';
import { BrainStore } from './brain.js';
import { isLocalPath, resolveLocalPath } from './sources/local.js';

const SKIP = /\.(swp|swx|tmp|lock)|~$|\.git\//;
const DEBOUNCE_MS = 1500;

export interface DaemonOpts {
  path: string;
  onUpdate?: (source: string, healthScore: number, healthGrade: string) => void;
  onError?: (err: Error) => void;
}

export class WatchDaemon {
  private watcher: ReturnType<typeof fsWatch> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionStore = new SessionStore();
  private brainStore = new BrainStore();
  private path: string;
  private onUpdate: DaemonOpts['onUpdate'];
  private onError: DaemonOpts['onError'];

  constructor(opts: DaemonOpts) {
    this.path = opts.path;
    this.onUpdate = opts.onUpdate;
    this.onError = opts.onError;
  }

  async start(): Promise<void> {
    // Initial index
    await this._reindex();

    this.watcher = fsWatch(this.path, { recursive: true }, (_evt, filename) => {
      if (!filename || SKIP.test(filename)) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this._reindex(), DEBOUNCE_MS);
    });

    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    this.brainStore.close();
    process.exit(0);
  }

  private async _reindex(): Promise<void> {
    try {
      const src = { type: 'local' as const, path: this.path };
      const result = await analyzeSource(src, () => {});
      await this.sessionStore.set(result.sessionId, result);
      this.brainStore.indexResult(result);
      this.onUpdate?.(result.source, result.summary.healthScore, result.summary.healthGrade);
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export function writeGitHook(repoPath: string): void {
  const { execSync } = require('child_process');
  const { join } = require('path');
  const { writeFileSync, mkdirSync, existsSync } = require('fs');

  let gitDir: string;
  try {
    gitDir = execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!gitDir.startsWith('/')) gitDir = join(repoPath, gitDir);
  } catch { return; }

  const hooksDir = join(gitDir, 'hooks');
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'post-commit');
  const hookContent = `#!/bin/sh
# Grasp Brain — auto-reindex on commit
grasp index "$(git rev-parse --show-toplevel)" 2>/dev/null &
`;
  writeFileSync(hookPath, hookContent, { mode: 0o755 });
}
```

- [ ] **Step 2: Add `daemon` handler to `cli.ts` subcommand dispatch**

```typescript
    if (sub === 'daemon') {
      const targetPath = resolve(positional[1] || '.');
      const installHook = flags.has('--git-hook');
      console.log(c.bold('\n  👁  Grasp Daemon\n'));
      console.log(c.dim(`  Watching: ${targetPath}`));
      console.log(c.dim('  Press Ctrl+C to stop\n'));

      const { WatchDaemon, writeGitHook } = await import('./watcher.js');

      if (installHook) {
        writeGitHook(targetPath);
        console.log(c.green('  ✓ git post-commit hook installed'));
      }

      const daemon = new WatchDaemon({
        path: targetPath,
        onUpdate: (src, score, grade) => {
          const ts = new Date().toLocaleTimeString();
          process.stdout.write(`\r  [${ts}] Brain updated — ${gradeColour(grade)} ${score}/100          `);
        },
        onError: (err) => {
          console.error(c.red(`\n  Error: ${err.message}`));
        },
      });

      await daemon.start();
      // daemon.start() sets up watchers but doesn't block — keep process alive
      await new Promise(() => {}); // block forever until SIGINT
    }
```

- [ ] **Step 3: Build**

```bash
cd mcp && npm run build 2>&1 | tail -5
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add mcp/src/watcher.ts mcp/src/cli.ts
git commit -m "feat: add WatchDaemon and 'grasp daemon' live re-indexing subcommand"
```

---

## Phase 5: Grasp Ask

### Task 10: askArchitecture keyword search engine

**Files:**
- Create: `mcp/src/ask.ts`
- Create: `mcp/tests/ask.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// mcp/tests/ask.test.ts
import { askArchitecture } from '../src/ask.js';
import type { AnalysisResult } from '../src/types.js';

function makeResult(): AnalysisResult {
  return {
    sessionId: 'sess', source: '/repo', sourceType: 'local',
    analyzedAt: new Date().toISOString(),
    files: [
      { path: 'src/auth/session.ts', name: 'session.ts', folder: 'src/auth', content: null, functions: [{ name: 'createSession', file: 'src/auth/session.ts', line: 5 }], lines: 120, layer: 'services', churn: 8, isCode: true, complexity: 22 },
      { path: 'src/utils/format.ts', name: 'format.ts', folder: 'src/utils', content: null, functions: [{ name: 'formatDate', file: 'src/utils/format.ts', line: 3 }], lines: 30, layer: 'utils', churn: 1, isCode: true, complexity: 3 },
      { path: 'src/routes/login.ts', name: 'login.ts', folder: 'src/routes', content: null, functions: [], lines: 40, layer: 'routes', churn: 2, isCode: true, complexity: 6 },
    ],
    connections: [
      { source: 'src/routes/login.ts', target: 'src/auth/session.ts', fn: 'createSession', count: 1 },
      { source: 'src/auth/session.ts', target: 'src/utils/format.ts', fn: 'formatDate', count: 1 },
    ],
    issues: [], patterns: [], security: [
      { type: 'hardcoded-secret', severity: 'high', file: 'src/auth/session.ts', line: 10, desc: 'Hardcoded token' },
    ], duplicates: [], layerViolations: [], folders: [], layers: ['services', 'utils', 'routes'],
    summary: { fileCount: 3, codeFileCount: 3, functionCount: 3, connectionCount: 2, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 1, healthScore: 70, healthGrade: 'C', layers: ['services', 'utils', 'routes'], topFolders: [], languages: [] },
  };
}

test('finds files by path keyword', () => {
  const result = askArchitecture({ question: 'auth', data: makeResult() });
  expect(result.files.some(f => f.path.includes('auth'))).toBe(true);
});

test('answers highest complexity query', () => {
  const result = askArchitecture({ question: 'highest complexity', data: makeResult() });
  expect(result.files[0].path).toBe('src/auth/session.ts');
});

test('answers security issues query', () => {
  const result = askArchitecture({ question: 'security issues', data: makeResult() });
  expect(result.security.length).toBeGreaterThan(0);
});

test('answers blast radius query with dependents', () => {
  const result = askArchitecture({ question: 'blast radius of session.ts', data: makeResult() });
  expect(result.files.some(f => f.path.includes('session'))).toBe(true);
  expect(result.dependents).toBeDefined();
});

test('returns empty results for no match gracefully', () => {
  const result = askArchitecture({ question: 'xyznonexistent', data: makeResult() });
  expect(result.files).toHaveLength(0);
  expect(result.answer).toBeTruthy();
});

test('answers layer query', () => {
  const result = askArchitecture({ question: 'files in services layer', data: makeResult() });
  expect(result.files.every(f => f.layer === 'services')).toBe(true);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd mcp && npm test -- --testPathPattern="ask.test" 2>&1 | tail -5
```
Expected: `Cannot find module '../src/ask.js'`

- [ ] **Step 3: Create `mcp/src/ask.ts`**

```typescript
import type { AnalysisResult, AnalyzedFile, SecurityIssue } from './types.js';

export interface AskResult {
  question: string;
  intent: string;
  files: Array<{ path: string; layer: string; complexity: number; grade: string; lines: number; coupling: number }>;
  functions: Array<{ name: string; file: string; line: number }>;
  security: SecurityIssue[];
  dependents?: string[];
  dependencies?: string[];
  answer: string;
}

export interface AskOpts {
  question: string;
  data: AnalysisResult;
  limit?: number;
}

function complexityGrade(c: number): string {
  if (c >= 30) return 'F';
  if (c >= 20) return 'D';
  if (c >= 10) return 'C';
  if (c >= 5) return 'B';
  return 'A';
}

function couplingIn(data: AnalysisResult, filePath: string): number {
  return data.connections.filter(c => c.target === filePath).length;
}

function toFileRow(f: AnalyzedFile, data: AnalysisResult) {
  const c = f.complexity ?? 1;
  return { path: f.path, layer: f.layer, complexity: c, grade: complexityGrade(c), lines: f.lines, coupling: couplingIn(data, f.path) };
}

export function askArchitecture(opts: AskOpts): AskResult {
  const { question, data, limit = 15 } = opts;
  const q = question.toLowerCase();

  // Detect intent
  const isComplexity = /complex|complexit|hardest|difficult/.test(q);
  const isCoupling = /coupling|coupled|depend|fan.?in|most used/.test(q);
  const isSecurity = /security|secur|vulnerab|secret|injection|xss|sqli/.test(q);
  const isBlastRadius = /blast.?radius|impact|break|change|touch|edit/.test(q);
  const isLayer = /layer|services|routes|models|utils|controllers|components/.test(q);
  const isGradeFilter = /grade [d-f]|unhealthy|worst|bad/.test(q);
  const isChurn = /churn|most changed|frequent/.test(q);
  const isCycles = /cycl|circular|circular dep/.test(q);
  const isFunctions = /function|method|def/.test(q);

  let files: AskResult['files'] = [];
  let security: SecurityIssue[] = [];
  let functions: AskResult['functions'] = [];
  let dependents: string[] | undefined;
  let dependencies: string[] | undefined;
  let intent = 'keyword search';
  let answer = '';

  if (isSecurity) {
    intent = 'security findings';
    // Find file keyword if present
    const fileHint = q.match(/(?:in|of|for)\s+([\w./]+)/)?.[1];
    security = fileHint
      ? data.security.filter(s => s.file.toLowerCase().includes(fileHint))
      : data.security;
    files = [...new Set(security.map(s => s.file))].slice(0, limit).map(fp => {
      const f = data.files.find(x => x.path === fp);
      return f ? toFileRow(f, data) : { path: fp, layer: 'unknown', complexity: 0, grade: '?', lines: 0, coupling: 0 };
    });
    answer = security.length > 0
      ? `Found ${security.length} security issue(s) across ${files.length} file(s).`
      : 'No security issues found.';

  } else if (isBlastRadius) {
    intent = 'blast radius';
    const fileHint = q.match(/(?:of|for|in)\s+([\w./]+)/)?.[1] ?? '';
    const target = data.files.find(f => f.path.toLowerCase().includes(fileHint.toLowerCase()) || f.name.toLowerCase().includes(fileHint.toLowerCase()));
    if (target) {
      dependents = data.connections.filter(c => c.target === target.path).map(c => c.source);
      dependencies = data.connections.filter(c => c.source === target.path).map(c => c.target);
      files = [toFileRow(target, data)];
      answer = `${target.path} has ${dependents.length} dependent(s). Changes here affect: ${dependents.slice(0, 5).join(', ')}${dependents.length > 5 ? '...' : ''}`;
    } else {
      answer = `No file matching "${fileHint}" found.`;
    }

  } else if (isComplexity) {
    intent = 'highest complexity';
    files = [...data.files]
      .filter(f => f.isCode)
      .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
      .slice(0, limit)
      .map(f => toFileRow(f, data));
    answer = `Top ${files.length} most complex files. Highest: ${files[0]?.path ?? 'none'} (complexity ${files[0]?.complexity ?? 0}, grade ${files[0]?.grade ?? '?'}).`;

  } else if (isCoupling) {
    intent = 'highest coupling';
    const inMap = new Map<string, number>();
    for (const conn of data.connections) inMap.set(conn.target, (inMap.get(conn.target) ?? 0) + 1);
    files = [...data.files]
      .filter(f => f.isCode)
      .sort((a, b) => (inMap.get(b.path) ?? 0) - (inMap.get(a.path) ?? 0))
      .slice(0, limit)
      .map(f => toFileRow(f, data));
    answer = `Top ${files.length} most depended-on files. Most coupled: ${files[0]?.path ?? 'none'} (${files[0]?.coupling ?? 0} dependents).`;

  } else if (isLayer) {
    intent = 'layer filter';
    const layerHint = q.match(/\b(services?|routes?|models?|utils?|controllers?|components?|types?|config)\b/)?.[1] ?? '';
    files = data.files
      .filter(f => f.layer.toLowerCase().includes(layerHint.toLowerCase()))
      .slice(0, limit)
      .map(f => toFileRow(f, data));
    answer = `Found ${files.length} file(s) in layer matching "${layerHint}".`;

  } else if (isGradeFilter) {
    intent = 'grade filter';
    const gradeHint = q.match(/grade ([d-f])/i)?.[1]?.toUpperCase() ?? 'D';
    const badGrades = gradeHint === 'F' ? ['F'] : gradeHint === 'E' ? ['F', 'E'] : ['D', 'F'];
    files = data.files
      .filter(f => badGrades.includes(complexityGrade(f.complexity ?? 1)))
      .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
      .slice(0, limit)
      .map(f => toFileRow(f, data));
    answer = `Found ${files.length} file(s) with grade ${gradeHint} or worse.`;

  } else if (isChurn) {
    intent = 'highest churn';
    files = [...data.files]
      .filter(f => f.isCode)
      .sort((a, b) => b.churn - a.churn)
      .slice(0, limit)
      .map(f => toFileRow(f, data));
    answer = `Top ${files.length} most frequently changed files.`;

  } else if (isCycles) {
    intent = 'circular dependencies';
    const cycleFiles = new Set((data as any).cycles?.flat() ?? []);
    files = data.files.filter(f => cycleFiles.has(f.path)).slice(0, limit).map(f => toFileRow(f, data));
    answer = data.summary.circularDepCount > 0
      ? `Found ${data.summary.circularDepCount} circular dependency chain(s) involving ${files.length} file(s).`
      : 'No circular dependencies detected.';

  } else {
    // Keyword search on paths + function names
    intent = 'keyword search';
    const keywords = q.split(/\s+/).filter(k => k.length > 2);
    if (keywords.length === 0) {
      answer = 'No keywords found in question.';
    } else {
      const matchedFiles = data.files.filter(f =>
        keywords.some(k => f.path.toLowerCase().includes(k) || f.layer.toLowerCase().includes(k))
      ).slice(0, limit).map(f => toFileRow(f, data));
      const matchedFns = data.files.flatMap(f =>
        f.functions.filter(fn => keywords.some(k => fn.name.toLowerCase().includes(k))).map(fn => ({ name: fn.name, file: f.path, line: fn.line }))
      ).slice(0, 20);
      files = matchedFiles;
      functions = matchedFns;
      answer = files.length > 0 || functions.length > 0
        ? `Found ${files.length} file(s) and ${functions.length} function(s) matching "${q}".`
        : `No results found for "${q}". Try: "highest complexity", "security issues", "blast radius of <file>", "files in services".`;
    }
  }

  return { question, intent, files, functions, security, dependents, dependencies, answer };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd mcp && npm test -- --testPathPattern="ask.test" 2>&1 | tail -5
```
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add mcp/src/ask.ts mcp/tests/ask.test.ts
git commit -m "feat: add askArchitecture keyword search engine with health-aware ranking"
```

---

### Task 11: grasp_ask MCP tool

**Files:**
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Add import and tool**

Add import at top of `index.ts`:
```typescript
import { askArchitecture } from './ask.js';
```

Add tool after `grasp_context`:

```typescript
// =====================================================================
// TOOL: grasp_ask
// =====================================================================
server.registerTool(
  'grasp_ask',
  {
    title: 'Ask Grasp — Architectural Q&A',
    description: `Ask architectural questions about a codebase in plain English. Returns health-aware answers unique to Grasp — complexity grades, blast radii, coupling data, and security findings alongside structural answers.

Example questions:
  - "Which files have the highest complexity?"
  - "What is the blast radius of src/auth/session.ts?"
  - "Which files have security issues?"
  - "Show me the most coupled files"
  - "What's in the services layer?"
  - "Which files have grade D or F?"
  - "Most frequently changed files"

Parameters:
  question  — plain English question about the codebase architecture
  session_id — active analysis session (from grasp_analyze)
  repo_source — optional: use indexed Brain data instead of session`,
    inputSchema: z.object({
      question: z.string().describe('Plain English architectural question'),
      session_id: z.string().optional().describe('Session ID from grasp_analyze'),
      repo_source: z.string().optional().describe('Repo source for Brain lookup (alternative to session_id)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 15)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ question, session_id, repo_source, limit }) => {
    let data: AnalysisResult | null = null;

    if (session_id) {
      data = await getSession(session_id);
      if (!data) return { content: [{ type: 'text', text: `Session "${session_id}" not found. Run grasp_analyze first.` }] };
    } else if (repo_source) {
      const rep = brainStore.getRepo(repo_source);
      if (!rep) return { content: [{ type: 'text', text: `Repo "${repo_source}" not in Brain. Run grasp_brain_index first.` }] };
      // Fetch the full session for ask to use
      data = await getSession(rep.sessionId);
      if (!data) return { content: [{ type: 'text', text: `Session for "${repo_source}" expired. Re-run grasp_brain_index.` }] };
    } else {
      return { content: [{ type: 'text', text: 'Provide session_id or repo_source.' }] };
    }

    const result = askArchitecture({ question, data, limit });
    const output = {
      question: result.question,
      intent: result.intent,
      answer: result.answer,
      files: result.files,
      functions: result.functions.slice(0, 20),
      security: result.security.slice(0, 10),
      ...(result.dependents !== undefined ? { dependents: result.dependents, dependencies: result.dependencies } : {}),
    };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }], structuredContent: output };
  }
);
```

- [ ] **Step 2: Build + typecheck**

```bash
cd mcp && npm run build 2>&1 | tail -5 && ./node_modules/.bin/tsc --noEmit -p tsconfig.check.json 2>&1 | head -10
```
Expected: 0 errors

- [ ] **Step 3: Run full test suite**

```bash
cd mcp && npm test 2>&1 | tail -10
```
Expected: All passing, no new failures

- [ ] **Step 4: Commit**

```bash
git add mcp/src/index.ts
git commit -m "feat: add grasp_ask MCP tool for health-aware architectural Q&A"
```

---

### Task 12: Browser chat panel

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the section where the health score card ends in `index.html`**

```bash
grep -n "Ask Grasp\|askPanel\|chat.*panel\|🤔\|brain.*ask" index.html | head -5
```
Expected: no results (not yet added)

Confirm target insertion: find where the main toolbar/header buttons are:
```bash
grep -n "Analyze\|grasp-btn\|header-actions\|toolbar" index.html | head -10
```

- [ ] **Step 2: Add browser-side `askGrasp()` function**

Find the line `var GraspDB={` (line ~3898 after our edits) and insert **before** it:

```javascript
// =====================================================================
// Grasp Ask — browser-side keyword search (no server needed)
// =====================================================================
function askGraspLocal(question, data) {
    var q = question.toLowerCase();
    var isComplexity = /complex|hardest|difficult/.test(q);
    var isCoupling = /coupling|coupled|depend|most used/.test(q);
    var isSecurity = /security|vulnerab|secret/.test(q);
    var isLayer = /layer|services|routes|models|utils|controllers|components/.test(q);
    var isChurn = /churn|most changed/.test(q);
    var isGrade = /grade [d-f]|unhealthy|worst/.test(q);

    var couplingIn = {};
    (data.connections||[]).forEach(function(c){ couplingIn[c.to]=(couplingIn[c.to]||0)+1; });

    function grade(c){ return c>=30?'F':c>=20?'D':c>=10?'C':c>=5?'B':'A'; }
    function fileRow(f){ return {path:f.path,layer:f.layer,complexity:f.complexity||0,grade:grade(f.complexity||0),coupling:couplingIn[f.path]||0}; }

    var files=[], answer='', security=[];

    if(isSecurity){
        security=(data.security||[]);
        var secFiles=new Set(security.map(function(s){return s.file;}));
        files=(data.files||[]).filter(function(f){return secFiles.has(f.path);}).map(fileRow);
        answer='Found '+security.length+' security issue(s) in '+files.length+' file(s).';
    } else if(isComplexity){
        files=[].concat(data.files||[]).filter(function(f){return f.isCode;}).sort(function(a,b){return (b.complexity||0)-(a.complexity||0);}).slice(0,12).map(fileRow);
        answer='Top '+files.length+' most complex files. Highest: '+(files[0]?files[0].path+' (complexity '+files[0].complexity+', grade '+files[0].grade+')':'none');
    } else if(isCoupling){
        files=[].concat(data.files||[]).filter(function(f){return f.isCode;}).sort(function(a,b){return (couplingIn[b.path]||0)-(couplingIn[a.path]||0);}).slice(0,12).map(fileRow);
        answer='Top '+files.length+' most depended-on files.';
    } else if(isLayer){
        var lm=q.match(/\b(services?|routes?|models?|utils?|controllers?|components?)\b/);
        var lhint=lm?lm[1]:'';
        files=(data.files||[]).filter(function(f){return f.layer&&f.layer.toLowerCase().includes(lhint);}).slice(0,12).map(fileRow);
        answer='Found '+files.length+' file(s) in layer "'+lhint+'".';
    } else if(isChurn){
        files=[].concat(data.files||[]).filter(function(f){return f.isCode;}).sort(function(a,b){return (b.churn||0)-(a.churn||0);}).slice(0,12).map(fileRow);
        answer='Top '+files.length+' most frequently changed files.';
    } else if(isGrade){
        files=(data.files||[]).filter(function(f){return ['D','F'].includes(grade(f.complexity||0));}).sort(function(a,b){return (b.complexity||0)-(a.complexity||0);}).slice(0,12).map(fileRow);
        answer='Found '+files.length+' file(s) with grade D or F.';
    } else {
        var kws=q.split(/\s+/).filter(function(k){return k.length>2;});
        files=(data.files||[]).filter(function(f){return kws.some(function(k){return f.path.toLowerCase().includes(k)||f.layer.toLowerCase().includes(k);});}).slice(0,12).map(fileRow);
        answer=files.length>0?'Found '+files.length+' file(s) matching "'+question+'".':'No results for "'+question+'". Try: "highest complexity", "security issues", "files in services", "most coupled".';
    }
    return {answer:answer,files:files,security:security.slice(0,8)};
}
```

- [ ] **Step 3: Add Ask Grasp panel UI component**

Find `React.createElement('div',{id:'app'},` and locate where the main action buttons are rendered — search for `'Analyze'` button rendering in the React component. Add an Ask button and panel.

Find the pattern near the Analyze button (search for `analyzeRepo` in the React component around line ~9200):

```bash
grep -n "analyzeRepo\|onAnalyze\|btn.*Analyz" index.html | head -10
```

Find the main app state management section where `useState` hooks are declared (search for `useState(false)` or `useState('')`):

```bash
grep -n "useState(false)\|useState('')\|useState(null)" index.html | head -10
```

Add the Ask panel after the existing health score section. Find the line with `health-grade-letter` rendering inside the right panel, and after the closing `)` of that section's `createElement` chain, add:

```javascript
// Ask Grasp panel — add as a sibling element in the right column
React.createElement('div',{className:'ask-grasp-panel',style:{marginTop:12,background:'var(--bg2)',borderRadius:8,padding:12,border:'1px solid var(--border)'}},
    React.createElement('div',{style:{fontSize:11,fontWeight:600,color:'var(--acc)',marginBottom:8}},'🔍 Ask Grasp'),
    React.createElement('div',{style:{display:'flex',gap:6}},
        React.createElement('input',{
            id:'ask-grasp-input',
            placeholder:'highest complexity, security issues, blast radius of...',
            style:{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:4,padding:'4px 8px',fontSize:11,color:'var(--t1)',outline:'none'},
            onKeyDown:function(e){
                if(e.key==='Enter'){
                    var inp=document.getElementById('ask-grasp-input');
                    if(!inp||!data)return;
                    var res=askGraspLocal(inp.value,data);
                    var out=document.getElementById('ask-grasp-output');
                    if(!out)return;
                    var html='<div style="font-size:11px;color:var(--t2);margin-bottom:6px">'+res.answer+'</div>';
                    if(res.files.length>0){
                        html+='<table style="width:100%;font-size:10px;border-collapse:collapse">';
                        html+='<tr style="color:var(--t3)"><th style="text-align:left">File</th><th>Grade</th><th>Complexity</th><th>Coupling</th></tr>';
                        res.files.slice(0,8).forEach(function(f){
                            var gc=f.grade==='A'||f.grade==='B'?'#4caf50':f.grade==='C'?'#ff9800':f.grade==='D'?'#f44336':'#9c27b0';
                            html+='<tr><td style="color:var(--t1);padding:2px 0">'+f.path.split('/').slice(-2).join('/')+'</td><td style="color:'+gc+';font-weight:600;text-align:center">'+f.grade+'</td><td style="text-align:center;color:var(--t2)">'+f.complexity+'</td><td style="text-align:center;color:var(--t2)">'+f.coupling+'</td></tr>';
                        });
                        html+='</table>';
                    }
                    if(res.security.length>0){
                        html+='<div style="margin-top:6px;font-size:10px;color:#f44336">'+res.security.slice(0,4).map(function(s){return '⚠ ['+s.severity+'] '+s.file.split('/').pop()+': '+s.desc;}).join('<br>')+'</div>';
                    }
                    out.innerHTML=html;
                }
            }
        }),
        React.createElement('button',{
            style:{background:'var(--acc)',color:'#fff',border:'none',borderRadius:4,padding:'4px 10px',fontSize:11,cursor:'pointer'},
            onClick:function(){
                var inp=document.getElementById('ask-grasp-input');
                if(inp)inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
            }
        },'Ask')
    ),
    React.createElement('div',{id:'ask-grasp-output',style:{marginTop:8,maxHeight:200,overflowY:'auto'}})
)
```

> **Note:** This must be inserted inside the already-rendered data panel, not at the top level. Find where the right-side health card is rendered (`health-grade-letter`) and add the Ask panel as a sibling after the health card's closing element. The exact insertion point depends on the current index.html structure — search for the closing of the health card panel and add after it.

- [ ] **Step 4: Verify the app still loads**

```bash
grep -n "askGraspLocal\|ask-grasp-panel" index.html
```
Expected: both strings found

Open the app in a browser:
```bash
node mcp/dist/cli.js . --no-open 2>&1 &
sleep 2 && curl -s http://localhost:7331 | grep -c "ask-grasp"
```
Expected: `2` or more

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add Ask Grasp browser chat panel with keyword search"
```

---

## Phase 6: Integration + Release

### Task 13: Run full suite + version bump

**Files:**
- Modify: all version files (per CLAUDE.md checklist)

- [ ] **Step 1: Run full test suite**

```bash
cd mcp && npm test 2>&1 | tail -15
```
Expected: All existing tests passing + new brain/setup/arch-diff/ask tests (12+ new tests)

- [ ] **Step 2: Full typecheck**

```bash
cd mcp && ./node_modules/.bin/tsc --noEmit -p tsconfig.check.json 2>&1
```
Expected: 0 errors

- [ ] **Step 3: Build**

```bash
cd mcp && npm run build 2>&1 | tail -5
```
Expected: success

- [ ] **Step 4: Update README and CHANGELOG**

In `README.md`, update the tech stack / features section to include:
- `grasp index <path>` — index any local repo into persistent Brain
- `grasp setup` — writes Claude Code / Cursor hooks + CLAUDE.md with health context
- `grasp diff <branch>` — architectural health diff vs any git branch
- `grasp daemon <path>` — live file watcher that keeps Brain fresh
- `grasp_ask` / `grasp_context` — health-aware architectural Q&A
- Browser Ask Grasp panel — search architecture directly in the UI

In `CHANGELOG.md`, prepend a `[3.10.0]` section:
```markdown
## [3.10.0] — 2026-04-24

### Added
- **Grasp Brain** — persistent structured SQLite index (`~/.grasp/brain.db`) for instant offline queries
- **`grasp index <path>`** — CLI subcommand to index any local repo into Brain
- **`grasp setup`** — writes Claude Code/Cursor/Windsurf hooks + health-aware `CLAUDE.md`/`AGENTS.md`
- **`grasp diff <branch>`** — architectural health diff: detects grade-worsened files, new security findings, health delta vs any git branch
- **`grasp daemon <path>`** — live file-system watcher that keeps Brain fresh; optional `--git-hook` flag installs post-commit auto-reindex
- **`grasp context <file>`** — CLI subcommand: prints health grade, complexity, blast radius for any indexed file
- **`grasp_brain_index`** MCP tool — index a repo into Brain from any AI agent
- **`grasp_brain_status`** MCP tool — list all indexed repos with health grades
- **`grasp_context`** MCP tool — health context for a file; used as PreToolUse hook for Claude Code/Cursor
- **`grasp_arch_diff`** MCP tool — health-aware diff between two analysis sessions
- **`grasp_ask`** MCP tool — plain-English architectural Q&A with health-ranked answers
- **Browser Ask Grasp panel** — inline search panel in the web UI; answers complexity/security/coupling/layer questions from live analysis data
```

- [ ] **Step 5: Bump version to 3.10.0**

Per CLAUDE.md checklist — all version files must be updated. Run:

```bash
node -e "
const fs = require('fs');
const files = [
  'mcp/package.json',
  'browser-extension/package.json',
  'vscode-extension/package.json',
];
files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
  if (f.includes('vscode')) return; // vscode: only own version, not dep pin
  d.version = '3.10.0';
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
});
console.log('done');
"
```

Then manually update:
- `mcp/server.json` — two occurrences of version
- `docker/Dockerfile` — `grasp-mcp-server@3.10.0`
- `index.html` — two occurrences of `GRASP_VERSION`
- `team-dashboard.html` — `GRASP_VERSION`
- All integration package.json files per the CLAUDE.md checklist

- [ ] **Step 6: Commit + tag**

```bash
git add -A
git commit -m "feat: Grasp Intelligence Platform v3.10.0 — Brain, Setup, Diff, Daemon, Ask"
git tag v3.10.0
git push origin main
git push origin v3.10.0
```

---

## Self-Review

**Spec coverage check:**

| Feature | Tasks | Status |
|---------|-------|--------|
| Grasp Brain (persistent index) | 1, 2, 3, 4, 5 | ✅ |
| Grasp Setup (hooks + CLAUDE.md) | 6, 7 | ✅ |
| grasp setup CLI | 7 | ✅ |
| Grasp Diff (arch health diff) | 8 | ✅ |
| Grasp Daemon (live re-index) | 9 | ✅ |
| Grasp Ask (Q&A) | 10, 11 | ✅ |
| Browser chat panel | 12 | ✅ |
| Release | 13 | ✅ |

**Type consistency check:**

- `BrainStore.indexResult(result: AnalysisResult)` — `AnalysisResult` imported from `./types.js` ✅
- `computeArchDiff(baseline, current: AnalysisResult)` — same type ✅
- `askArchitecture({ question, data: AnalysisResult })` — same type ✅
- `gradeColour(g: string)` — already exists in cli.ts ✅
- `parseSource` — imported from `./analyzer.js` in cli.ts ✅
- `getSession` — already defined in index.ts ✅
- `brainStore` — added at module level in index.ts Task 3 ✅
- `AnalysisResult.security` is `SecurityIssue[]` — used correctly in arch-diff.ts ✅
- `Connection.target` / `Connection.source` — used correctly (not `.to`/`.from` — double-check: `types.ts` line 39-42 shows `source` and `target`) ✅

**Placeholder scan:** No TBDs, no "implement later", all steps have code. ✅
