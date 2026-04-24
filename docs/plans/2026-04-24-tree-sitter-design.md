# Design: Tree-sitter AST Parsing
Date: 2026-04-24
Goal: Replace regex-based function extraction and call detection with tree-sitter AST parsing for the 8 highest-impact languages, in both the MCP server (native bindings) and browser app (WASM via existing CDN pattern).
Architecture: Lazy per-language grammar loading, shared extractor interface, zero-breaking-change fallback to existing regex.
Tech stack: tree-sitter (Node.js native), web-tree-sitter WASM, tree-sitter-wasms CDN package (already in use for Python), TypeScript extractors.

---

## Context

### Current state
- `mcp/src/parser.js` — 1,580-line monolith
- JS/TS: Acorn + Babel AST (accurate)
- Python: tree-sitter WASM **for call detection only**, regex for definition extraction
- Go, Java, Kotlin, Rust, C, C++, C#, Ruby: **regex for both** extraction and call detection
- `index.html` embeds the parser inline (copy of parser.js logic)

### Key insight
`tree-sitter-wasms@0.1.13` (the CDN package already used for Python's grammar) contains pre-compiled WASM for all 8 target languages. Same CDN base URL, different filename. No new CDN dependencies.

### What "tree-sitter" will fix
1. **Definition extraction** — regex misses overloaded methods, multi-line signatures, decorator stacks, generic type params; tree-sitter handles all of these exactly.
2. **Call detection** — regex counts matches inside strings and comments as calls; tree-sitter never does (string/comment nodes are typed differently in the CST).
3. **False phantom edges** — call detection accuracy directly determines which file→file connections are created; fixing call detection reduces false circular deps.

---

## Grammar Coverage

### Tier 1: Tree-sitter (8 languages added + Python upgraded)

| Language | Extensions | WASM filename | Node module |
|---|---|---|---|
| Python | .py .pyw .pyi | `tree-sitter-python.wasm` | `tree-sitter-python` |
| Go | .go | `tree-sitter-go.wasm` | `tree-sitter-go` |
| Java | .java | `tree-sitter-java.wasm` | `tree-sitter-java` |
| Kotlin | .kt .kts | `tree-sitter-kotlin.wasm` | `tree-sitter-kotlin` |
| Rust | .rs | `tree-sitter-rust.wasm` | `tree-sitter-rust` |
| C | .c .h | `tree-sitter-c.wasm` | `tree-sitter-c` |
| C++ | .cpp .cc .hpp | `tree-sitter-cpp.wasm` | `tree-sitter-cpp` |
| C# | .cs | `tree-sitter-c_sharp.wasm` | `tree-sitter-c-sharp` |
| Ruby | .rb | `tree-sitter-ruby.wasm` | `tree-sitter-ruby` |

> JS/TS stays on Acorn (already accurate AST). These 9 languages cover ~95%+ of real-world repos.

### Tier 2: Regex (kept as-is)
All other languages (~40 extensions: Swift, Scala, Clojure, Elixir, Haskell, VBA, Zig, Ada, etc.). Results labelled "heuristic" in the UI.

---

## Architecture

### New directory structure

```
mcp/src/
  tree-sitter/
    grammar-registry.ts   ← extension → {wasmFile, nodeModule} map
    grammar-loader/
      node.ts             ← require() native bindings, returns Language
      browser.ts          ← fetch WASM from CDN, cache in IndexedDB, returns Language
    extractors/
      python.ts           ← tree → FnDef[] + calls Record
      go.ts
      java.ts
      kotlin.ts
      rust.ts
      c.ts
      cpp.ts
      csharp.ts
      ruby.ts
    index.ts              ← preloadGrammars(), getExtractor(), isAstBacked()
```

### Extractor interface

Every language extractor exports two functions:

```typescript
// Extract function/method/class definitions
export function extractDefinitions(
  tree: TreeSitter.Tree,
  source: string,
  filename: string
): FnDef[]

// Count how many times each name in `fnNames` is called (not defined)
export function countCalls(
  tree: TreeSitter.Tree,
  fnNames: Set<string>
): Record<string, number>
```

Both take the same `tree` object — one parse, two passes. The `FnDef` shape is unchanged from the existing interface in `analyzer.ts`:

```typescript
interface FnDef {
  name: string;
  file: string;
  line: number;
  code?: string;
  isTopLevel?: boolean;
  isExported?: boolean;
  isClassMethod?: boolean;
  type?: string;            // 'function' | 'method' | 'class' | 'async_function' etc.
  decorators?: string[] | null;
  className?: string | null;
  folder?: string;
  layer?: string;
  astBacked?: boolean;      // NEW — true when extracted via tree-sitter
}
```

The `astBacked` field is the only addition. All callers in `analyzer.ts` continue to work unchanged.

### Grammar loader: browser vs. node

**Node (MCP server)**
```typescript
// grammar-loader/node.ts
import TreeSitter from 'tree-sitter';

const cache = new Map<string, TreeSitter.Language>();

export async function loadGrammar(nodeModule: string): Promise<TreeSitter.Language | null> {
  if (cache.has(nodeModule)) return cache.get(nodeModule)!;
  try {
    const lang = require(nodeModule) as TreeSitter.Language;
    cache.set(nodeModule, lang);
    return lang;
  } catch {
    return null; // grammar not installed → caller falls back to regex
  }
}
```

**Browser (index.html)**
```javascript
// Inline in Parser object, extending existing _tsParser pattern

_tsParsers: new Map(),           // language → TreeSitter parser instance
_tsGrammarCache: new Map(),      // language → IndexedDB-cached ArrayBuffer

async loadGrammar(langKey, wasmFile) {
  if (this._tsParsers.has(langKey)) return this._tsParsers.get(langKey);

  // Check IndexedDB cache first
  const cached = await GraspDB.loadGrammar(langKey); // new IDB method
  const wasmBytes = cached || await fetch(
    `https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/${wasmFile}`
  ).then(r => r.arrayBuffer());
  if (!cached) await GraspDB.saveGrammar(langKey, wasmBytes);

  const Language = await TreeSitter.Language.load(new Uint8Array(wasmBytes));
  const parser = new TreeSitter();
  parser.setLanguage(Language);
  this._tsParsers.set(langKey, parser);
  return parser;
},
```

### Grammar pre-loading before analysis

Before any file is parsed, scan the file list, collect unique language keys, load all grammars in parallel:

```typescript
// In Parser (both MCP and browser)
async preloadGrammars(filePaths: string[]): Promise<void> {
  const langs = new Set(filePaths.map(p => detectLang(p)).filter(Boolean));
  await Promise.all([...langs].map(lang => loadGrammar(lang)));
}
```

Called in `analyzer.ts` after files are fetched, before the parse loop starts. For the browser, called at the start of `processFiles()` in `analyze()`.

### Integration into `Parser.extract()`

`Parser.extract(content, filename)` becomes:

```javascript
extract(content, filename) {
  const lang = detectLang(filename);
  const extractor = getExtractor(lang);          // from mcp/src/tree-sitter/index.ts
  const tsParser = this._tsParsers?.get(lang);   // pre-loaded or null

  if (extractor && tsParser) {
    try {
      const tree = tsParser.parse(content);
      const fns = extractor.extractDefinitions(tree, content, filename);
      tree.delete();
      return fns; // astBacked: true on each item
    } catch {
      // fall through to regex
    }
  }
  // existing regex extraction unchanged below
  return this._extractRegex(content, filename);
}
```

### Integration into `Parser.findCalls()`

Same pattern — if tree-sitter parser available for the language, use `extractor.countCalls()`. Otherwise use existing regex tokenizer. For Python this replaces the current ad-hoc walk with the same new extractor interface.

---

## Grammar registry

```typescript
// grammar-registry.ts
interface GrammarEntry {
  wasmFile: string;       // filename within tree-sitter-wasms/out/
  nodeModule: string;     // npm package for Node.js native binding
}

export const GRAMMAR_REGISTRY: Record<string, GrammarEntry> = {
  python:  { wasmFile: 'tree-sitter-python.wasm',   nodeModule: 'tree-sitter-python'  },
  go:      { wasmFile: 'tree-sitter-go.wasm',       nodeModule: 'tree-sitter-go'      },
  java:    { wasmFile: 'tree-sitter-java.wasm',     nodeModule: 'tree-sitter-java'    },
  kotlin:  { wasmFile: 'tree-sitter-kotlin.wasm',   nodeModule: 'tree-sitter-kotlin'  },
  rust:    { wasmFile: 'tree-sitter-rust.wasm',     nodeModule: 'tree-sitter-rust'    },
  c:       { wasmFile: 'tree-sitter-c.wasm',        nodeModule: 'tree-sitter-c'       },
  cpp:     { wasmFile: 'tree-sitter-cpp.wasm',      nodeModule: 'tree-sitter-cpp'     },
  csharp:  { wasmFile: 'tree-sitter-c_sharp.wasm',  nodeModule: 'tree-sitter-c-sharp' },
  ruby:    { wasmFile: 'tree-sitter-ruby.wasm',     nodeModule: 'tree-sitter-ruby'    },
};

// Extension → language key
export const EXT_TO_LANG: Record<string, string> = {
  '.py': 'python', '.pyw': 'python', '.pyi': 'python',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.rs': 'rust',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
};
```

---

## Extractor implementation strategy (per language)

Each extractor uses tree-sitter's **node-type queries** — no regex, just CST node type matching.

### Example: Go extractor

```typescript
// extractors/go.ts
export function extractDefinitions(tree, source, filename): FnDef[] {
  const fns: FnDef[] = [];
  function walk(node) {
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) fns.push({
        name: nameNode.text,
        file: filename,
        line: node.startPosition.row + 1,
        type: 'function',
        isTopLevel: true,
        isExported: /^[A-Z]/.test(nameNode.text), // Go export convention
        astBacked: true,
      });
    }
    if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      const receiverNode = node.childForFieldName('receiver');
      if (nameNode) fns.push({
        name: nameNode.text,
        file: filename,
        line: node.startPosition.row + 1,
        type: 'method',
        isTopLevel: false,
        isClassMethod: true,
        className: receiverNode?.text?.replace(/[*()\s]/g, '') ?? null,
        isExported: /^[A-Z]/.test(nameNode.text),
        astBacked: true,
      });
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i));
  }
  walk(tree.rootNode);
  return fns;
}

export function countCalls(tree, fnNames): Record<string, number> {
  const calls: Record<string, number> = {};
  fnNames.forEach(n => calls[n] = 0);
  function walk(node) {
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      const name = fn?.type === 'selector_expression'
        ? fn.childForFieldName('field')?.text
        : fn?.text;
      if (name && calls[name] !== undefined) calls[name]++;
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i));
  }
  walk(tree.rootNode);
  return calls;
}
```

Same pattern repeated for each language — node types differ but the structure is identical.

---

## Confidence indicator in UI

New `astBacked` boolean on `FnDef` propagates to the analysis result:

- **Health score breakdown**: "Analysis backed by AST for N languages" (shown when > 0 tree-sitter languages detected)
- **File detail panel**: small "AST" badge next to language label for tree-sitter-backed files
- **Heuristic files**: "~" prefix on function counts for regex-backed files (e.g. "~12 functions")

No UI changes required in the rendering pipeline — just the display logic in the health breakdown and file details panel.

---

## MCP server npm changes

Add to `mcp/package.json` dependencies:
```json
{
  "tree-sitter": "^0.22.0",
  "tree-sitter-python": "^0.23.0",
  "tree-sitter-go": "^0.23.0",
  "tree-sitter-java": "^0.23.0",
  "tree-sitter-kotlin": "^0.3.0",
  "tree-sitter-rust": "^0.23.0",
  "tree-sitter-c": "^0.23.0",
  "tree-sitter-cpp": "^0.23.0",
  "tree-sitter-c-sharp": "^0.23.0",
  "tree-sitter-ruby": "^0.23.0"
}
```

No browser-side npm changes — WASM loaded from existing CDN.

---

## IndexedDB grammar caching

New `GraspDB.loadGrammar(langKey)` and `GraspDB.saveGrammar(langKey, buffer)` methods in `index.html` — store WASM `ArrayBuffer` in a new `grammars` object store. Key: `tree-sitter-{lang}@0.1.13`. Never expires (grammar files are immutable at a fixed version).

---

## Migration strategy

1. All existing regex paths remain untouched — tree-sitter is purely additive
2. Each language extractor is independent — ship one at a time if needed
3. Existing 284 tests all pass (regex fallback always available)
4. New tests added per extractor: golden-file tests against known source snippets
5. If a grammar fails to load (CDN down, offline), analysis continues with regex — no user-visible error

---

## Testing approach

Per-language golden file tests:
```
mcp/tests/extractors/
  go.test.ts        — known Go source → expected FnDef[]
  java.test.ts
  kotlin.test.ts
  rust.test.ts
  c.test.ts
  cpp.test.ts
  csharp.test.ts
  ruby.test.ts
```

Each test:
1. Loads the tree-sitter grammar (node native binding)
2. Parses a 20–50 line golden fixture
3. Asserts exact `FnDef[]` output (name, line, type, isExported, className)
4. Asserts `countCalls()` correctly counts usage vs definition

Integration test: run `grasp_analyze` on `expressjs/express` (JS — already working), then on `golang/go/src/net/http` (Go — should now produce accurate function lists).

---

## What does NOT change

- `analyzer.ts` — zero changes (consumes same `FnDef` interface)
- `mcp/src/index.ts` — zero changes
- All existing MCP tools — zero changes
- `Parser.detectSecurity()`, `detectPatterns()`, `detectDuplicates()` — zero changes
- browser extension — zero changes
- All 284 existing tests — continue to pass

---

## Release: v3.9.6

Version bump across all 34 files. CHANGELOG entry:
> AST-backed parsing for Go, Java, Kotlin, Rust, C, C++, C#, Ruby via tree-sitter — more accurate function extraction, zero false positives from strings/comments, confidence indicators in UI
