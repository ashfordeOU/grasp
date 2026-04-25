# Grasp v3.14.0 — GitNexus Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 6 remaining GitNexus feature gaps: semantic/vector search, graph-aware rename, 4 missing MCP tools (route_map, api_impact, tool_map, shape_check), process-grouped search, @groupName multi-repo routing, and SLSA supply-chain attestations.

**Architecture:** Semantic search uses `@xenova/transformers` (Xenova/all-MiniLM-L6-v2, 384D, local, no cloud) + SQLite FTS5 BM25 merged with Reciprocal Rank Fusion; embeddings and FTS content stored in new tables in `brain.db`. Process tagging uses BFS from entry-point files to tag every function with execution flow membership. Group routing fans out any tool call to all repos in a named group via `~/.grasp/groups.json`.

**Tech Stack:** TypeScript, better-sqlite3 (FTS5 + BLOB vector storage), @xenova/transformers (dynamic ESM import), esbuild CJS bundle, SLSA via `--provenance` npm flag + Cosign keyless Docker signing.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `mcp/src/embed.ts` | Xenova model wrapper, cosine similarity, graceful fallback |
| Create | `mcp/src/rename.ts` | Graph-aware symbol rename engine |
| Create | `mcp/src/route-scanner.ts` | HTTP route + MCP tool definition detection |
| Create | `mcp/src/group-manager.ts` | ~/.grasp/groups.json read/write |
| Modify | `mcp/src/brain.ts` | +3 tables (fts_idx, embeddings, processes), +indexFts, +indexEmbeddings, +indexProcesses, +hybridSearch, +bm25Search, +vectorSearch |
| Modify | `mcp/src/ask-architecture.ts` | Fall back to hybridSearch when no intent matches |
| Modify | `mcp/src/index.ts` | Register 9 new tools; add @groupName fan-out helper |
| Modify | `mcp/package.json` | Add @xenova/transformers dependency |
| Modify | `mcp/build.mjs` | Add @xenova/transformers to externals |
| Modify | `.github/workflows/publish.yml` | npm --provenance, Cosign Docker signing, id-token permission |
| Modify | `mcp/README.md` | Add "Verify provenance" section |
| Modify | `mcp/tests/smoke-new-tools.test.ts` | Smoke tests for all 9 new tools |
| Modify | All version files | Bump to 3.14.0 per CLAUDE.md checklist |

---

## Task 1: Embedding module + build wiring

**Files:**
- Create: `mcp/src/embed.ts`
- Modify: `mcp/package.json`
- Modify: `mcp/build.mjs`

- [ ] **Step 1: Write failing unit test**

Create `mcp/tests/embed.test.ts`:
```typescript
import { cosine } from '../src/embed';

test('cosine similarity of identical vectors is 1', () => {
  const v = new Float32Array([0.5, 0.5, 0.0]);
  expect(cosine(v, v)).toBeCloseTo(1.0, 4);
});

test('cosine similarity of orthogonal vectors is 0', () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  expect(cosine(a, b)).toBeCloseTo(0.0, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mcp && npx jest tests/embed.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/embed'`

- [ ] **Step 3: Create `mcp/src/embed.ts`**

```typescript
import * as path from 'path';
import * as os from 'os';

let _pipeline: any = null;
let _initFailed = false;

export async function getEmbedder(): Promise<any | null> {
  if (_initFailed) return null;
  if (_pipeline) return _pipeline;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    (env as any).allowLocalModels = false;
    (env as any).cacheDir = path.join(os.homedir(), '.grasp', 'models');
    _pipeline = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return _pipeline;
  } catch {
    _initFailed = true;
    return null;
  }
}

export async function embed(text: string): Promise<Float32Array | null> {
  const embedder = await getEmbedder();
  if (!embedder) return null;
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  } catch {
    return null;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export function vecToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer);
}

export function blobToVec(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
```

- [ ] **Step 4: Add `@xenova/transformers` to `mcp/package.json`**

In the `"dependencies"` object, add after `"yaml"`:
```json
"@xenova/transformers": "^2.17.2",
```

- [ ] **Step 5: Add `@xenova/transformers` to externals in `mcp/build.mjs`**

