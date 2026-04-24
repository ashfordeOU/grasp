# Sub-project A: Graph Core — Design Spec

**Date:** 2026-04-25
**Status:** Approved
**Version target:** 3.11.0

---

## Goal

Add a persistent graph database (Kuzu) alongside the existing SQLite BrainStore, enabling full Cypher queries, function-level call edges, and cross-file type propagation — the foundational layer all other GitNexus-competitive sub-projects build on.

---

## Scope

Covers GitNexus features:
- **Feature 1:** Persistent graph DB with Cypher queries
- **Feature 9:** Cross-file type propagation through call chains
- **Feature 2 (partial):** Function-level call edges (foundation for execution flow tracing)

Does NOT include: Leiden community detection (C), execution flow STEP_IN_PROCESS edges (B), MRO (B), hooks (D), SKILL.md (C), multi-repo (E).

---

## Architecture

### Two stores, one pipeline

```
Analysis pipeline (unchanged)
         │
         ▼
  indexResult()  ─────────────┬──────────────────────┐
                               │                      │
                    BrainStore (SQLite)       GraphStore (Kuzu)
                    ~/.grasp/brain.db         ~/.grasp/graph/
                    repo metadata             graph traversal
                    file index                Cypher queries
                    function defs (raw)       type propagation
```

Both stores are populated in the same pipeline pass at index time. No double analysis. GraphStore initialises lazily — if no graph tools are called, Kuzu never loads.

### Kuzu schema

**Node tables:**
```cypher
CREATE NODE TABLE File(
  id       STRING,
  path     STRING,
  language STRING,
  repoId   STRING,
  PRIMARY KEY(id)
)

CREATE NODE TABLE Function(
  id         STRING,
  name       STRING,
  filePath   STRING,
  repoId     STRING,
  returnType STRING,
  startLine  INT64,
  endLine    INT64,
  PRIMARY KEY(id)
)
```

**Relationship tables:**
```cypher
CREATE REL TABLE CALLS(FROM Function TO Function, count INT64)
CREATE REL TABLE IMPORTS(FROM File TO File)
CREATE REL TABLE DEFINES(FROM File TO Function)
CREATE REL TABLE SAME_RETURN_TYPE(FROM Function TO Function, typeName STRING)
```

`SAME_RETURN_TYPE` connects any two functions that share the same `returnType` string (e.g. both return `"User"`). This is how type propagation works in v3.11.0 — it surfaces functions across the codebase that deal in the same type, without requiring parameter type extraction. Parameter type tracking (true dataflow edges) is deferred to a future iteration.

Function `id` = `repoId:filePath:name:startLine` — stable across re-indexes, deduplicates correctly.

---

## Changes Required

### `src/types.ts`
Add optional `returnType?: string` to `FnDef`. Fully backward-compatible.

### `src/graph.ts` (new file, ~300 lines)
`GraphStore` class:
- `getGraphStore()` lazy-init singleton (same pattern as `getBrainStore()`)
- `ensureSchema()` — creates node/rel tables on first init
- `indexResult(repoId, result, fnDefs)` — bulk insert Files, Functions, CALLS, IMPORTS, DEFINES edges; derive SAME_RETURN_TYPE edges by grouping functions with identical returnType strings
- `query(cypher)` — executes read-only Cypher; rejects writes (CREATE/DELETE/MERGE/SET prefix check)
- `getCallChain(repoId, fnName, direction, depth)` — pre-built Cypher traversal
- `getTypeChain(repoId, typeName, hops)` — pre-built query: finds functions with matching returnType, then traverses CALLS edges up to `hops` away
- `clear(repoId)` — delete all nodes/edges for a repo before re-index

### `src/brain.ts`
No changes.

### `src/analyzer.ts`
One new call after existing `brain.indexResult()`:
```typescript
await getGraphStore().indexResult(repoId, result, fnDefs);
```

### `src/tree-sitter/extractors/*`
Each extractor's `extractDefinitions()` reads the return type annotation node text where the language has static types. Return type is normalised (trim whitespace, strip leading `-> `). Languages without static types (Ruby, plain JS) omit the field.

**Return type extraction per language:**

| Language | Tree-sitter node |
|---|---|
| TypeScript | `type_annotation` child of function node |
| Python | return annotation `type` node after `->` |
| Java | first child token of `method_declaration` |
| Go | `result` child of `function_declaration` |
| Rust | `return_type` child of `function_item` |
| C# | type token before method name |
| Kotlin | `type_reference` after `:` |
| Swift | `type_annotation` after `->` |
| PHP | `named_type` in return type clause |
| Scala | `type` after `:` |
| C/C++ | first token of function declaration |
| Ruby, plain JS | omitted (dynamic) |

### `src/index.ts`
Four new tools registered, same pattern as existing tools.

---

## New MCP Tools

### `graph_query`
Raw Cypher execution against a repo's graph.

```
Input:
  source  — repo URL or local path
  cypher  — Cypher query string (read-only)

Output: JSON array of result rows

Safety: rejects queries beginning with CREATE, DELETE, MERGE, SET
```

### `call_chain`
N-hop caller/callee traversal for a named function.

```
Input:
  source     — repo URL or local path
  function   — function name
  direction  — "callers" | "callees" | "both"
  depth      — 1–5 (default 2)

Output: JSON tree, each node has name, filePath, returnType, edges with count
```

### `type_propagation`
Trace where a type flows through the codebase.

```
Input:
  source    — repo URL or local path
  typeName  — e.g. "AuthToken", "User", "Result"
  hops      — 1–5 (default 3)

Output:
  producers — functions whose returnType matches the given typeName
  peers     — other functions that share the same returnType (via SAME_RETURN_TYPE edges)
  ordered by call distance from producers

Note: "consumers" (functions that accept this type as a parameter) requires
parameter type extraction, deferred to a future iteration.
```

### `function_graph`
Subgraph visualisation centred on a function.

```
Input:
  source    — repo URL or local path
  function  — function name
  depth     — 1–3 (default 2)
  format    — "mermaid" | "dot" | "json"

Output: rendered graph in chosen format
  mermaid — pastes into GitHub markdown, VS Code preview
  dot     — Graphviz compatible
  json    — raw nodes/edges for custom rendering
```

---

## Dependency

```json
"kuzu": "^0.6.0"
```

Ships pre-built binaries via npm (linux/mac/win, x64/arm64). No user install step. Adds ~35MB to install. Existing Grasp install is already ~200MB due to tree-sitter grammars — not material.

Kuzu stores its database in a directory: `~/.grasp/graph/`. Created automatically on first use.

---

## Release

- **Version:** `3.10.0 → 3.11.0`
- **Breaking changes:** none
- **New tests:** GraphStore unit tests + integration tests for all 4 tools
- **CI:** existing tests untouched and passing; new tests added
- **README:** 4 new tools added to tool list with examples
- **Publish:** `npm publish` after CI green

---

## What This Enables Downstream

| Sub-project | Depends on |
|---|---|
| B (execution flow, MRO) | Function nodes + CALLS edges |
| C (Leiden, SKILL.md) | Graph structure for community detection |
| D (hooks, git diff) | Graph for symbol resolution |
| E (multi-repo contracts) | Graph federation across instances |

Sub-project A ships standalone value (Cypher + type propagation) while unblocking all downstream work.
