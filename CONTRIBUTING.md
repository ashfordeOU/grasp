# Contributing to Grasp

## Setup (30 seconds)

```bash
git clone https://github.com/ashfordeOU/grasp.git
cd grasp
open index.html  # macOS
# Or: start index.html  (Windows)
# Or: xdg-open index.html  (Linux)
```

No `npm install`. No build step. The entire browser application is one HTML file.

For the MCP server:

```bash
cd mcp
npm install
npm run build
```

---

## Code Structure

### Browser App (`index.html`)

Search for `======` to jump between sections:

| Section | Purpose |
|---------|---------|
| CSS | All styles, CSS variables, component classes |
| CONFIGURATION | `THRESHOLDS`, `COLORS`, `LAYER_COLORS`, `IGNORE` constants |
| Parser | File detection, function extraction, quality analysis (~1400 lines) |
| Parser sub-objects | Named facades: `FileDetector`, `CodeExtractor`, `DependencyAnalyzer`, `PatternDetector`, `QualityAnalyzer` |
| GitHub | GitHub API client, rate limiting, pagination |
| Utility functions | `buildTree`, `calcBlast`, `calcHealth`, `findPath`, etc. |
| Modal components | `FilePreviewModal`, `ExportModal`, `UnusedFunctionsModal`, etc. |
| App component | Main React component: state, analysis pipeline, render |

### Parser sub-objects

The `Parser` object is split into named logical groups:

- **`FileDetector`** — `isCode`, `isText`, `isBinary`, `detectLayer`, etc.
- **`CodeExtractor`** — `extract`, `initTreeSitter`
- **`DependencyAnalyzer`** — `findCalls`, `prepareCallPatterns`
- **`PatternDetector`** — `detectPatterns`, `detectSecurity`
- **`QualityAnalyzer`** — `calcComplexity`, `lcsLength`, `detectDuplicates`, `detectLayerViolations`

All `Parser.X()` calls still work — the sub-objects are backward-compatible facades.

### MCP Server (`mcp/`)

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server entry — 15 tool definitions |
| `src/analyzer.ts` | Analysis pipeline (dependency graph, cycle detection, metrics) — also exported as `dist/analyzer.js` for external consumers |
| `src/cli.ts` | `grasp` CLI binary — opens browser pre-loaded or `--report` for terminal output |
| `src/parser.js` | Parser engine shared with the browser app |
| `src/sources/github.ts` | GitHub API client via `@octokit/rest` |
| `src/sources/local.ts` | Local filesystem reader |
| `src/types.ts` | TypeScript interfaces |

### VS Code Extension (`vscode-extension/`)

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry — registers the sidebar webview, handles file-switch events |
| `build.mjs` | esbuild script — outputs `dist/extension.js` |
| `package.json` | Extension manifest — contributes `grasp.panel` sidebar view |

```bash
cd vscode-extension
npm install
npm run build   # or: F5 in VS Code to launch Extension Development Host
```

---

## Adding a New Analysis

1. Add your detection logic to the appropriate `Parser` sub-object
2. Call it in `finishAnalysis()` (search for `Phase 4: Quality analysis`)
3. Store results in the `analyzed` array or as a separate property on the data object
4. Render it in the right panel (search for `rightTab==='issues'`)
5. If it should be accessible to agents, add a corresponding MCP tool in `mcp/src/index.ts`

Example — adding "long function" detection:

```js
// In QualityAnalyzer (or directly in Parser)
detectLongFunctions: function(files) {
    return files.flatMap(function(f) {
        return (f.functions || []).filter(function(fn) {
            return (fn.code || '').split('\n').length > 50;
        }).map(function(fn) {
            return { file: f.path, name: fn.name, lines: fn.code.split('\n').length };
        });
    });
},
```

---

## Architecture Rules

Architecture rules are stored in `localStorage` under `grasp_arch_rules`. The default rules are in `DEFAULT_ARCH_RULES`. To add a new default:

```js
var DEFAULT_ARCH_RULES = [
    // ... existing rules ...
    { from: 'data', to: 'services', type: 'FORBIDDEN', reason: 'Data layer should not call services' },
];
```

---

## Thresholds

All tuneable values are in the `THRESHOLDS` object (search for `CONFIGURATION`). To change any threshold:

```js
var THRESHOLDS = {
    maxFunctionsPerFile: 15,   // Change this to tune god-file detection
    complexityCritical: 30,    // Change this to tune complexity levels
    // ...
};
```

---

## Algorithmic Self-Tests

Open `index.html#test` in your browser to run the built-in algorithmic tests. All `console.assert` calls must pass before submitting a PR.

---

## PR Checklist

- [ ] Browser changes are in `index.html` only (unless also updating docs)
- [ ] MCP changes are in `mcp/src/` — run `npm run build` to verify it compiles
- [ ] VS Code extension changes are in `vscode-extension/src/` — run `npm run build` there too
- [ ] No regressions when analyzing `facebook/react` (medium-large repo)
- [ ] Health score, file count, and issue count are stable or improved
- [ ] `index.html#test` passes (open in browser, check console)
- [ ] New tuneable values use `THRESHOLDS.*`, not hardcoded numbers
- [ ] Update `mcp/README.md` tool table if adding/changing MCP tools

---

## Questions?

Open an issue on GitHub. We're friendly.