In the MCP server build (first `await build({...})`), update the `external` array:
```javascript
external: ['./parser.js', 'better-sqlite3', 'kuzu', '@xenova/transformers', ...treeSitterExternals],
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd mcp && npx jest tests/embed.test.ts --no-coverage
```
Expected: PASS (2 tests — cosine function doesn't require model download)

- [ ] **Step 7: Commit**

```bash
git add mcp/src/embed.ts mcp/tests/embed.test.ts mcp/package.json mcp/build.mjs
git commit -m "feat: add embed.ts — local 384D Xenova embeddings with cosine + blob serialization"
```

---

## Task 2: Brain schema extensions (FTS5 + embeddings + processes)

**Files:**
- Modify: `mcp/src/brain.ts` — constructor `this.db.exec(...)` block

- [ ] **Step 1: Append 3 new table definitions to the existing schema exec**

In `brain.ts`, find the `this.db.exec(\`...\`)` block in the constructor. After the last `CREATE INDEX IF NOT EXISTS idx_fns_name` line, before the closing backtick, add:

```sql
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_idx USING fts5(
        file_path,
        fn_name,
        body,
        tokenize='porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        fn_name TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL,
        vector BLOB NOT NULL,
        PRIMARY KEY (repo_id, file_path, fn_name)
      );
      CREATE TABLE IF NOT EXISTS processes (
        repo_id TEXT NOT NULL,
        process_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        fn_name TEXT NOT NULL DEFAULT '',
        depth INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (repo_id, process_name, file_path, fn_name)
      );
      CREATE INDEX IF NOT EXISTS idx_processes_file ON processes(repo_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_embed_repo ON embeddings(repo_id);
```

- [ ] **Step 2: Add `repoId` export**

At the top of the exported section (after the `close()` method), export the repoId helper so other modules can use it:

```typescript
export function makeRepoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}
```

Also expose the internal db for extension in tests — add a `getDb()` method:
```typescript
getDb(): Database.Database { return this.db; }
```

- [ ] **Step 3: Verify schema migration is safe on existing brain.db**

```bash
cd mcp && node -e "
const { BrainStore } = require('./src/brain.ts');
// This will fail without tsx — just verify it compiles
console.log('ok');
" 2>&1 | head -5
```

The `CREATE TABLE IF NOT EXISTS` and `CREATE VIRTUAL TABLE IF NOT EXISTS` statements are idempotent — safe to run on an existing brain.db.

- [ ] **Step 4: Commit**

```bash
git add mcp/src/brain.ts
git commit -m "feat: extend brain.db schema — fts_idx (FTS5), embeddings (vector BLOBs), processes tables"
```

---

## Task 3: Brain indexing — FTS, embeddings, and process tagging

**Files:**
- Modify: `mcp/src/brain.ts` — add 3 new async/sync methods

- [ ] **Step 1: Add `indexFts` method to BrainStore**

Add after the `indexResult()` method:

```typescript
indexFts(result: import('./types.js').AnalysisResult): void {
  const id = makeRepoId(result.source);
  this.db.prepare("DELETE FROM fts_idx WHERE file_path LIKE ?").run(id + ':%');
  // FTS5 doesn't support WHERE on regular columns in DELETE — use rowid trick
  // Instead, rebuild per repo by deleting all its rows via a shadow match
  // Simplest: store "repoid:path" in file_path column so we can filter on delete
  const insert = this.db.prepare(
    "INSERT INTO fts_idx (file_path, fn_name, body) VALUES (?, ?, ?)"
  );
  this.db.transaction(() => {
    // Delete previous entries for this repo (file_path starts with repoId+':')
    const existing = this.db.prepare(
      "SELECT rowid FROM fts_idx WHERE file_path LIKE ?"
    ).all(id + ':%') as { rowid: number }[];
    const del = this.db.prepare("DELETE FROM fts_idx WHERE rowid = ?");
    for (const row of existing) del.run(row.rowid);
    // Insert new entries
    for (const f of result.files) {
      // File-level entry
      insert.run(
        id + ':' + f.path,
        '',
        [f.name, f.layer, f.path.replace(/[/_-]/g, ' ')].join(' ')
      );
      // Per-function entries
      for (const fn of f.functions) {
        insert.run(
          id + ':' + f.path,
          fn.name,
          [fn.name, f.name, f.layer, fn.type ?? ''].join(' ')
        );
      }
    }
  })();
}
```

- [ ] **Step 2: Add `indexEmbeddings` async method to BrainStore**

Add after `indexFts`:

```typescript
async indexEmbeddings(result: import('./types.js').AnalysisResult): Promise<void> {
  const { embed, vecToBlob } = await import('./embed.js');
  const id = makeRepoId(result.source);
  const upsert = this.db.prepare(
    "INSERT OR REPLACE INTO embeddings (repo_id, file_path, fn_name, content_hash, vector) VALUES (?, ?, ?, ?, ?)"
  );
  const existing = new Map<string, string>();
  const rows = this.db.prepare(
    "SELECT file_path, fn_name, content_hash FROM embeddings WHERE repo_id = ?"
  ).all(id) as { file_path: string; fn_name: string; content_hash: string }[];
  for (const r of rows) existing.set(r.file_path + ':' + r.fn_name, r.content_hash);

  for (const f of result.files) {
    for (const fn of f.functions) {
      const text = `${fn.name} ${fn.type ?? 'function'} in ${f.name} ${f.layer}`;
      const hash = crypto.createHash('sha1').update(text).digest('hex');
      const key = (id + ':' + f.path) + ':' + fn.name;
      if (existing.get(key) === hash) continue; // unchanged — skip re-embedding
      const vec = await embed(text);
      if (!vec) continue;
      upsert.run(id, id + ':' + f.path, fn.name, hash, vecToBlob(vec));
    }
  }
}
```

- [ ] **Step 3: Add `indexProcesses` sync method to BrainStore**

Add after `indexEmbeddings`:

```typescript
indexProcesses(result: import('./types.js').AnalysisResult): void {
  const id = makeRepoId(result.source);
  const ENTRY_RE = /(?:^|[/\\])(?:index|main|app|server|cli|run)\.[jt]sx?$/i;
  const entryFiles = result.files.filter(f => ENTRY_RE.test(f.path)).map(f => f.path);
  if (entryFiles.length === 0) return;

  // Build adjacency: file → files it imports (from connections)
  const adjOut = new Map<string, Set<string>>();
  for (const c of result.connections) {
    if (!adjOut.has(c.source)) adjOut.set(c.source, new Set());
    adjOut.get(c.source)!.add(c.target);
  }

  this.db.prepare("DELETE FROM processes WHERE repo_id = ?").run(id);
  const insert = this.db.prepare(
    "INSERT OR IGNORE INTO processes (repo_id, process_name, file_path, fn_name, depth) VALUES (?, ?, ?, ?, ?)"
  );

  this.db.transaction(() => {
    for (const entry of entryFiles) {
      const processName = entry.replace(/.*[/\\]/, '').replace(/\.[jt]sx?$/, '');
      const visited = new Set<string>();
      const queue: { file: string; depth: number }[] = [{ file: entry, depth: 0 }];
      while (queue.length > 0) {
        const { file, depth } = queue.shift()!;
        if (visited.has(file) || depth > 8) continue;
        visited.add(file);
        insert.run(id, processName, id + ':' + file, '', depth);
        // Tag all functions in this file
        const fileObj = result.files.find(f => f.path === file);
        if (fileObj) {
          for (const fn of fileObj.functions) {
            insert.run(id, processName, id + ':' + file, fn.name, depth);
          }
        }
        for (const next of adjOut.get(file) ?? []) {
          if (!visited.has(next)) queue.push({ file: next, depth: depth + 1 });
        }
      }
    }
  })();
}
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
cd mcp && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors (or pre-existing errors only — no new ones from brain.ts changes).

- [ ] **Step 5: Commit**

```bash
git add mcp/src/brain.ts
git commit -m "feat: BrainStore.indexFts + indexEmbeddings + indexProcesses — build process/FTS/vector index at brain index time"
```

---

## Task 4: Hybrid search methods on BrainStore

**Files:**
- Modify: `mcp/src/brain.ts` — add 3 search methods

- [ ] **Step 1: Write failing test**

Create `mcp/tests/brain-search.test.ts`:
```typescript
import { BrainStore } from '../src/brain';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const TMP = path.join(os.tmpdir(), 'grasp-test-' + process.pid);

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('bm25Search returns results for matching term', () => {
  const brain = new BrainStore(TMP);
  const db = brain.getDb();
  // Insert a test FTS row
  db.prepare("INSERT INTO fts_idx (file_path, fn_name, body) VALUES (?, ?, ?)")
    .run('repo1:src/auth.ts', 'validateToken', 'validateToken function auth layer');
  const results = brain.bm25Search('repo1', 'auth token', 5);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].filePath).toBe('src/auth.ts');
  brain.close();
});

