# Grasp v3.12.0 — GitNexus Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 GitNexus-competitive MCP tools to the Grasp server and bump the project to v3.12.0.

**Architecture:** Each tool is a self-contained `server.registerTool()` call appended to `mcp/src/index.ts` (before the `// Start server` comment at line 6177). All tools use the existing `getSession()` / `truncate()` helpers and the `AnalysisResult` type. No new files or dependencies are required.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, esbuild (via `node build.mjs`), Vitest for smoke tests.

---

## File Map

| File | Action |
|------|--------|
| `mcp/src/index.ts` | Add 7 tool registrations before line `// Start server` |
| `mcp/tests/smoke-new-tools.test.ts` | Add 7 smoke tests inside existing `describe('new enterprise tools smoke test')` block |
| All version files per CLAUDE.md checklist | Bump `3.11.0` → `3.12.0` |

---

## Shared Context (read once, keep in mind for all tasks)

### getSession helper (line 86)
```typescript
async function getSession(id: string): Promise<AnalysisResult | null> {
  // returns cached AnalysisResult or null
}
```

### truncate helper (line 92)
```typescript
function truncate(text: string, limit = CHARACTER_LIMIT): string {
  // trims to character limit with ellipsis
}
```

### Tool registration pattern
```typescript
server.registerTool(
  'grasp_tool_name',
  {
    title: 'Human-readable title',
    description: `Multi-line description for the LLM.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      // ...other params
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (args) => {
    const data = await getSession(args.session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${args.session_id} not found. Run grasp_analyze first.` }] };
    // ...
    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

### Smoke test pattern
```typescript
// Inside describe('new enterprise tools smoke test', () => { ... })
test('grasp_tool_name — short description', async () => {
  const r = await ok('grasp_tool_name');
  expect(r).toHaveProperty('expected_field');
}, TIMEOUT);
```

### Key AnalysisResult fields
- `data.files` — `AnalyzedFile[]`: each has `.path`, `.name`, `.functions` (array of `FunctionDef`), `.content`, `.layer`, `.imports`
- `data.connections` — `Connection[]`: each has `.source` (file defining fn), `.target` (file calling fn), `.fn`, `.count`
- `data.summary.layers` — `string[]`
- `data.summary.topFolders` — `Array<{name,count}>`
- `data.patterns` — `PatternResult[]`
- `data.issues` — `Issue[]`
- `FunctionDef` fields: `.name`, `.file`, `.line`, `.isExported`, `.isClassMethod`, `.className`, `.returnType`

---

## Task 1: grasp_diff_symbols — Git Diff → Symbol Mapping

**Files:**
- Modify: `mcp/src/index.ts` — add tool registration before `// Start server`
- Modify: `mcp/tests/smoke-new-tools.test.ts` — add smoke test

### What it does
Parses a unified diff (the text output of `git diff`), maps changed line ranges to function/class definitions in the session, and returns the affected symbols plus a blast-radius count based on how many other files call each affected function.

- [ ] **Step 1: Write the failing smoke test**

Add inside the `describe('new enterprise tools smoke test')` block in `mcp/tests/smoke-new-tools.test.ts`:

```typescript
test('grasp_diff_symbols — maps diff hunks to functions', async () => {
  const fakeDiff = `diff --git a/mcp/src/index.ts b/mcp/src/index.ts
index abc..def 100644
--- a/mcp/src/index.ts
+++ b/mcp/src/index.ts
@@ -100,7 +100,7 @@ function foo() {
-  return 1;
+  return 2;
 }`;
  const r = await ok('grasp_diff_symbols', { diff: fakeDiff });
  expect(r).toHaveProperty('changed_symbols');
  expect(r).toHaveProperty('blast_radius_total');
  expect(Array.isArray((r as any).changed_symbols)).toBe(true);
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_diff_symbols" 2>&1 | tail -20
```
Expected: FAIL — `grasp_diff_symbols` not found / error response.

- [ ] **Step 3: Implement the tool**

In `mcp/src/index.ts`, immediately before the line `// =====================================================================\n// Start server`, add:

```typescript
// =====================================================================
// TOOL: grasp_diff_symbols
// =====================================================================
server.registerTool(
  'grasp_diff_symbols',
  {
    title: 'Diff → Symbol Mapping',
    description: `Parse a unified git diff and map changed line ranges to function/class definitions in the analysed codebase.

Returns:
- changed_symbols: list of functions/classes touched by the diff, with file, line, and caller count
- blast_radius_total: sum of unique files that depend on any changed symbol
- diff_files: list of source files mentioned in the diff

Pipe \`git diff HEAD~1\` (or any unified diff) into the \`diff\` parameter.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      diff: z.string().describe('Unified diff text (output of git diff)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, diff }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    // Parse unified diff: extract file paths and changed line ranges
    interface HunkRange { start: number; end: number; }
    const fileHunks = new Map<string, HunkRange[]>();
    let currentFile = '';
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6).trim();
        if (!fileHunks.has(currentFile)) fileHunks.set(currentFile, []);
      } else if (line.startsWith('@@ ') && currentFile) {
        // @@ -oldStart,oldCount +newStart,newCount @@
        const m = line.match(/@@ [^+]*\+(\d+)(?:,(\d+))? @@/);
        if (m) {
          const start = parseInt(m[1], 10);
          const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
          fileHunks.get(currentFile)!.push({ start, end: start + Math.max(count - 1, 0) });
        }
      }
    }

    // Build caller counts from connections
    const callerCount = new Map<string, number>();
    for (const conn of data.connections) {
      callerCount.set(conn.fn, (callerCount.get(conn.fn) ?? 0) + conn.count);
    }

    // Map changed line ranges to functions
    interface ChangedSymbol {
      name: string;
      file: string;
      line: number;
      caller_count: number;
      type: string;
    }
    const changedSymbols: ChangedSymbol[] = [];
    const affectedFiles = new Set<string>();

    for (const file of data.files) {
      const hunks = fileHunks.get(file.path) ?? fileHunks.get(file.name) ?? [];
      if (hunks.length === 0) continue;
      for (const fn of file.functions) {
        const fnLine = fn.line ?? 0;
        // Function is "touched" if any hunk overlaps its definition line (±5 line tolerance)
        const touched = hunks.some(h => fnLine >= h.start - 5 && fnLine <= h.end + 5);
        if (touched) {
          changedSymbols.push({
            name: fn.name,
            file: file.path,
            line: fnLine,
            caller_count: callerCount.get(fn.name) ?? 0,
            type: fn.isClassMethod ? 'method' : fn.isExported ? 'exported_function' : 'function',
          });
          // Count files that call this function
          for (const conn of data.connections) {
            if (conn.fn === fn.name) affectedFiles.add(conn.target);
          }
        }
      }
    }

    // Sort by blast radius descending
    changedSymbols.sort((a, b) => b.caller_count - a.caller_count);

    const result = {
      diff_files: Array.from(fileHunks.keys()),
      changed_symbols: changedSymbols,
      blast_radius_total: affectedFiles.size,
      summary: `${changedSymbols.length} symbols changed across ${fileHunks.size} files; ${affectedFiles.size} dependent files potentially affected`,
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_diff_symbols" 2>&1 | tail -20
```
Expected: PASS — `changed_symbols` and `blast_radius_total` present.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_diff_symbols — git diff to symbol mapping"
```

---

## Task 2: grasp_exec_flow — Execution Flow Tracing

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
BFS from a named entry-point function through the `connections` graph, labelling each hop as `STEP_IN_PROCESS`. Returns an ordered list of execution steps plus a Mermaid flowchart.

- [ ] **Step 1: Write the failing smoke test**

Add inside the `describe` block:

```typescript
test('grasp_exec_flow — execution flow from entry point', async () => {
  // Use the first exported function name from the session as entry point
  const r = await ok('grasp_exec_flow', { entry_point: 'main', max_depth: 3 });
  expect(r).toHaveProperty('steps');
  expect(r).toHaveProperty('mermaid');
  expect(Array.isArray((r as any).steps)).toBe(true);
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_exec_flow" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

In `mcp/src/index.ts`, after the `grasp_diff_symbols` registration, add:

```typescript
// =====================================================================
// TOOL: grasp_exec_flow
// =====================================================================
server.registerTool(
  'grasp_exec_flow',
  {
    title: 'Execution Flow Tracer',
    description: `Trace execution flow from a named entry-point function through the call graph using BFS, labelling each hop as a STEP_IN_PROCESS edge.

Returns:
- steps: ordered list of {step, function, file, callers} — the execution chain
- mermaid: a Mermaid flowchart LR diagram of the traced path
- edge_count: total STEP_IN_PROCESS edges found

Use this to understand what a function triggers end-to-end, ideal for onboarding and PR review.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      entry_point: z.string().describe('Function name to start tracing from'),
      max_depth: z.number().int().min(1).max(10).default(5).describe('Maximum BFS depth (1–10)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, entry_point, max_depth }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    // Build adjacency: function → [called functions]  (source defines fn, target calls it → reverse: caller→callee)
    // Connection: source = file defining fn, target = file calling fn, fn = function name
    // We want: given a function at entry_point, what functions does it call?
    // Build a map: callerFile → [{callee fn, callee file}]
    // The connections tell us: fn is defined in source, called from target
    // So for exec flow: if we're "in" a function F defined in file S, we look for connections where target == S
    // and then follow those callees. Simpler approach: function name → functions it calls via name-based graph.

    // Build: fnName → set of fnNames it calls (based on co-occurrence in same source file's connections)
    const callsMap = new Map<string, Set<string>>();
    const fnFileMap = new Map<string, string>(); // fnName → file

    for (const file of data.files) {
      for (const fn of file.functions) {
        fnFileMap.set(fn.name, file.path);
      }
    }

    // connections: fn defined in source, called from target — we infer "source file's functions call fn"
    // Group by target file: all fns called by code in that file
    const fileCallsMap = new Map<string, Set<string>>(); // file → fns it calls
    for (const conn of data.connections) {
      if (!fileCallsMap.has(conn.target)) fileCallsMap.set(conn.target, new Set());
      fileCallsMap.get(conn.target)!.add(conn.fn);
    }

    // For each function, the functions it calls = fileCallsMap[fnFileMap[fnName]]
    for (const [fnName, filePath] of fnFileMap) {
      const called = fileCallsMap.get(filePath);
      if (called) callsMap.set(fnName, called);
    }

    // BFS
    interface Step { step: number; function: string; file: string; depth: number; parent: string | null; }
    const visited = new Set<string>();
    const queue: Array<{ fn: string; depth: number; parent: string | null }> = [
      { fn: entry_point, depth: 0, parent: null }
    ];
    const steps: Step[] = [];

    while (queue.length > 0) {
      const { fn, depth, parent } = queue.shift()!;
      if (visited.has(fn) || depth > max_depth) continue;
      visited.add(fn);

      steps.push({
        step: steps.length + 1,
        function: fn,
        file: fnFileMap.get(fn) ?? 'unknown',
        depth,
        parent,
      });

      if (depth < max_depth) {
        const callees = callsMap.get(fn) ?? new Set();
        for (const callee of callees) {
          if (!visited.has(callee)) {
            queue.push({ fn: callee, depth: depth + 1, parent: fn });
          }
        }
      }
    }

    // Build Mermaid flowchart
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');
    const mermaidLines = ['flowchart LR'];
    for (const step of steps) {
      const fileShort = step.file.split('/').pop() ?? step.file;
      mermaidLines.push(`  ${sanitize(step.function)}["${step.function}\\n${fileShort}"]`);
    }
    const edges: string[] = [];
    for (const step of steps) {
      if (step.parent) {
        edges.push(`  ${sanitize(step.parent)} -->|STEP_IN_PROCESS| ${sanitize(step.function)}`);
      }
    }
    mermaidLines.push(...edges);
    if (steps.length > 0) {
      mermaidLines.push(`  style ${sanitize(entry_point)} fill:#00d4aa,color:#000`);
    }

    const result = {
      entry_point,
      steps: steps.map(s => ({ step: s.step, function: s.function, file: s.file, called_by: s.parent })),
      edge_count: edges.length,
      mermaid: mermaidLines.join('\n'),
      summary: steps.length === 0
        ? `Function "${entry_point}" not found in session. Check the function name.`
        : `Traced ${steps.length} steps from "${entry_point}" (max depth ${max_depth})`,
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_exec_flow" 2>&1 | tail -20
```
Expected: PASS — `steps`, `mermaid`, `edge_count` present.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_exec_flow — STEP_IN_PROCESS execution flow tracer"
```

---

## Task 3: grasp_skillmd — Auto-Generated SKILL.md

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
Generates a ready-to-paste `SKILL.md` (or `CLAUDE.md` snippet) from the analysis session — covering architecture layers, critical files, exported API surface, detected patterns, and open issues.

- [ ] **Step 1: Write the failing smoke test**

```typescript
test('grasp_skillmd — generates SKILL.md content', async () => {
  const r = await ok('grasp_skillmd');
  expect(r).toHaveProperty('skillmd');
  expect(typeof (r as any).skillmd).toBe('string');
  expect((r as any).skillmd.length).toBeGreaterThan(50);
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_skillmd" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

```typescript
// =====================================================================
// TOOL: grasp_skillmd
// =====================================================================
server.registerTool(
  'grasp_skillmd',
  {
    title: 'SKILL.md Generator',
    description: `Auto-generate a SKILL.md (or CLAUDE.md snippet) from the analysed codebase.

The document covers:
- Architecture overview (layers, top folders)
- Critical files (highest fan-in)
- Exported API surface (top exported functions sorted by caller count)
- Detected patterns and anti-patterns
- Open issues (critical + warnings)
- Quick-start commands (if detectable)

Paste the output directly into SKILL.md, CLAUDE.md, or a system prompt.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      repo_name: z.string().optional().describe('Repository name override for the heading (default: derived from source)'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, repo_name }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    const name = repo_name ?? data.source.split('/').slice(-1)[0] ?? data.source;
    const s = data.summary;

    // Compute fan-in per file
    const fanIn = new Map<string, number>();
    for (const conn of data.connections) {
      fanIn.set(conn.source, (fanIn.get(conn.source) ?? 0) + conn.count);
    }
    const criticalFiles = [...fanIn.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([f, n]) => `- \`${f}\` (${n} incoming calls)`);

    // Exported functions sorted by caller count
    const callerCount = new Map<string, number>();
    for (const conn of data.connections) {
      callerCount.set(conn.fn, (callerCount.get(conn.fn) ?? 0) + conn.count);
    }
    const exportedFns: Array<{ name: string; file: string; callers: number }> = [];
    for (const file of data.files) {
      for (const fn of file.functions) {
        if (fn.isExported) {
          exportedFns.push({ name: fn.name, file: file.path, callers: callerCount.get(fn.name) ?? 0 });
        }
      }
    }
    exportedFns.sort((a, b) => b.callers - a.callers);
    const topExports = exportedFns.slice(0, 12).map(f => `- \`${f.name}\` in \`${f.file}\` (${f.callers} callers)`);

    // Patterns
    const goodPatterns = data.patterns.filter(p => !p.isAnti && p.severity !== 'critical').slice(0, 5);
    const antiPatterns = data.patterns.filter(p => p.isAnti || p.severity === 'critical').slice(0, 5);

    // Issues
    const criticals = data.issues.filter(i => i.type === 'critical').slice(0, 5);
    const warnings = data.issues.filter(i => i.type === 'warning').slice(0, 5);

    const lines: string[] = [
      `# ${name} — Codebase Skill`,
      ``,
      `> Auto-generated by Grasp on ${new Date().toISOString().slice(0, 10)}. ` +
        `Health: **${s.healthGrade}** (${s.healthScore}/100)`,
      ``,
      `## Overview`,
      ``,
      `- **${s.fileCount}** files, **${s.codeFileCount}** code files`,
      `- **${s.functionCount}** functions, **${s.connectionCount}** cross-file calls`,
      `- **Languages:** ${s.languages.slice(0, 6).map(l => `${l.ext} (${l.count})`).join(', ')}`,
      ``,
      `## Architecture Layers`,
      ``,
      ...(s.layers.length > 0
        ? s.layers.map(l => `- \`${l}\``)
        : ['- (no layers detected)']),
      ``,
      `## Top Folders`,
      ``,
      ...s.topFolders.slice(0, 8).map(f => `- \`${f.name}/\` — ${f.count} files`),
      ``,
      `## Critical Files (highest fan-in)`,
      ``,
      ...(criticalFiles.length > 0 ? criticalFiles : ['- (none detected)']),
      ``,
      `## Exported API Surface`,
      ``,
      ...(topExports.length > 0 ? topExports : ['- (no exported functions detected)']),
      ``,
    ];

    if (goodPatterns.length > 0) {
      lines.push(`## Detected Patterns`, ``);
      for (const p of goodPatterns) {
        lines.push(`- **${p.icon} ${p.name}**: ${p.desc}`);
      }
      lines.push(``);
    }

    if (antiPatterns.length > 0) {
      lines.push(`## Anti-Patterns / Watch Out`, ``);
      for (const p of antiPatterns) {
        lines.push(`- **${p.icon} ${p.name}**: ${p.desc}`);
      }
      lines.push(``);
    }

    if (criticals.length > 0 || warnings.length > 0) {
      lines.push(`## Open Issues`, ``);
      for (const i of criticals) {
        lines.push(`- 🔴 **${i.title}**: ${i.desc}`);
      }
      for (const i of warnings) {
        lines.push(`- 🟡 **${i.title}**: ${i.desc}`);
      }
      lines.push(``);
    }

    lines.push(
      `## Session`,
      ``,
      `\`\`\``,
      `session_id: ${data.sessionId}`,
      `source:     ${data.source}`,
      `analysed:   ${data.analyzedAt}`,
      `\`\`\``,
    );

    const skillmd = lines.join('\n');
    const result = { skillmd, char_count: skillmd.length };
    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_skillmd" 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_skillmd — auto-generated SKILL.md from analysis"
```

---

## Task 4: grasp_hooks — Claude Code + Cursor Hooks Generator

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
Generates ready-to-use hook configuration files for Claude Code (`.claude/settings.json` PostToolUse hook) and Cursor (`.cursor/rules/grasp.mdc`), plus a `CLAUDE.md` snippet that injects architecture context into every AI session.

- [ ] **Step 1: Write the failing smoke test**

```typescript
test('grasp_hooks — generates Claude Code + Cursor hooks', async () => {
  const r = await ok('grasp_hooks');
  expect(r).toHaveProperty('claude_settings_json');
  expect(r).toHaveProperty('cursor_mdc');
  expect(r).toHaveProperty('claudemd_snippet');
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_hooks" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

```typescript
// =====================================================================
// TOOL: grasp_hooks
// =====================================================================
server.registerTool(
  'grasp_hooks',
  {
    title: 'Claude Code + Cursor Hooks Generator',
    description: `Generate ready-to-use AI tool configuration files from the analysed codebase.

Outputs:
- claude_settings_json: .claude/settings.json with a PostToolUse hook that warns when edits touch critical files
- cursor_mdc: .cursor/rules/grasp.mdc with layer constraints and critical file annotations
- claudemd_snippet: paste into CLAUDE.md to inject architecture context into every session

The hook warns the AI when it edits a high-fan-in file, prompting it to check downstream callers.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      warn_threshold: z.number().int().min(1).default(5).describe('Fan-in count above which a file is flagged as critical'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, warn_threshold }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    // Compute fan-in per file
    const fanIn = new Map<string, number>();
    for (const conn of data.connections) {
      fanIn.set(conn.source, (fanIn.get(conn.source) ?? 0) + conn.count);
    }
    const criticalFiles = [...fanIn.entries()]
      .filter(([, n]) => n >= warn_threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([f]) => f);

    const layers = data.summary.layers;
    const source = data.source;

    // .claude/settings.json PostToolUse hook
    const hookScript = criticalFiles.length > 0
      ? [
          `#!/bin/bash`,
          `# Grasp critical-file guard — auto-generated`,
          `CRITICAL=(${criticalFiles.map(f => `"${f}"`).join(' ')})`,
          `EDITED="$1"`,
          `for f in "\${CRITICAL[@]}"; do`,
          `  if [[ "$EDITED" == *"$f"* ]]; then`,
          `    echo "⚠️  GRASP: $f has ${warn_threshold}+ callers. Check downstream impact before committing."`,
          `    exit 0`,
          `  fi`,
          `done`,
        ].join('\n')
      : `#!/bin/bash\n# No critical files detected (threshold: ${warn_threshold})`;

    const claudeSettings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: hookScript,
              },
            ],
          },
        ],
      },
    };

    // .cursor/rules/grasp.mdc
    const layerRules = layers.length > 0
      ? layers.map((l, i) =>
          `${i + 1}. Layer \`${l}\` — dependencies should only flow downward (higher index → lower index).`
        ).join('\n')
      : 'No layer information detected.';

    const criticalList = criticalFiles.slice(0, 10).map(f => `- \`${f}\``).join('\n');

    const cursorMdc = [
      `---`,
      `description: Grasp architecture rules for ${source}`,
      `globs: ["**/*"]`,
      `alwaysApply: true`,
      `---`,
      ``,
      `# Architecture Rules — ${source}`,
      ``,
      `## Layer Constraints`,
      ``,
      layerRules,
      ``,
      `## Critical Files (${warn_threshold}+ callers — edit with care)`,
      ``,
      criticalList || '(none above threshold)',
      ``,
      `## Health`,
      ``,
      `Grade: **${data.summary.healthGrade}** (${data.summary.healthScore}/100)  `,
      `Session: \`${data.sessionId}\``,
    ].join('\n');

    // CLAUDE.md snippet
    const claudemdSnippet = [
      `## Codebase Architecture (Grasp — ${new Date().toISOString().slice(0, 10)})`,
      ``,
      `- **Source:** ${source}  `,
      `- **Health:** ${data.summary.healthGrade} (${data.summary.healthScore}/100)  `,
      `- **Layers:** ${layers.join(' → ') || 'none detected'}  `,
      `- **Files:** ${data.summary.codeFileCount} code files, ${data.summary.functionCount} functions`,
      ``,
      `### Critical Files`,
      ``,
      criticalFiles.slice(0, 8).map(f => `- \`${f}\` (${fanIn.get(f)} callers)`).join('\n') || '(none)',
      ``,
      `### Layer Rules`,
      ``,
      layerRules,
    ].join('\n');

    const result = {
      claude_settings_json: JSON.stringify(claudeSettings, null, 2),
      cursor_mdc: cursorMdc,
      claudemd_snippet: claudemdSnippet,
      critical_files_count: criticalFiles.length,
      instructions: [
        'Save claude_settings_json to .claude/settings.json in your project root',
        'Save cursor_mdc to .cursor/rules/grasp.mdc',
        'Append claudemd_snippet to CLAUDE.md',
      ],
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_hooks" 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_hooks — Claude Code + Cursor hooks generator"
```

---

## Task 5: grasp_mro — Method Resolution Order

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
Extracts class hierarchies from file content using regex, then computes Method Resolution Order (MRO) for Python (C3 linearization), Java, and Ruby. Returns per-class MRO chains and flags methods overridden at multiple levels.

- [ ] **Step 1: Write the failing smoke test**

```typescript
test('grasp_mro — method resolution order for class hierarchies', async () => {
  const r = await ok('grasp_mro');
  expect(r).toHaveProperty('classes');
  expect(r).toHaveProperty('language_summary');
  expect(Array.isArray((r as any).classes)).toBe(true);
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_mro" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

```typescript
// =====================================================================
// TOOL: grasp_mro
// =====================================================================
server.registerTool(
  'grasp_mro',
  {
    title: 'Method Resolution Order',
    description: `Compute Method Resolution Order (MRO) for class hierarchies in Python, Ruby, and Java/Kotlin.

- Python: C3 linearization (same algorithm as CPython)
- Java/Kotlin/Scala: linearization following single-inheritance chain + interfaces
- Ruby: include/prepend order

Returns per-class MRO chains and flags methods overridden at multiple levels (diamond-inheritance risks).

Useful for understanding polymorphism, debugging unexpected method dispatch, and refactoring class trees.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      class_filter: z.string().optional().describe('Optional class name substring filter'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, class_filter }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    interface ClassInfo {
      name: string;
      file: string;
      language: string;
      parents: string[];
      methods: string[];
    }

    const classes = new Map<string, ClassInfo>();

    // Regex patterns for class extraction
    const pyClass = /^class\s+(\w+)\s*(?:\(([^)]*)\))?/gm;
    const javaClass = /(?:class|interface)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/gm;
    const rubyClass = /^class\s+(\w+)(?:\s*<\s*(\w+))?/gm;
    const rubyInclude = /(?:include|prepend)\s+(\w+)/gm;

    for (const file of data.files) {
      const content = file.content ?? '';
      if (!content) continue;
      const ext = file.path.split('.').pop() ?? '';

      if (ext === 'py') {
        let m: RegExpExecArray | null;
        pyClass.lastIndex = 0;
        while ((m = pyClass.exec(content)) !== null) {
          const name = m[1];
          const parents = m[2] ? m[2].split(',').map(s => s.trim()).filter(s => s && s !== 'object') : [];
          if (!class_filter || name.includes(class_filter)) {
            const methods = file.functions
              .filter(f => f.isClassMethod && f.className === name)
              .map(f => f.name);
            classes.set(name, { name, file: file.path, language: 'python', parents, methods });
          }
        }
      } else if (['java', 'kt', 'scala'].includes(ext)) {
        let m: RegExpExecArray | null;
        javaClass.lastIndex = 0;
        while ((m = javaClass.exec(content)) !== null) {
          const name = m[1];
          const parents: string[] = [];
          if (m[2]) parents.push(m[2].trim());
          if (m[3]) parents.push(...m[3].split(',').map(s => s.trim()).filter(Boolean));
          if (!class_filter || name.includes(class_filter)) {
            const methods = file.functions
              .filter(f => f.isClassMethod && f.className === name)
              .map(f => f.name);
            classes.set(name, { name, file: file.path, language: ext, parents, methods });
          }
        }
      } else if (ext === 'rb') {
        let m: RegExpExecArray | null;
        rubyClass.lastIndex = 0;
        while ((m = rubyClass.exec(content)) !== null) {
          const name = m[1];
          const parents: string[] = m[2] ? [m[2].trim()] : [];
          // Extract includes/prepends after the class definition
          const classStart = m.index;
          const classBody = content.slice(classStart, classStart + 2000);
          rubyInclude.lastIndex = 0;
          let inc: RegExpExecArray | null;
          while ((inc = rubyInclude.exec(classBody)) !== null) {
            parents.push(inc[1]);
          }
          if (!class_filter || name.includes(class_filter)) {
            const methods = file.functions
              .filter(f => f.isClassMethod && f.className === name)
              .map(f => f.name);
            classes.set(name, { name, file: file.path, language: 'ruby', parents, methods });
          }
        }
      }
    }

    // C3 linearization for Python
    function c3(name: string, seen = new Set<string>()): string[] {
      if (seen.has(name)) return [name]; // cycle guard
      seen.add(name);
      const info = classes.get(name);
      if (!info || info.parents.length === 0) return [name];

      // Build linearizations of all parents
      const parentLinears = info.parents.map(p => c3(p, new Set(seen)));
      const allLists = [...parentLinears, [...info.parents]];

      const result = [name];
      while (allLists.some(l => l.length > 0)) {
        let head: string | null = null;
        for (const list of allLists) {
          if (list.length === 0) continue;
          const candidate = list[0];
          // candidate is good if it doesn't appear in the tail of any list
          const inTail = allLists.some(l => l.slice(1).includes(candidate));
          if (!inTail) { head = candidate; break; }
        }
        if (!head) break; // inconsistent hierarchy
        result.push(head);
        for (const list of allLists) {
          const idx = list.indexOf(head);
          if (idx !== -1) list.splice(idx, 1);
        }
      }
      return result;
    }

    // Simple linearization for Java/Ruby (DFS)
    function linearize(name: string, seen = new Set<string>()): string[] {
      if (seen.has(name)) return [];
      seen.add(name);
      const info = classes.get(name);
      if (!info) return [name];
      const chain = [name];
      for (const p of info.parents) {
        chain.push(...linearize(p, seen));
      }
      return chain;
    }

    interface ClassMRO {
      name: string;
      file: string;
      language: string;
      mro: string[];
      depth: number;
      overridden_methods: string[];
    }

    const results: ClassMRO[] = [];

    for (const [, info] of classes) {
      const mro = info.language === 'python' ? c3(info.name) : linearize(info.name);

      // Find methods defined in multiple places in the MRO chain
      const methodSets = mro.map(className => {
        const c = classes.get(className);
        return { className, methods: new Set(c?.methods ?? []) };
      });
      const overridden: string[] = [];
      for (const method of info.methods) {
        const definedIn = methodSets.filter(s => s.methods.has(method));
        if (definedIn.length > 1) overridden.push(method);
      }

      results.push({
        name: info.name,
        file: info.file,
        language: info.language,
        mro,
        depth: mro.length,
        overridden_methods: overridden,
      });
    }

    results.sort((a, b) => b.depth - a.depth);

    const languageSummary: Record<string, number> = {};
    for (const r of results) {
      languageSummary[r.language] = (languageSummary[r.language] ?? 0) + 1;
    }

    const result = {
      classes: results,
      total_classes: results.length,
      max_hierarchy_depth: results.length > 0 ? Math.max(...results.map(r => r.depth)) : 0,
      language_summary: languageSummary,
      classes_with_overrides: results.filter(r => r.overridden_methods.length > 0).length,
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_mro" 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_mro — C3/MRO class hierarchy resolution"
```

---

## Task 6: grasp_communities — Leiden Community Detection

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
Applies Louvain/Leiden-inspired greedy modularity optimization to the file connection graph to detect cohesive communities (bounded contexts / microservice candidates). Returns communities with their files, modularity score, and merge suggestions for communities below the minimum size.

- [ ] **Step 1: Write the failing smoke test**

```typescript
test('grasp_communities — Leiden community detection', async () => {
  const r = await ok('grasp_communities');
  expect(r).toHaveProperty('communities');
  expect(r).toHaveProperty('modularity_score');
  expect(Array.isArray((r as any).communities)).toBe(true);
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_communities" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

```typescript
// =====================================================================
// TOOL: grasp_communities
// =====================================================================
server.registerTool(
  'grasp_communities',
  {
    title: 'Leiden Community Detection',
    description: `Detect cohesive file communities (bounded contexts / microservice candidates) in the codebase using Louvain-style greedy modularity optimization.

Returns:
- communities: list of {id, label, files, internal_edges, external_edges, cohesion}
- modularity_score: Q ∈ [-0.5, 1.0] — higher is more modular
- merge_suggestions: small communities that likely belong together

Use this to identify microservice split points, bounded contexts, or team ownership boundaries.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from grasp_analyze'),
      min_community_size: z.number().int().min(1).default(2).describe('Minimum files per community before suggesting merge'),
      resolution: z.number().min(0.1).max(5.0).default(1.0).describe('Resolution parameter γ — higher values produce more, smaller communities'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ session_id, min_community_size, resolution }) => {
    const data = await getSession(session_id);
    if (!data) return { content: [{ type: 'text', text: `Session ${session_id} not found. Run grasp_analyze first.` }] };

    // Build weighted adjacency from connections (bidirectional for community detection)
    const nodes = new Set<string>();
    const edgeWeight = new Map<string, number>(); // "a|b" → weight
    let totalEdgeWeight = 0;

    for (const conn of data.connections) {
      nodes.add(conn.source);
      nodes.add(conn.target);
      if (conn.source === conn.target) continue;
      const key = [conn.source, conn.target].sort().join('|');
      edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + conn.count);
      totalEdgeWeight += conn.count;
    }

    const nodeList = [...nodes];
    if (nodeList.length === 0) {
      // Fallback: put all files in one community
      const allFiles = data.files.map(f => f.path);
      return { content: [{ type: 'text', text: JSON.stringify({
        communities: [{ id: 0, label: 'all', files: allFiles, internal_edges: 0, external_edges: 0, cohesion: 1 }],
        modularity_score: 0,
        merge_suggestions: [],
        total_communities: 1,
      }, null, 2) }] };
    }

    // Initialize: each node in its own community
    const community = new Map<string, number>();
    nodeList.forEach((n, i) => community.set(n, i));

    // Node degree (sum of edge weights)
    const degree = new Map<string, number>();
    for (const [key, w] of edgeWeight) {
      const [a, b] = key.split('|');
      degree.set(a, (degree.get(a) ?? 0) + w);
      degree.set(b, (degree.get(b) ?? 0) + w);
    }

    const m = totalEdgeWeight || 1;

    // Compute modularity gain of moving node n from community c_n to community c_target
    function modularityGain(node: string, targetCommunity: number): number {
      const k_n = degree.get(node) ?? 0;
      let k_in = 0; // edges from node to target community
      let sigma_tot = 0; // sum of degrees in target community
      for (const [other, c] of community) {
        if (other === node) continue;
        if (c === targetCommunity) {
          sigma_tot += degree.get(other) ?? 0;
          const key = [node, other].sort().join('|');
          k_in += edgeWeight.get(key) ?? 0;
        }
      }
      return (k_in / m) - resolution * (sigma_tot * k_n) / (2 * m * m);
    }

    // Louvain phase 1: greedy local optimization
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 20) {
      improved = false;
      iterations++;
      for (const node of nodeList) {
        const currentCommunity = community.get(node)!;
        // Find neighbor communities
        const neighborComms = new Set<number>();
        for (const [key] of edgeWeight) {
          const [a, b] = key.split('|');
          if (a === node) neighborComms.add(community.get(b)!);
          if (b === node) neighborComms.add(community.get(a)!);
        }
        neighborComms.delete(currentCommunity);

        let bestGain = 0;
        let bestComm = currentCommunity;

        // Gain of leaving current community
        const leaveGain = -modularityGain(node, currentCommunity);

        for (const nc of neighborComms) {
          const gain = leaveGain + modularityGain(node, nc);
          if (gain > bestGain) { bestGain = gain; bestComm = nc; }
        }

        if (bestComm !== currentCommunity) {
          community.set(node, bestComm);
          improved = true;
        }
      }
    }

    // Re-index communities 0..N
    const oldToNew = new Map<number, number>();
    let nextId = 0;
    for (const c of community.values()) {
      if (!oldToNew.has(c)) oldToNew.set(c, nextId++);
    }
    for (const [n, c] of community) community.set(n, oldToNew.get(c)!);

    // Build community output
    const commFiles = new Map<number, string[]>();
    for (const [node, c] of community) {
      if (!commFiles.has(c)) commFiles.set(c, []);
      commFiles.get(c)!.push(node);
    }

    // Count internal and external edges per community
    interface Community {
      id: number;
      label: string;
      files: string[];
      internal_edges: number;
      external_edges: number;
      cohesion: number;
    }
    const communities: Community[] = [];
    for (const [id, files] of commFiles) {
      const fileSet = new Set(files);
      let internal = 0, external = 0;
      for (const [key, w] of edgeWeight) {
        const [a, b] = key.split('|');
        const aIn = fileSet.has(a), bIn = fileSet.has(b);
        if (aIn && bIn) internal += w;
        else if (aIn || bIn) external += w;
      }
      const cohesion = internal + external > 0 ? internal / (internal + external) : 1;
      // Label from common path prefix
      const dirs = [...new Set(files.map(f => f.split('/').slice(0, -1).join('/') || '.'))];
      const label = dirs.length === 1 ? dirs[0] : `community_${id}`;
      communities.push({ id, label, files: files.sort(), internal_edges: internal, external_edges: external, cohesion: Math.round(cohesion * 100) / 100 });
    }
    communities.sort((a, b) => b.files.length - a.files.length);

    // Compute modularity Q
    let Q = 0;
    for (const [key, w] of edgeWeight) {
      const [a, b] = key.split('|');
      if (community.get(a) === community.get(b)) {
        const ka = degree.get(a) ?? 0, kb = degree.get(b) ?? 0;
        Q += (w / m) - resolution * (ka * kb) / (2 * m * m);
      }
    }
    Q = Math.round(Q * 1000) / 1000;

    // Merge suggestions for small communities
    const small = communities.filter(c => c.files.length < min_community_size);
    const mergeSuggestions = small.map(c => ({
      community_id: c.id,
      files: c.files,
      reason: `Only ${c.files.length} file(s) — consider merging into a larger community`,
    }));

    const result = {
      communities,
      total_communities: communities.length,
      modularity_score: Q,
      iterations_run: iterations,
      merge_suggestions: mergeSuggestions,
      summary: `${communities.length} communities detected (Q=${Q}). ${mergeSuggestions.length} below min size ${min_community_size}.`,
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_communities" 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_communities — Leiden/Louvain community detection"
```

---

## Task 7: grasp_contracts — Multi-Repo Contract Analysis

**Files:**
- Modify: `mcp/src/index.ts`
- Modify: `mcp/tests/smoke-new-tools.test.ts`

### What it does
Finds shared interfaces/contracts across multiple analysis sessions (e.g. a service and its consumer). Compares exported function sets, detects missing implementations, and flags signature mismatches by name.

- [ ] **Step 1: Write the failing smoke test**

```typescript
test('grasp_contracts — multi-repo contract analysis', async () => {
  // Pass same session ID twice to simulate provider+consumer
  const resp = await callTool(proc, lines, 'grasp_contracts', {
    provider_session_id: sessionId,
    consumer_session_ids: [sessionId],
  });
  if (resp.error) throw new Error(`grasp_contracts error: ${JSON.stringify(resp.error)}`);
  const text = resp.result?.content?.[0]?.text ?? '';
  if (text.startsWith('MCP error')) throw new Error(`grasp_contracts error: ${text.slice(0, 300)}`);
  const r = JSON.parse(text);
  expect(r).toHaveProperty('contracts');
  expect(r).toHaveProperty('violations');
  expect(r).toHaveProperty('coverage_pct');
}, TIMEOUT);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test -- --testNamePattern="grasp_contracts" 2>&1 | tail -20
```
Expected: FAIL.

- [ ] **Step 3: Implement the tool**

```typescript
// =====================================================================
// TOOL: grasp_contracts
// =====================================================================
server.registerTool(
  'grasp_contracts',
  {
    title: 'Multi-Repo Contract Analysis',
    description: `Analyse contracts between a provider repo and one or more consumer repos.

The provider's exported functions define the contract. Each consumer session is checked to verify it only calls functions that exist in the provider's exports.

Returns:
- contracts: list of exported functions in the provider with usage counts across consumers
- violations: consumer calls to functions NOT in the provider's exports (broken contracts)
- coverage_pct: % of provider contract used by consumers
- orphaned: exported provider functions used by nobody

Requires two or more grasp_analyze sessions — one for the provider, one or more for consumers.`,
    inputSchema: z.object({
      provider_session_id: z.string().describe('Session ID of the provider/library repo'),
      consumer_session_ids: z.array(z.string()).min(1).describe('Session IDs of consumer repos'),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ provider_session_id, consumer_session_ids }) => {
    const provider = await getSession(provider_session_id);
    if (!provider) return { content: [{ type: 'text', text: `Provider session ${provider_session_id} not found.` }] };

    // Build provider contract: set of exported function names
    const providerExports = new Map<string, { file: string; callers: number }>();
    for (const file of provider.files) {
      for (const fn of file.functions) {
        if (fn.isExported) {
          providerExports.set(fn.name, { file: file.path, callers: 0 });
        }
      }
    }
    // Also add functions with high fan-in even if not flagged exported
    const fanIn = new Map<string, number>();
    for (const conn of provider.connections) {
      fanIn.set(conn.fn, (fanIn.get(conn.fn) ?? 0) + conn.count);
    }
    for (const [fn, count] of fanIn) {
      if (count >= 3 && !providerExports.has(fn)) {
        // Find its file
        const file = provider.files.find(f => f.functions.some(fdef => fdef.name === fn));
        if (file) providerExports.set(fn, { file: file.path, callers: 0 });
      }
    }

    // Load consumer sessions
    const consumers: Array<{ sessionId: string; source: string; data: AnalysisResult }> = [];
    for (const cid of consumer_session_ids) {
      const d = await getSession(cid);
      if (d) consumers.push({ sessionId: cid, source: d.source, data: d });
    }

    if (consumers.length === 0) {
      return { content: [{ type: 'text', text: 'No valid consumer sessions found.' }] };
    }

    // For each consumer, collect all function names it calls
    interface Violation {
      consumer_source: string;
      function: string;
      call_count: number;
      reason: string;
    }
    const violations: Violation[] = [];
    const contractUsage = new Map<string, number>(); // provider fn → total consumer calls

    for (const consumer of consumers) {
      // Consumer calls = all fn names in consumer.connections (the .fn field)
      const consumerCalls = new Map<string, number>();
      for (const conn of consumer.data.connections) {
        consumerCalls.set(conn.fn, (consumerCalls.get(conn.fn) ?? 0) + conn.count);
      }
      // Also collect function names defined in consumer
      const consumerFns = new Set<string>();
      for (const file of consumer.data.files) {
        for (const fn of file.functions) consumerFns.add(fn.name);
      }

      // Check what consumer calls that overlaps with provider contract
      for (const [fn, count] of consumerCalls) {
        if (providerExports.has(fn)) {
          contractUsage.set(fn, (contractUsage.get(fn) ?? 0) + count);
        }
        // Violation: consumer calls a function that looks like it should be from provider
        // (matches naming patterns) but isn't exported
        if (!providerExports.has(fn) && !consumerFns.has(fn)) {
          // Only flag if the fn name appears in provider files (defined but not exported)
          const inProvider = provider.files.some(f => f.functions.some(fdef => fdef.name === fn));
          if (inProvider) {
            violations.push({
              consumer_source: consumer.source,
              function: fn,
              call_count: count,
              reason: `"${fn}" is defined in provider but not exported — consumer may be calling an internal API`,
            });
          }
        }
      }
    }

    // Build contract list
    interface Contract {
      function: string;
      provider_file: string;
      consumer_usage_count: number;
      used_by_consumers: number;
    }
    const contracts: Contract[] = [];
    for (const [fn, info] of providerExports) {
      const usage = contractUsage.get(fn) ?? 0;
      const usedByCount = consumers.filter(c =>
        c.data.connections.some(conn => conn.fn === fn)
      ).length;
      contracts.push({ function: fn, provider_file: info.file, consumer_usage_count: usage, used_by_consumers: usedByCount });
    }
    contracts.sort((a, b) => b.consumer_usage_count - a.consumer_usage_count);

    const usedCount = contracts.filter(c => c.consumer_usage_count > 0).length;
    const orphaned = contracts.filter(c => c.consumer_usage_count === 0).map(c => c.function);
    const coveragePct = contracts.length > 0 ? Math.round((usedCount / contracts.length) * 100) : 100;

    const result = {
      provider_source: provider.source,
      consumer_sources: consumers.map(c => c.source),
      contracts,
      violations,
      orphaned,
      coverage_pct: coveragePct,
      contract_size: contracts.length,
      violations_count: violations.length,
      orphaned_count: orphaned.length,
      summary: `${contracts.length} contract functions, ${coveragePct}% used by consumers, ${violations.length} violations, ${orphaned.length} orphaned exports`,
    };

    return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);
```

- [ ] **Step 4: Build and run test**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -5
npm test -- --testNamePattern="grasp_contracts" 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "feat: add grasp_contracts — multi-repo contract analysis"
```

---

## Task 8: Full Smoke Test Run

Run the complete smoke test suite to verify all 7 new tools pass alongside existing tools.

- [ ] **Step 1: Build**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
node build.mjs 2>&1 | tail -10
```
Expected: `Build complete: dist/index.js + dist/cli.js + dist/analyzer.js + dist/parser.js + dist/tree-sitter/bundle.js`

- [ ] **Step 2: Run all smoke tests**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/mcp
npm test 2>&1 | tail -40
```
Expected: All tests pass, no failures.

- [ ] **Step 3: Commit if any adjustments were needed**

Only commit if test fixes were required:
```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add mcp/src/index.ts mcp/tests/smoke-new-tools.test.ts
git commit -m "fix: smoke test adjustments for v3.12.0 tools"
```

---

## Task 9: Version Bump to 3.12.0

Bump every file in the CLAUDE.md checklist from `3.11.0` to `3.12.0`.

- [ ] **Step 1: Bump browser-extension manifests and package files**

Files to update (change `"version": "3.11.0"` → `"3.12.0"` or equivalent):
- `browser-extension/package.json` — `"version"`
- `browser-extension/manifest.json` — `"version"`
- `browser-extension/manifest.firefox.json` — `"version"`
- `browser-extension/manifest.safari.json` — `"version"`
- `browser-extension/package-lock.json` — `"version"` for the root package (NOT dep versions)

- [ ] **Step 2: Bump MCP package files**

- `mcp/package.json` — `"version"`
- `mcp/package-lock.json` — root `"version"` only
- `mcp/server.json` — `"version"` appears **twice** (check both)
- `mcp/README.md` — `**Current version: 3.11.0**` → `3.12.0`

- [ ] **Step 3: Bump VS Code extension**

- `vscode-extension/package.json` — `"version"` only — **DO NOT touch** `"grasp-mcp-server": "^3.3.3"` dep pin
- `vscode-extension/package-lock.json` — root `"version"` only

- [ ] **Step 4: Bump JetBrains plugin**

In `jetbrains-plugin/build.gradle.kts`:
- `version =` appears **twice** — update both
- Add entry to `changeNotes`:
  ```
  <li>v3.12.0: grasp_diff_symbols, grasp_exec_flow, grasp_skillmd, grasp_hooks, grasp_mro, grasp_communities, grasp_contracts</li>
  ```

- [ ] **Step 5: Bump Eclipse and Jenkins plugins**

- `eclipse-plugin/pom.xml` — `<version>3.11.0</version>` → `3.12.0`
- `jenkins-plugin/pom.xml` — same

- [ ] **Step 6: Bump all integration packages**

Each file: change `"version": "3.11.0"` → `"3.12.0"`:
- `amazon-q-plugin/package.json`
- `copilot-extension/package.json`
- `continue-provider/package.json`
- `discord-bot/package.json`
- `github-action/package.json`
- `gitlab-app/package.json`
- `gitlab-ci-component/package.json`
- `gpt-actions/package.json`
- `jira-integration/package.json`
- `linear-integration/package.json`
- `raycast-grasp/package.json`
- `teams-bot/package.json`
- `slack-bot/package.json`

Also: `gpt-actions/src/server.ts` — hardcoded version string in `/health` endpoint.

- [ ] **Step 7: Bump HTML files**

`index.html` — `window.GRASP_VERSION = '3.11.0'` — **two occurrences**  
`team-dashboard.html` — `GRASP_VERSION = '3.11.0'`  
`docs/index.html` — `v3.11.0` — two occurrences

- [ ] **Step 8: Bump Docker**

`docker/Dockerfile` — `grasp-mcp-server@3.11.0` in the `RUN npm install -g` line  
`docker/README.md` — version in the table

- [ ] **Step 9: Bump README and CHANGELOG**

`README.md` — all version references  
`CHANGELOG.md` — add new entry at top:

```markdown
## [3.12.0] — 2026-04-25

### Added
- `grasp_diff_symbols` — map git diff hunks to functions, compute blast radius
- `grasp_exec_flow` — trace execution flow from entry point with STEP_IN_PROCESS edges + Mermaid flowchart
- `grasp_skillmd` — auto-generate SKILL.md / CLAUDE.md snippet from analysis
- `grasp_hooks` — generate Claude Code `.claude/settings.json` + Cursor `.cursor/rules/grasp.mdc` hooks
- `grasp_mro` — C3 linearization (Python) and MRO for Ruby/Java class hierarchies
- `grasp_communities` — Leiden/Louvain community detection on file connection graph
- `grasp_contracts` — multi-repo contract analysis: provider exports vs consumer usage
```

- [ ] **Step 10: Commit version bump**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git add -A
git commit -m "chore: bump version to 3.12.0"
```

- [ ] **Step 11: Build browser extension**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp/browser-extension
npm run build && npm test
```
Expected: build succeeds, tests pass.

- [ ] **Step 12: Tag and push**

```bash
cd /Users/chak/Documents/Code/Claudecode/grasp
git push
git tag v3.12.0 && git push origin v3.12.0
```

---

## Self-Review

**Spec coverage:**
- ✅ grasp_diff_symbols — Task 1
- ✅ grasp_exec_flow — Task 2
- ✅ grasp_skillmd — Task 3
- ✅ grasp_hooks — Task 4
- ✅ grasp_mro — Task 5
- ✅ grasp_communities — Task 6
- ✅ grasp_contracts — Task 7
- ✅ Full smoke test — Task 8
- ✅ Version bump to 3.12.0 — Task 9

**Placeholder scan:** None. All code blocks are complete and runnable.

**Type consistency:**
- All tools use `AnalysisResult`, `AnalyzedFile`, `FunctionDef`, `Connection` from `mcp/src/types.ts`
- `getSession()` returns `AnalysisResult | null` — checked before use in every handler
- `truncate()` wraps every JSON.stringify return
- Smoke tests use `ok()` helper for single-session tools; `grasp_contracts` uses raw `callTool()` for multi-session

**Potential edge cases handled:**
- `grasp_communities`: falls back gracefully when no connections exist
- `grasp_exec_flow`: returns empty steps with message if entry_point not found
- `grasp_mro`: cycle guard in C3 linearization
- `grasp_contracts`: handles case where no consumer sessions are valid
