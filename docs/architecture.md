# Grasp Architecture

## Overview

Grasp is a single-file browser application (`index.html`) with no build step. All code runs client-side via CDN-loaded libraries.

```
Browser
  │
  ├── React 18 (CDN)     — UI rendering, state management
  ├── D3.js 7 (CDN)      — Graph and chart visualizations
  └── Babel (CDN)        — JSX transpilation at runtime

index.html
  │
  ├── <style>            CSS custom properties, all component styles
  ├── <script type="text/babel">
  │     ├── CONFIGURATION  THRESHOLDS, COLORS, LAYER_COLORS, IGNORE
  │     ├── Parser          File detection, extraction, quality analysis
  │     ├── Parser sub-objects  FileDetector, CodeExtractor, etc.
  │     ├── GitHub          API client with rate limiting
  │     ├── Utility fns     calcBlast, calcHealth, findPath, etc.
  │     ├── Modal components PrivateKeyModal, FilePreviewModal, etc.
  │     └── App             Main React component
  └── ReactDOM.createRoot(...)
```

---

## Data Flow

```
User Input (URL or local folder)
  │
  ▼
GitHub.fetchTree()            — or —    readDirectory()
  │                                        │
  ▼                                        ▼
Array<FileMetadata>          Array<FileMetadata>
  │
  ▼
processFiles() — concurrent fetch pool (20×/5×/2× based on rate limit)
  │
  ▼
For each file:
  ├── Parser.extract(content, path)       → functions[]
  ├── Parser.calcComplexity(content, path) → {score, level}
  ├── calcNestingDepth(content)            → number
  └── Parser.detectLayer(path)             → string

finishAnalysis():
  ├── Phase 1: findCalls (parallel, precompiled patterns)
  ├── Phase 2: Build connections graph
  ├── Phase 3: Detect dead functions
  ├── Phase 4: Quality analysis
  │     ├── Parser.detectPatterns(analyzed)
  │     ├── Parser.detectSecurity(analyzed)
  │     ├── Parser.detectDuplicates(analyzed, allFns)
  │     ├── Parser.detectLayerViolations(analyzed, conns)
  │     └── applyArchitectureRules(analyzed, conns, rules)
  └── Phase 5: Build data object → setData(data)
```

---

## Key Objects

### Parser (and sub-objects)

The monolithic `Parser` object handles all code analysis. Sub-objects provide named groupings:

- **FileDetector** — extension checks, layer detection
- **CodeExtractor** — function extraction (regex + tree-sitter WASM for Python)
- **DependencyAnalyzer** — call graph construction, pattern pre-compilation
- **PatternDetector** — design patterns, security vulnerabilities
- **QualityAnalyzer** — complexity, duplicates, layer violations, LCS similarity

### GitHub

Stateless API client. Manages:
- Rate limit tracking (`rateLimit.remaining`)
- Auth headers (PAT or GitHub App JWT)
- Paginated fetching (`fetchPaginated` follows `Link: rel="next"`)
- Concurrent file fetching (20×/5×/2× pool)

### App State

Key state variables in the `App` React component:

| Variable | Type | Purpose |
|----------|------|---------|
| `data` | Object | Full analysis result |
| `selected` | string | Selected file path |
| `blastRadius` | Object | Blast radius for selected file |
| `graphConfig` | Object | Viz type, view mode, layout options |
| `colorMode` | string | Active color scheme |
| `archRules` | Array | Architecture rules (from localStorage) |

---

## Connection Graph Format

Connections represent "file A exports a function called by file B":

```js
{
    source: "src/utils/helpers.js",  // file that defines the function
    target: "src/components/App.js", // file that calls the function
    fn: "formatDate",                // function name
    count: 3                         // number of calls
}
```

---

## Architecture Rule Engine

Rules are stored in `localStorage` under `grasp_arch_rules`. Format:

```json
[
  { "from": "config", "to": "ui", "type": "FORBIDDEN", "reason": "Config should not depend on UI" }
]
```

`from` and `to` match `Parser.detectLayer()` output values: `config`, `utils`, `data`, `services`, `modules`, `components`, `ui`, `test`.

---

## Performance Notes

- **LCS cap**: The LCS algorithm is capped at 1M DP cells (`THRESHOLDS.lcsMaxCells`) to prevent freezing
- **Regex pre-compilation**: `prepareCallPatterns()` compiles all RegExps once per analysis run
- **Concurrent fetching**: 20× parallel GitHub API calls when rate limit allows
- **Node clustering**: Force graph clusters folders when >500 nodes
- **LOD**: Labels and hull outlines are hidden at low zoom levels
- **D3 sim pause**: Force simulation stops when not on the graph view