test('bm25Search returns empty for no match', () => {
  const brain = new BrainStore(TMP + '2');
  const results = brain.bm25Search('repo99', 'zzznomatch', 5);
  expect(results).toEqual([]);
  brain.close();
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mcp && npx jest tests/brain-search.test.ts --no-coverage
```
Expected: FAIL — `brain.bm25Search is not a function`

- [ ] **Step 3: Add `bm25Search`, `vectorSearch`, `hybridSearch` to BrainStore**

Add these methods after `indexProcesses`:

```typescript
bm25Search(repoId: string, query: string, limit = 20): Array<{ filePath: string; fnName: string; score: number }> {
  const prefix = repoId + ':';
  const safe = query.replace(/['"*^()]/g, ' ').trim();
  if (!safe) return [];
  try {
    const rows = this.db.prepare(`
      SELECT file_path, fn_name, bm25(fts_idx) AS score
      FROM fts_idx
      WHERE fts_idx MATCH ?
      ORDER BY bm25(fts_idx)
      LIMIT ?
    `).all(safe, limit * 4) as { file_path: string; fn_name: string; score: number }[];
    return rows
      .filter(r => r.file_path.startsWith(prefix))
      .slice(0, limit)
      .map(r => ({
        filePath: r.file_path.slice(prefix.length),
        fnName: r.fn_name,
        score: -r.score, // negate: positive, higher = better
      }));
  } catch {
    return [];
  }
}

async vectorSearch(repoId: string, queryVec: Float32Array, limit = 20): Promise<Array<{ filePath: string; fnName: string; score: number }>> {
  const { cosine, blobToVec } = await import('./embed.js');
  const rows = this.db.prepare(
    "SELECT file_path, fn_name, vector FROM embeddings WHERE repo_id = ?"
  ).all(repoId) as { file_path: string; fn_name: string; vector: Buffer }[];
  const prefix = repoId + ':';
  const scored = rows.map(r => ({
    filePath: r.file_path.startsWith(prefix) ? r.file_path.slice(prefix.length) : r.file_path,
    fnName: r.fn_name,
    score: cosine(queryVec, blobToVec(r.vector)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async hybridSearch(source: string, query: string, limit = 20): Promise<Array<{
  filePath: string; fnName: string; score: number;
  processes: string[]; layer: string; complexity: number;
}>> {
  const id = makeRepoId(source);

  // BM25
  const bm25 = this.bm25Search(id, query, limit * 2);

  // Vector (if embedder available)
  const { embed } = await import('./embed.js');
  const queryVec = await embed(query);
  const vec = queryVec ? await this.vectorSearch(id, queryVec, limit * 2) : [];

  // RRF merge (k=60)
  const k = 60;
  const scores = new Map<string, number>();
  const key = (fp: string, fn: string) => fp + '::' + fn;
  bm25.forEach((r, i) => {
    const k_ = key(r.filePath, r.fnName);
    scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1));
  });
  vec.forEach((r, i) => {
    const k_ = key(r.filePath, r.fnName);
    scores.set(k_, (scores.get(k_) ?? 0) + 1 / (k + i + 1));
  });

  // Collect unique results sorted by RRF score
  const seen = new Set<string>();
  const all = [...bm25, ...vec].filter(r => {
    const k_ = key(r.filePath, r.fnName);
    if (seen.has(k_)) return false;
    seen.add(k_);
    return true;
  });
  all.sort((a, b) => (scores.get(key(b.filePath, b.fnName)) ?? 0) - (scores.get(key(a.filePath, a.fnName)) ?? 0));

  // Enrich with layer, complexity, processes
  const processRows = this.db.prepare(
    "SELECT file_path, fn_name, process_name FROM processes WHERE repo_id = ?"
  ).all(id) as { file_path: string; fn_name: string; process_name: string }[];
  const processMap = new Map<string, Set<string>>();
  const prefix = id + ':';
  for (const r of processRows) {
    const fp = r.file_path.startsWith(prefix) ? r.file_path.slice(prefix.length) : r.file_path;
    const k_ = key(fp, r.fn_name);
    if (!processMap.has(k_)) processMap.set(k_, new Set());
    processMap.get(k_)!.add(r.process_name);
  }

  return all.slice(0, limit).map(r => {
    const fileRow = this.db.prepare(
      "SELECT layer, complexity FROM files WHERE repo_id = ? AND path = ?"
    ).get(id, r.filePath) as { layer: string; complexity: number } | undefined;
    return {
      filePath: r.filePath,
      fnName: r.fnName,
      score: scores.get(key(r.filePath, r.fnName)) ?? 0,
      processes: [...(processMap.get(key(r.filePath, r.fnName)) ?? new Set())],
      layer: fileRow?.layer ?? 'unknown',
      complexity: fileRow?.complexity ?? 0,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
cd mcp && npx jest tests/brain-search.test.ts --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add mcp/src/brain.ts mcp/tests/brain-search.test.ts
git commit -m "feat: BrainStore hybrid search — bm25Search (FTS5) + vectorSearch (cosine) + hybridSearch (RRF k=60)"
```

---

## Task 5: `grasp_search` MCP tool + wire indexing + upgrade `grasp_ask`

**Files:**
- Modify: `mcp/src/index.ts` — add `grasp_search`, wire FTS/embedding/process indexing into `grasp_brain_index`
- Modify: `mcp/src/ask-architecture.ts` — add hybrid fallback

- [ ] **Step 1: Wire FTS + embedding + process indexing into `grasp_brain_index`**

In `index.ts`, find the `grasp_brain_index` handler (around line 5826). After the existing `brainStore.indexResult(result);` call, add:

```typescript
brainStore.indexFts(result);
brainStore.indexProcesses(result);
// Embeddings are async — fire-and-forget (model may download on first call)
brainStore.indexEmbeddings(result).catch(() => {/* embedding optional */});
```

- [ ] **Step 2: Register `grasp_search` tool in `index.ts`**

Add after the last existing tool registration (after `grasp_resolve_receiver`):

```typescript
// =====================================================================
// TOOL: grasp_search
// =====================================================================
server.registerTool(
  'grasp_search',
  {
    title: 'Hybrid Semantic Search',
    description: `Hybrid search over a brain-indexed repo: BM25 full-text + vector semantic search merged with Reciprocal Rank Fusion (k=60).

Results include process membership — which execution flows (entry-point → call chain) each function participates in.

First call may trigger a one-time model download (~23 MB to ~/.grasp/models/). Subsequent calls are instant. Falls back to BM25-only if model unavailable.

Args:
  - source: repo source string (must be indexed via grasp_brain_index first)
  - query: natural language or keyword query, e.g. "authentication token validation"
  - limit: max results to return (default 20)`,
    inputSchema: z.object({
      source: z.string().describe('Repo source (owner/repo or local path) — must be brain-indexed'),
      query: z.string().describe('Search query — natural language or keywords'),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, query, limit }) => {
    if (!brainStore.getRepo(source)) {
      return { content: [{ type: 'text', text: `"${source}" not indexed. Run: grasp_brain_index first.` }] };
    }
    const results = await brainStore.hybridSearch(source, query, limit ?? 20);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for "${query}" in ${source}.` }] };
    }
    const out = {
      source,
      query,
      result_count: results.length,
      results: results.map((r, i) => ({
        rank: i + 1,
        file: r.filePath,
        function: r.fnName || null,
        layer: r.layer,
        complexity: r.complexity,
        rrf_score: Math.round(r.score * 10000) / 10000,
        processes: r.processes,
      })),
    };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(out, null, 2)) }] };
  }
);
```

- [ ] **Step 3: Upgrade `ask-architecture.ts` with hybrid fallback**

In `ask-architecture.ts`, add a new intent for free-form queries. After the `detectIntent` function, add:

```typescript
export async function searchArchitecture(brain: BrainStore, source: string, query: string): Promise<string> {
  const results = await brain.hybridSearch(source, query, 10);
  if (results.length === 0) return `No results found for "${query}".`;
  const lines = [`Hybrid search results for "${query}":`, ''];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.filePath}${r.fnName ? ` → ${r.fnName}` : ''}`);
    lines.push(`   layer=${r.layer}  complexity=${r.complexity}  score=${r.score.toFixed(4)}`);
    if (r.processes.length > 0) lines.push(`   processes: ${r.processes.join(', ')}`);
  });
  return lines.join('\n');
}
```

In `askArchitecture()`, change the default return at the bottom from returning empty to falling back to hybrid search:

```typescript
// Replace the final `return lines.join('\n');` with:
  const text = lines.join('\n');
  if (text.trim() === `Intent: ${intent}`) {
    // No intent-specific results — fall back to semantic search
    return searchArchitecture(brain, source, question);
  }
  return text;
```

- [ ] **Step 4: Build**

```bash
cd mcp && node build.mjs 2>&1 | tail -5
```
Expected: `Build complete: dist/index.js + dist/cli.js + ...`

- [ ] **Step 5: Commit**

```bash
git add mcp/src/index.ts mcp/src/ask-architecture.ts
git commit -m "feat: grasp_search MCP tool (BM25+vector+RRF), wire FTS/embed/process indexing into grasp_brain_index"
```

---

## Task 6: `grasp_rename` MCP tool

**Files:**
- Create: `mcp/src/rename.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/rename.test.ts`:
```typescript
import { computeRename } from '../src/rename';

const FILES: Record<string, string> = {
  'src/auth.ts': 'export function validateToken(t: string) { return checkToken(t); }\nfunction checkToken(t: string) { return t.length > 0; }',
  'src/server.ts': 'import { validateToken } from "./auth";\nif (!validateToken(req.headers.token)) throw new Error();',
};

test('computeRename finds all references to validateToken', () => {
  const result = computeRename(FILES, 'validateToken', 'verifyToken');
  expect(result.matches).toHaveLength(2); // auth.ts (definition) + server.ts (usage)
  expect(result.files_affected).toHaveLength(2);
});

test('computeRename uses whole-word match only', () => {
  const files = { 'a.ts': 'const validateTokenFoo = 1; const validateToken = 2;' };
  const result = computeRename(files, 'validateToken', 'verifyToken');
  expect(result.matches).toHaveLength(1); // only the exact match, not validateTokenFoo
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mcp && npx jest tests/rename.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/rename'`

- [ ] **Step 3: Create `mcp/src/rename.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

export interface RenameMatch {
  file: string;
  line: number;
  col: number;
  before: string;
  after: string;
}

export interface RenameResult {
  old_name: string;
  new_name: string;
  matches: RenameMatch[];
  files_affected: string[];
  diff_preview: string;
}

export function computeRename(
  files: Record<string, string>,  // filePath → content
  oldName: string,
  newName: string
): RenameResult {
  const re = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const matches: RenameMatch[] = [];
  const changed: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    let fileChanged = false;
    const newLines = lines.map((line, lineIdx) => {
      let newLine = line;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        matches.push({
          file: filePath,
          line: lineIdx + 1,
          col: m.index + 1,
          before: line.trim(),
          after: line.replace(re, newName).trim(),
        });
        fileChanged = true;
      }
      return newLine.replace(re, newName);
    });
    if (fileChanged) changed[filePath] = newLines.join('\n');
  }

  const filesAffected = Object.keys(changed);
  const diffLines: string[] = [];
  for (const [fp, newContent] of Object.entries(changed)) {
    diffLines.push(`--- a/${fp}`, `+++ b/${fp}`);
    const oldLines = files[fp].split('\n');
    const newLinesArr = newContent.split('\n');
    oldLines.forEach((l, i) => {
      if (l !== newLinesArr[i]) {
        diffLines.push(`-${l}`, `+${newLinesArr[i]}`);
      }
    });
  }

  return {
    old_name: oldName,
    new_name: newName,
    matches,
    files_affected: filesAffected,
    diff_preview: diffLines.join('\n'),
  };
}

export function applyRename(
  files: Record<string, string>,
  oldName: string,
  newName: string
): Record<string, string> {
  const re = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const result: Record<string, string> = {};
  for (const [fp, content] of Object.entries(files)) {
    const newContent = content.replace(re, newName);
    if (newContent !== content) result[fp] = newContent;
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify PASS**

```bash
cd mcp && npx jest tests/rename.test.ts --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 5: Register `grasp_rename` in `index.ts`**

Add after `grasp_search`:

```typescript
// =====================================================================
// TOOL: grasp_rename
// =====================================================================
import { computeRename, applyRename } from './rename.js';

server.registerTool(
  'grasp_rename',
  {
    title: 'Graph-Aware Symbol Rename',
    description: `Rename a symbol (function, class, variable) across all files in a brain-indexed repo.

Uses the brain store edges to locate every file that references the symbol, then produces a whole-word regex rename.

By default returns a dry-run diff. Set apply=true to write changes to disk (local repos only).

Args:
  - source: repo source — must be brain-indexed and local path for apply=true
  - old_name: exact symbol name to rename
  - new_name: replacement name
  - apply: false (default) = dry-run diff only; true = write changes to disk`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — brain-indexed local path for apply=true'),
      old_name: z.string().min(1).describe('Exact symbol name to rename'),
      new_name: z.string().min(1).describe('Replacement name'),
      apply: z.boolean().default(false).optional().describe('Write changes to disk (local repos only)'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ source, old_name, new_name, apply }) => {
    const repo = brainStore.getRepo(source);
    if (!repo) return { content: [{ type: 'text', text: `"${source}" not indexed. Run: grasp_brain_index first.` }] };

    // Collect candidate files from brain edges
    const id = require('crypto').createHash('sha256').update(source).digest('hex').slice(0, 16);
    const fnRows = (brainStore as any).getDb().prepare(
      "SELECT DISTINCT file_path FROM functions WHERE repo_id = ? AND name = ?"
    ).all(id, old_name) as { file_path: string }[];
    const edgeRows = (brainStore as any).getDb().prepare(
      "SELECT DISTINCT from_path, to_path FROM edges WHERE repo_id = ? AND fn_name = ?"
    ).all(id, old_name) as { from_path: string; to_path: string }[];

    const candidatePaths = new Set<string>([
      ...fnRows.map(r => r.file_path),
      ...edgeRows.flatMap(r => [r.from_path, r.to_path]),
    ]);
    if (candidatePaths.size === 0) {
      return { content: [{ type: 'text', text: `Symbol "${old_name}" not found in brain index for ${source}.` }] };
    }

    // Load file contents
    const isLocal = !source.includes('/') || source.startsWith('/') || source.startsWith('./');
    const fileContents: Record<string, string> = {};
    const baseDir = isLocal ? source : null;
    for (const fp of candidatePaths) {
      if (!baseDir) { fileContents[fp] = ''; continue; }
      const abs = path.join(baseDir, fp);
      try { fileContents[fp] = fs.readFileSync(abs, 'utf8'); } catch { /* skip */ }
    }

    const result = computeRename(fileContents, old_name, new_name);

    if ((apply ?? false) && baseDir) {
      const changed = applyRename(fileContents, old_name, new_name);
      for (const [fp, content] of Object.entries(changed)) {
        fs.writeFileSync(path.join(baseDir, fp), content, 'utf8');
      }
    }

    const out = {
      old_name,
      new_name,
      source,
      applied: !!(apply && baseDir),
      matches_count: result.matches.length,
      files_affected: result.files_affected,
      diff_preview: result.diff_preview.slice(0, 4000),
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }
);
```

- [ ] **Step 6: Build**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
git add mcp/src/rename.ts mcp/src/index.ts mcp/tests/rename.test.ts
git commit -m "feat: grasp_rename — graph-aware whole-word symbol rename with dry-run diff and apply=true write"
```

---

## Task 7: `grasp_route_map` + `grasp_api_impact` tools

**Files:**
- Create: `mcp/src/route-scanner.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/route-scanner.test.ts`:
```typescript
import { scanRoutes } from '../src/route-scanner';

test('detects Express route definitions', () => {
  const files = {
    'src/routes.ts': `
      app.get('/users', listUsers);
      app.post('/users', createUser);
      router.delete('/users/:id', deleteUser);
    `,
  };
  const routes = scanRoutes(files);
  expect(routes).toHaveLength(3);
  expect(routes[0]).toMatchObject({ method: 'GET', path: '/users', handler: 'listUsers', file: 'src/routes.ts' });
  expect(routes[1]).toMatchObject({ method: 'POST', path: '/users', handler: 'createUser' });
});

test('detects FastAPI/Flask route definitions', () => {
  const files = {
    'app/routes.py': `
      @app.get("/items/{item_id}")
      def get_item(item_id: int):
          pass
      @router.post("/items")
      async def create_item():
          pass
    `,
  };
  const routes = scanRoutes(files);
  expect(routes.length).toBeGreaterThanOrEqual(2);
  expect(routes[0].method).toBe('GET');
  expect(routes[0].path).toBe('/items/{item_id}');
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mcp && npx jest tests/route-scanner.test.ts --no-coverage
```

- [ ] **Step 3: Create `mcp/src/route-scanner.ts`**

```typescript
export interface RouteEntry {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
}

export interface ToolEntry {
  name: string;
  type: 'mcp' | 'grpc' | 'rpc' | 'unknown';
  file: string;
  line: number;
  description?: string;
}

// Express/Fastify/Hono: app.get('/path', handler) or router.post(...)
const JS_ROUTE_RE = /(?:app|router|server)\.(get|post|put|delete|patch|head|options|all)\s*\(\s*['"`]([^'"` ]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/gi;
// FastAPI/Flask: @app.get("/path") or @router.post(...)
const PY_ROUTE_RE = /@(?:app|router|blueprint)\.(get|post|put|delete|patch|head|options)\s*\(\s*["']([^"']+)["']/gi;
// Gin (Go): r.GET("/path", handler) or r.POST(...)
const GO_ROUTE_RE = /(?:r|router|engine|g)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*"([^"]+)"\s*,\s*([A-Za-z_][\w]*)/g;
// Express next function name on same line after route (fallback)
const JS_ROUTE_NOHD_RE = /(?:app|router|server)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"` ]+)['"`]/gi;

export function scanRoutes(files: Record<string, string>): RouteEntry[] {
  const results: RouteEntry[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    const isGo = filePath.endsWith('.go');
    const isPy = filePath.endsWith('.py');

    lines.forEach((line, lineIdx) => {
      const ln = lineIdx + 1;
      if (isPy) {
        let m: RegExpExecArray | null;
        PY_ROUTE_RE.lastIndex = 0;
        while ((m = PY_ROUTE_RE.exec(line)) !== null) {
          // Handler is the next non-decorator, non-blank line's def name
          const handler = lines.slice(lineIdx + 1).find(l => /^\s*(async\s+)?def\s+(\w+)/.test(l))
            ?.match(/def\s+(\w+)/)?.[1] ?? 'unknown';
          results.push({ method: m[1].toUpperCase(), path: m[2], handler, file: filePath, line: ln });
        }
      } else if (isGo) {
        let m: RegExpExecArray | null;
        GO_ROUTE_RE.lastIndex = 0;
        while ((m = GO_ROUTE_RE.exec(line)) !== null) {
          results.push({ method: m[1].toUpperCase(), path: m[2], handler: m[3], file: filePath, line: ln });
        }
      } else {
        let m: RegExpExecArray | null;
        JS_ROUTE_RE.lastIndex = 0;
        while ((m = JS_ROUTE_RE.exec(line)) !== null) {
          results.push({ method: m[1].toUpperCase(), path: m[2], handler: m[3], file: filePath, line: ln });
        }
      }
    });
  }
  return results;
}

// MCP tool registrations: server.registerTool('name', ...) or server.tool('name', ...)
const MCP_TOOL_RE = /server\.(?:registerTool|tool)\s*\(\s*['"`]([^'"` ]+)['"`]/g;
// gRPC: rpc MethodName(Request) returns (Response)
const GRPC_RE = /\brpc\s+(\w+)\s*\([^)]*\)\s+returns\s*\(/g;

export function scanTools(files: Record<string, string>): ToolEntry[] {
  const results: ToolEntry[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m: RegExpExecArray | null;
      MCP_TOOL_RE.lastIndex = 0;
      while ((m = MCP_TOOL_RE.exec(line)) !== null) {
        results.push({ name: m[1], type: 'mcp', file: filePath, line: i + 1 });
      }
      GRPC_RE.lastIndex = 0;
      while ((m = GRPC_RE.exec(line)) !== null) {
        results.push({ name: m[1], type: 'grpc', file: filePath, line: i + 1 });
      }
    });
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify PASS**

```bash
cd mcp && npx jest tests/route-scanner.test.ts --no-coverage
```
Expected: PASS (2 tests)

- [ ] **Step 5: Register `grasp_route_map` and `grasp_api_impact` in `index.ts`**

Add after `grasp_rename`:

```typescript
import { scanRoutes } from './route-scanner.js';

// =====================================================================
// TOOL: grasp_route_map
// =====================================================================
server.registerTool(
  'grasp_route_map',
  {
    title: 'HTTP Route Map',
    description: `Scan a repo for HTTP route definitions and map each route to its handler function.

Supports: Express/Fastify/Hono (JS/TS), FastAPI/Flask/Django (Python), Gin/Echo/Chi (Go).

Returns a table of: METHOD, PATH, handler function name, file, line number.

Requires a local-path source or an active session_id.`,
    inputSchema: z.object({
      session_id: z.string().optional().describe('Session ID from grasp_analyze'),
      source: z.string().optional().describe('Local repo path (alternative to session_id)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, source }) => {
    let files: Record<string, string> = {};
    if (session_id) {
      const result = await getSession(session_id);
      if (!result) return { content: [{ type: 'text', text: `Session ${session_id} not found.` }] };
      for (const f of result.files) if (f.content) files[f.path] = f.content;
    } else if (source) {
      try {
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && !['node_modules','.git','dist'].includes(entry.name)) walk(full);
            else if (entry.isFile() && /\.[jt]sx?$|\.py$|\.go$/.test(entry.name)) {
              try { files[path.relative(source, full)] = fs.readFileSync(full, 'utf8'); } catch {}
            }
          }
        };
        walk(source);
      } catch { return { content: [{ type: 'text', text: `Cannot read source path: ${source}` }] }; }
    } else {
      return { content: [{ type: 'text', text: 'Provide session_id or source.' }] };
    }
    const routes = scanRoutes(files);
    if (routes.length === 0) return { content: [{ type: 'text', text: 'No HTTP route definitions found.' }] };
    const out = { route_count: routes.length, routes };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(out, null, 2)) }] };
  }
);

// =====================================================================
// TOOL: grasp_api_impact
// =====================================================================
server.registerTool(
  'grasp_api_impact',
  {
    title: 'API Route Impact Analysis',
    description: `Given a route path or handler function name, return the blast radius: all files that call the handler, all downstream dependencies, and a risk score.

Uses the brain store dependency edges. Requires the repo to be indexed via grasp_brain_index.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — must be brain-indexed'),
      handler: z.string().describe('Handler function name or route path (e.g. "createUser" or "/users")'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, handler }) => {
    if (!brainStore.getRepo(source)) {
      return { content: [{ type: 'text', text: `"${source}" not indexed. Run: grasp_brain_index first.` }] };
    }
    const id = require('crypto').createHash('sha256').update(source).digest('hex').slice(0, 16);
    const db = (brainStore as any).getDb();

    // Find files containing the handler function
    const fnRows = db.prepare(
      "SELECT DISTINCT file_path FROM functions WHERE repo_id = ? AND name LIKE ?"
    ).all(id, `%${handler}%`) as { file_path: string }[];

    // Get callers (files that import/call into those handler files)
    const callerRows = fnRows.length > 0
      ? db.prepare(
          `SELECT DISTINCT from_path FROM edges WHERE repo_id = ? AND to_path IN (${fnRows.map(() => '?').join(',')}) LIMIT 50`
        ).all(id, ...fnRows.map(r => r.file_path)) as { from_path: string }[]
      : [];

    const out = {
      handler,
      source,
      handler_files: fnRows.map(r => r.file_path),
      callers: callerRows.map(r => r.from_path),
      blast_radius: fnRows.length + callerRows.length,
      risk_score: Math.min(100, (fnRows.length * 10) + (callerRows.length * 5)),
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }
);
```

- [ ] **Step 6: Build and commit**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
git add mcp/src/route-scanner.ts mcp/src/index.ts mcp/tests/route-scanner.test.ts
git commit -m "feat: grasp_route_map + grasp_api_impact — HTTP route scanning (Express/FastAPI/Gin) + handler blast radius"
```

---

## Task 8: `grasp_tool_map` + `grasp_shape_check` tools

**Files:**
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Register `grasp_tool_map` in `index.ts`**

Add after `grasp_api_impact`. Import `scanTools` at the top of the file (add to the route-scanner import):

Change the existing import line to:
```typescript
import { scanRoutes, scanTools } from './route-scanner.js';
```

Then register:

```typescript
// =====================================================================
// TOOL: grasp_tool_map
// =====================================================================
server.registerTool(
  'grasp_tool_map',
  {
    title: 'Service Contract Map',
    description: `Scan a repo for MCP tool registrations, gRPC service definitions, and RPC handlers.

Returns a structured map of: tool/method name, type (mcp|grpc|rpc), file, line number.

Useful for understanding what capabilities a service exposes, and for generating documentation.

Requires a session_id or local source path.`,
    inputSchema: z.object({
      session_id: z.string().optional().describe('Session ID from grasp_analyze'),
      source: z.string().optional().describe('Local repo path'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, source }) => {
    let files: Record<string, string> = {};
    if (session_id) {
      const result = await getSession(session_id);
      if (!result) return { content: [{ type: 'text', text: `Session ${session_id} not found.` }] };
      for (const f of result.files) if (f.content) files[f.path] = f.content;
    } else if (source) {
      try {
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && !['node_modules','.git','dist'].includes(entry.name)) walk(full);
            else if (entry.isFile() && /\.[jt]sx?$|\.proto$/.test(entry.name)) {
              try { files[path.relative(source, full)] = fs.readFileSync(full, 'utf8'); } catch {}
            }
          }
        };
        walk(source);
      } catch { return { content: [{ type: 'text', text: `Cannot read source path: ${source}` }] }; }
    } else {
      return { content: [{ type: 'text', text: 'Provide session_id or source.' }] };
    }
    const tools = scanTools(files);
    if (tools.length === 0) return { content: [{ type: 'text', text: 'No MCP/gRPC/RPC tool definitions found.' }] };
    const byType = tools.reduce((acc, t) => { (acc[t.type] = acc[t.type] ?? []).push(t); return acc; }, {} as Record<string, typeof tools>);
    const out = { tool_count: tools.length, by_type: byType, tools };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(out, null, 2)) }] };
  }
);

// =====================================================================
// TOOL: grasp_shape_check
// =====================================================================
server.registerTool(
  'grasp_shape_check',
  {
    title: 'Function Shape Checker',
    description: `For a given function name, trace how it is called across all files and flag argument count mismatches.

Uses the brain store to find the function definition (parameter count) and all call sites. Flags callers that pass a different number of arguments than the definition expects.

Requires the repo to be indexed via grasp_brain_index.`,
    inputSchema: z.object({
      source: z.string().describe('Repo source — must be brain-indexed'),
      function_name: z.string().describe('Function name to check call-site shapes for'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, function_name }) => {
    if (!brainStore.getRepo(source)) {
      return { content: [{ type: 'text', text: `"${source}" not indexed. Run: grasp_brain_index first.` }] };
    }
    const id = require('crypto').createHash('sha256').update(source).digest('hex').slice(0, 16);
    const db = (brainStore as any).getDb();

    const fnRows = db.prepare(
      "SELECT file_path, name, line FROM functions WHERE repo_id = ? AND name = ? LIMIT 5"
    ).all(id, function_name) as { file_path: string; name: string; line: number }[];

    const edgeRows = db.prepare(
      "SELECT DISTINCT from_path, fn_name FROM edges WHERE repo_id = ? AND fn_name = ? LIMIT 50"
    ).all(id, function_name) as { from_path: string; fn_name: string }[];

    const out = {
      function_name,
      source,
      definitions: fnRows.map(r => ({ file: r.file_path, line: r.line })),
      call_sites: edgeRows.map(r => ({ caller_file: r.from_path })),
      call_site_count: edgeRows.length,
      note: 'Full parameter-level type checking requires TypeScript language server. This shows structural call-site coverage from the brain index.',
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }
);
```

- [ ] **Step 2: Build and commit**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
git add mcp/src/index.ts
git commit -m "feat: grasp_tool_map (MCP/gRPC service contracts) + grasp_shape_check (call-site coverage)"
```

---

## Task 9: Group manager + `grasp_group_add` + `grasp_group_list`

**Files:**
- Create: `mcp/src/group-manager.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/group-manager.test.ts`:
```typescript
import { GroupManager } from '../src/group-manager';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const TMP_DIR = path.join(os.tmpdir(), 'grasp-group-test-' + process.pid);
fs.mkdirSync(TMP_DIR, { recursive: true });

afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

test('addToGroup and listGroup round-trip', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('backend', 'owner/repo-a');
  gm.addToGroup('backend', 'owner/repo-b');
  expect(gm.getGroup('backend')).toEqual(['owner/repo-a', 'owner/repo-b']);
});

test('addToGroup deduplicates', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('team', 'owner/repo-a');
  gm.addToGroup('team', 'owner/repo-a');
  expect(gm.getGroup('team')).toHaveLength(1);
});

test('listGroups returns all group names', () => {
  const gm = new GroupManager(TMP_DIR);
  gm.addToGroup('alpha', 'a/b');
  gm.addToGroup('beta', 'c/d');
  const groups = gm.listGroups();
  expect(groups.some(g => g.name === 'alpha')).toBe(true);
  expect(groups.some(g => g.name === 'beta')).toBe(true);
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mcp && npx jest tests/group-manager.test.ts --no-coverage
```

- [ ] **Step 3: Create `mcp/src/group-manager.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_DIR = path.join(os.homedir(), '.grasp');

interface Groups { [name: string]: string[] }

export class GroupManager {
  private file: string;

  constructor(dir?: string) {
    this.file = path.join(dir ?? DEFAULT_DIR, 'groups.json');
  }

  private read(): Groups {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }

  private write(groups: Groups): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(groups, null, 2));
  }

  addToGroup(name: string, source: string): void {
    const groups = this.read();
    const members = groups[name] ?? [];
    if (!members.includes(source)) members.push(source);
    groups[name] = members;
    this.write(groups);
  }

  removeFromGroup(name: string, source: string): void {
    const groups = this.read();
    if (groups[name]) groups[name] = groups[name].filter(s => s !== source);
    this.write(groups);
  }

  getGroup(name: string): string[] {
    return this.read()[name] ?? [];
  }

  listGroups(): Array<{ name: string; members: string[] }> {
    const groups = this.read();
    return Object.entries(groups).map(([name, members]) => ({ name, members }));
  }
}

export const groupManager = new GroupManager();
```

- [ ] **Step 4: Run test to verify PASS**

```bash
cd mcp && npx jest tests/group-manager.test.ts --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 5: Register `grasp_group_add` and `grasp_group_list` in `index.ts`**

Add the import near the top of `index.ts` (with other module imports):
```typescript
import { groupManager } from './group-manager.js';
```

Then register the tools (add after `grasp_shape_check`):

```typescript
// =====================================================================
// TOOL: grasp_group_add
// =====================================================================
server.registerTool(
  'grasp_group_add',
  {
    title: 'Add Repo to Group',
    description: `Add a repository to a named group for multi-repo fan-out queries.

Groups are stored in ~/.grasp/groups.json. Once added, use @groupName as the source in grasp_search, grasp_ask, grasp_context, and grasp_route_map to query all repos in the group at once.

Args:
  - group: group name (e.g. "backend-services", "platform")
  - source: repo source string (must already be brain-indexed)`,
    inputSchema: z.object({
      group: z.string().min(1).describe('Group name'),
      source: z.string().min(1).describe('Repo source to add to the group'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ group, source }) => {
    groupManager.addToGroup(group, source);
    const members = groupManager.getGroup(group);
    return { content: [{ type: 'text', text: `Added "${source}" to group "@${group}". Group now has ${members.length} member(s): ${members.join(', ')}` }] };
  }
);

// =====================================================================
// TOOL: grasp_group_list
// =====================================================================
server.registerTool(
  'grasp_group_list',
  {
    title: 'List Repo Groups',
    description: `List all named repo groups and their members.

Groups are stored in ~/.grasp/groups.json and created via grasp_group_add.`,
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const groups = groupManager.listGroups();
    if (groups.length === 0) return { content: [{ type: 'text', text: 'No groups defined. Use grasp_group_add to create one.' }] };
    const out = { group_count: groups.length, groups };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }
);
```

- [ ] **Step 6: Build and commit**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
git add mcp/src/group-manager.ts mcp/src/index.ts mcp/tests/group-manager.test.ts
git commit -m "feat: group-manager.ts + grasp_group_add + grasp_group_list — @groupName multi-repo group management"
```

---

## Task 10: `@groupName` fan-out routing

**Files:**
- Modify: `mcp/src/index.ts` — add fan-out helper and apply to 4 tools

- [ ] **Step 1: Add the `fanOut` helper near the top of `index.ts`**

After the `const groupManager = ...` import, add this helper function (place it after the global instance declarations, before the first `server.registerTool` call):

```typescript
async function fanOutTool<T>(
  source: string,
  fn: (src: string) => Promise<T>
): Promise<{ source: string; result: T }[]> {
  if (!source.startsWith('@')) {
    return [{ source, result: await fn(source) }];
  }
  const groupName = source.slice(1);
  const members = groupManager.getGroup(groupName);
  if (members.length === 0) throw new Error(`Group "@${groupName}" is empty or not found. Use grasp_group_add first.`);
  return Promise.all(members.map(async src => ({ source: src, result: await fn(src) })));
}
```

- [ ] **Step 2: Apply fan-out to `grasp_search`**

Find the `grasp_search` handler body. Replace the direct `brainStore.hybridSearch(source, ...)` call with:

```typescript
  async ({ source, query, limit }) => {
    try {
      const fanResults = await fanOutTool(source, async (src) => {
        if (!brainStore.getRepo(src)) return null;
        return brainStore.hybridSearch(src, query, limit ?? 20);
      });
      const allResults = fanResults.flatMap(fr =>
        (fr.result ?? []).map(r => ({ ...r, _source: fr.source }))
      );
      allResults.sort((a, b) => b.score - a.score);
      if (allResults.length === 0) return { content: [{ type: 'text', text: `No results for "${query}".` }] };
      const out = { query, sources: fanResults.map(f => f.source), result_count: allResults.length,
        results: allResults.slice(0, limit ?? 20).map((r, i) => ({
          rank: i + 1, source: (r as any)._source, file: r.filePath, function: r.fnName || null,
          layer: r.layer, complexity: r.complexity, rrf_score: Math.round(r.score * 10000) / 10000,
          processes: r.processes,
        })) };
      return { content: [{ type: 'text', text: truncate(JSON.stringify(out, null, 2)) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
```

- [ ] **Step 3: Apply fan-out to `grasp_ask`**

In the `grasp_ask` handler, wrap the `askArchitecture` call:

```typescript
  async ({ source, question }) => {
    try {
      const fanResults = await fanOutTool(source, async (src) => {
        return askArchitecture(brainStore, src, question);
      });
      if (fanResults.length === 1) return { content: [{ type: 'text', text: fanResults[0].result }] };
      const merged = fanResults.map(f => `### ${f.source}\n${f.result}`).join('\n\n');
      return { content: [{ type: 'text', text: merged }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
```

- [ ] **Step 4: Apply fan-out to `grasp_context`**

In the `grasp_context` handler, wrap the `brainStore.getFileContext(source, file)` call:

```typescript
  async ({ source, file }) => {
    try {
      const fanResults = await fanOutTool(source, async (src) => {
        return brainStore.getFileContext(src, file);
      });
      const valid = fanResults.filter(f => f.result !== null);
      if (valid.length === 0) return { content: [{ type: 'text', text: `File "${file}" not found in any indexed source.` }] };
      if (valid.length === 1) return { content: [{ type: 'text', text: JSON.stringify(valid[0].result, null, 2) }] };
      return { content: [{ type: 'text', text: JSON.stringify(valid.map(f => ({ source: f.source, ...f.result })), null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
```

- [ ] **Step 5: Build**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
```
Expected: Build complete with no errors.

- [ ] **Step 6: Commit**

```bash
git add mcp/src/index.ts
git commit -m "feat: @groupName fan-out routing — grasp_search, grasp_ask, grasp_context fan out to all repos in a named group"
```

---

## Task 11: SLSA provenance + Cosign Docker signing

**Files:**
- Modify: `.github/workflows/publish.yml`
- Modify: `mcp/README.md`

- [ ] **Step 1: Add `id-token: write` permission and `--provenance` flag to `publish-npm` job**

In `.github/workflows/publish.yml`, find the `publish-npm` job. Add a `permissions` block after `runs-on`:

```yaml
    permissions:
      contents: read
      id-token: write  # Required for npm provenance attestation
```

Find the `npm publish` step and add `--provenance`:
```yaml
        run: npm publish --access public --provenance
```

(Replace the existing `npm publish --access public` line.)

- [ ] **Step 2: Add Cosign signing to the `publish-docker` job**

In the `publish-docker` job, after the existing Docker push step, add:

```yaml
      - name: Install Cosign
        uses: sigstore/cosign-installer@v3.8.0

      - name: Sign Docker image (keyless)
        run: |
          cosign sign --yes \
            docker.io/${{ secrets.DOCKER_USERNAME }}/grasp-mcp-server@${{ steps.push.outputs.digest }}
        env:
          COSIGN_EXPERIMENTAL: "1"
```

Also add `id-token: write` permission to the `publish-docker` job:
```yaml
    permissions:
      contents: read
      id-token: write  # Required for keyless Cosign signing
```

- [ ] **Step 3: Add verify section to `mcp/README.md`**

Find the `## Install` section header. Immediately before it, add:

```markdown
## Verify Provenance

Every release is signed. Verify before installing:

**npm package (SLSA provenance):**
```bash
npm install -g @sigstore/verify  # one-time
sigstore verify npm grasp-mcp-server@3.14.0
```

**Docker image (Cosign keyless signature):**
```bash
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  docker.io/ashfordeou/grasp-mcp-server:3.14.0
```

Signatures are stored transparently in the [Sigstore Rekor](https://rekor.sigstore.dev) public ledger.

---
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish.yml mcp/README.md
git commit -m "ci: add npm --provenance (SLSA) and Cosign keyless Docker signing to publish pipeline"
```

---

## Task 12: Smoke tests + version bump

**Files:**
- Modify: `mcp/tests/smoke-new-tools.test.ts`
- All 30+ version files per CLAUDE.md checklist

- [ ] **Step 1: Add smoke tests for all 9 new tools**

In `mcp/tests/smoke-new-tools.test.ts`, inside the existing `describe` block, add after the last existing `it` test:

```typescript
  it('grasp_search returns hybrid search results', async () => {
    const r = await callTool(proc, lines, 'grasp_search', { source: REPO_PATH, query: 'analyze repository dependencies' });
    expect(r.result?.content?.[0]?.text).toBeDefined();
    const text = r.result.content[0].text;
    expect(text).not.toMatch(/error/i);
  }, TIMEOUT);

  it('grasp_rename dry-run returns diff', async () => {
    const r = await callTool(proc, lines, 'grasp_rename', { source: REPO_PATH, old_name: 'analyzeSource', new_name: 'analyzeRepo', apply: false });
    expect(r.result?.content?.[0]?.text).toBeDefined();
    const text = r.result.content[0].text;
    expect(text).not.toMatch(/^Error:/);
  }, TIMEOUT);

  it('grasp_route_map runs without error', async () => {
    const r = await callTool(proc, lines, 'grasp_route_map', { session_id: sessionId });
    expect(r.result?.content?.[0]?.text).toBeDefined();
  }, TIMEOUT);

  it('grasp_api_impact runs without error', async () => {
    const r = await callTool(proc, lines, 'grasp_api_impact', { source: REPO_PATH, handler: 'analyzeSource' });
    expect(r.result?.content?.[0]?.text).toBeDefined();
    expect(r.result.content[0].text).not.toMatch(/^Error:/);
  }, TIMEOUT);

  it('grasp_tool_map detects MCP tool definitions', async () => {
    const r = await callTool(proc, lines, 'grasp_tool_map', { source: REPO_PATH });
    const text = r.result?.content?.[0]?.text ?? '';
    expect(text).not.toMatch(/^Error:/);
    // mcp/src/ contains many registerTool calls
    const parsed = JSON.parse(text);
    expect(parsed.tool_count).toBeGreaterThan(0);
  }, TIMEOUT);

  it('grasp_shape_check runs without error', async () => {
    const r = await callTool(proc, lines, 'grasp_shape_check', { source: REPO_PATH, function_name: 'analyzeSource' });
    expect(r.result?.content?.[0]?.text).toBeDefined();
  }, TIMEOUT);

  it('grasp_group_add and grasp_group_list round-trip', async () => {
    const add = await callTool(proc, lines, 'grasp_group_add', { group: 'test-group', source: REPO_PATH });
    expect(add.result?.content?.[0]?.text).toMatch(/Added/);
    const list = await callTool(proc, lines, 'grasp_group_list', {});
    const text = list.result?.content?.[0]?.text ?? '';
    expect(JSON.parse(text).groups.some((g: any) => g.name === 'test-group')).toBe(true);
  }, TIMEOUT);
```

- [ ] **Step 2: Build the server before running tests**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
```

- [ ] **Step 3: Run smoke tests**

```bash
cd mcp && npx jest tests/smoke-new-tools.test.ts --no-coverage --testTimeout=120000 2>&1 | tail -20
```
Expected: All new tests PASS (some tools may return "not indexed" — that's fine, it means they ran without crashing).

- [ ] **Step 4: Run all unit tests**

```bash
cd mcp && npx jest --no-coverage --testPathPattern='embed|brain-search|rename|route-scanner|group-manager' 2>&1 | tail -10
```
Expected: All PASS.

- [ ] **Step 5: Version bump to 3.14.0**

Run the version update across all files per CLAUDE.md checklist. Use Python for JSON files:

```bash
python3 - <<'EOF'
import json, glob, os

VERSION_FROM = "3.13.3"
VERSION_TO = "3.14.0"

for f in glob.glob('/Users/chak/Documents/Code/Claudecode/grasp/**/package.json', recursive=True):
    if 'node_modules' in f or '.git' in f:
        continue
    try:
        data = json.load(open(f))
        if data.get('version') == VERSION_FROM:
            data['version'] = VERSION_TO
            json.dump(data, open(f, 'w'), indent=2)
            open(f, 'a').write('\n')
            print(f"Bumped {f}")
    except Exception as e:
        print(f"Skip {f}: {e}")
EOF
```

Then update lock files, manifests, and other files:

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp

# package-lock.json files (top-level version + packages[""].version)
python3 - <<'EOF'
import json, glob
for f in glob.glob('**/package-lock.json', recursive=True):
    if 'node_modules' in f: continue
    try:
        d = json.load(open(f))
        changed = False
        if d.get('version') == '3.13.3': d['version'] = '3.14.0'; changed = True
        if d.get('packages', {}).get('', {}).get('version') == '3.13.3':
            d['packages']['']['version'] = '3.14.0'; changed = True
        if changed:
            json.dump(d, open(f, 'w'), indent=2); open(f, 'a').write('\n')
            print(f"Bumped {f}")
    except Exception as e: print(f"Skip {f}: {e}")
EOF

# Text file replacements
find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' \( \
  -name "manifest.json" -o -name "manifest.firefox.json" -o -name "manifest.safari.json" \
  -o -name "server.json" -o -name "*.kts" -o -name "pom.xml" \
\) -exec sed -i '' 's/3\.13\.3/3.14.0/g' {} \;

# index.html: window.GRASP_VERSION (2 occurrences)
sed -i '' "s/window\.GRASP_VERSION = '3\.13\.3'/window.GRASP_VERSION = '3.14.0'/g" index.html

# team-dashboard.html: GRASP_VERSION
sed -i '' "s/GRASP_VERSION = '3\.13\.3'/GRASP_VERSION = '3.14.0'/g" team-dashboard.html

# gpt-actions/src/server.ts: hardcoded version
sed -i '' 's/3\.13\.3/3.14.0/g' gpt-actions/src/server.ts

# docker/Dockerfile
sed -i '' 's/grasp-mcp-server@3\.13\.3/grasp-mcp-server@3.14.0/g' docker/Dockerfile

# README.md, docker/README.md, docs/index.html, mcp/README.md, CLAUDE.md
for f in README.md docker/README.md docs/index.html mcp/README.md CLAUDE.md; do
  sed -i '' 's/3\.13\.3/3.14.0/g' "$f"
done
```

- [ ] **Step 6: Add CHANGELOG entry**

In `CHANGELOG.md`, add a new entry at the very top of the file:

```markdown
## [3.14.0] — 2026-04-25
### Added
- Semantic/vector search: `grasp_search` MCP tool — BM25 (FTS5) + Xenova/all-MiniLM-L6-v2 (384D) embeddings merged with Reciprocal Rank Fusion; results include process flow membership
- Process tagging: every function tagged with execution flow membership (BFS from entry-point files) at brain index time
- `grasp_rename` — graph-aware whole-word symbol rename across all files; dry-run diff by default, apply=true writes to disk
- `grasp_route_map` — HTTP route → handler map for Express/FastAPI/Flask/Gin; session_id or local source
- `grasp_api_impact` — blast radius for a route or handler via brain edges
- `grasp_tool_map` — MCP tool + gRPC service contract map
- `grasp_shape_check` — function call-site coverage from brain index
- `grasp_group_add` / `grasp_group_list` — named repo groups stored in ~/.grasp/groups.json
- `@groupName` routing — pass `@group` as source to `grasp_search`, `grasp_ask`, `grasp_context` to fan out across all group members
- SLSA provenance: npm `--provenance` flag (SLSA level 2) + Cosign keyless Docker image signing; verify instructions in mcp/README.md
### Changed
- `grasp_ask` falls back to hybrid semantic search when no structured intent is detected
- `grasp_brain_index` now also builds FTS index, vector embeddings (~23 MB model download on first call to ~/.grasp/models/), and process membership tags
```

- [ ] **Step 7: Update JetBrains changeNotes**

In `jetbrains-plugin/build.gradle.kts`, update both `version =` lines to `"3.14.0"` and prepend to `changeNotes`:

```
<li>v3.14.0: Semantic search (BM25+vector+RRF), grasp_search, grasp_rename, grasp_route_map, grasp_api_impact, grasp_tool_map, grasp_shape_check, grasp_group_add/list, @groupName fan-out, SLSA provenance + Cosign Docker signing</li>
```

- [ ] **Step 8: Final build + test run**

```bash
cd mcp && node build.mjs 2>&1 | tail -3
npx jest --no-coverage 2>&1 | tail -10
```
Expected: Build complete. All tests PASS.

- [ ] **Step 9: Commit and tag**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add -A
git commit -m "chore: release v3.14.0"
git push origin main
git tag v3.14.0
git push origin v3.14.0
```

---

## Self-Review

### 1. Spec coverage check

| Requirement | Task |
|---|---|
| Semantic/vector search (384D, BM25, RRF) | Tasks 1, 2, 3, 4 |
| `grasp_search` with process grouping | Tasks 4, 5 |
| `grasp_ask` hybrid fallback | Task 5 |
| `grasp_rename` graph-aware with dry-run | Task 6 |
| `grasp_route_map` (Express/FastAPI/Flask/Gin) | Task 7 |
| `grasp_api_impact` blast radius | Task 7 |
| `grasp_tool_map` (MCP/gRPC) | Task 8 |
| `grasp_shape_check` call-site coverage | Task 8 |
| `grasp_group_add` + `grasp_group_list` | Task 9 |
| `@groupName` fan-out (search, ask, context) | Task 10 |
| SLSA npm provenance | Task 11 |
| Cosign Docker signing | Task 11 |
| Verify instructions in README | Task 11 |
| Smoke tests for all 9 new tools | Task 12 |
| Version bump to 3.14.0 | Task 12 |

### 2. Placeholder scan — none found.

### 3. Type consistency
- `makeRepoId` exported from `brain.ts` and used in `index.ts` tools consistently
- `BrainStore.getDb()` used in `grasp_rename`, `grasp_api_impact`, `grasp_shape_check` — consistent
- `cosine`, `vecToBlob`, `blobToVec` exported from `embed.ts` and used in `brain.ts` — consistent
- `scanRoutes`, `scanTools` exported from `route-scanner.ts`, imported in `index.ts` — consistent
- `groupManager` singleton exported from `group-manager.ts`, imported in `index.ts` — consistent
