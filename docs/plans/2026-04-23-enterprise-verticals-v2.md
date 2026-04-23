# Plan: Enterprise Verticals v2
Date: 2026-04-23
Goal: Ship 29 features across 6 verticals (Elastic, Finance, OS/Kernel, Open Source, ESA Part 2, Grasp Cloud) from v3.3.20 to v3.9.3
Architecture: Single-file React SPA (index.html) + MCP server (mcp/src/index.ts) + parser (mcp/src/parser.js). New tools follow existing server.registerTool() pattern. New UI follows existing tab/modal/color-mode patterns.
Tech stack: Vanilla React (no build), TypeScript MCP, Zod schemas, D3 graph, localStorage persistence

---

## Cross-cutting conventions (read before any task)

- **MCP tool pattern**: `server.registerTool('grasp_X', { title, description, inputSchema: { session_id: z.string(), ...fields }, annotations: { readOnlyHint: true } }, async (args) => { const data = await getSession(args.session_id); if (!data) return { content:[{type:'text',text:'Session not found'}] }; ... return { content:[{type:'text',text:truncate(JSON.stringify(result,null,2))}] }; })`
- **Version bump**: After each version's tasks are done, bump all 34 files per CLAUDE.md checklist, update CHANGELOG, commit, push, tag `vX.Y.Z`, push tag
- **No Co-Authored-By lines** in any commit
- **Content availability**: analysis functions needing file content run before `data.files.forEach(f => f.content = null)` (index.html ~line 5192)
- **New right-panel tab**: add tab button block + content block following existing tab pattern
- **New color mode**: add to `colorMode` state options + color mapping switch + legend entry
- **Help modal**: every new feature gets a help entry before the task is marked done

---

# PHASE 1 — Elastic / Platform Vertical (v3.4.0–v3.4.2)

---

## Task 1: grasp_org_graph — Multi-repo graph MCP tool (v3.4.0)

**Files:** `mcp/src/index.ts` (add tool before `// Start server` block)

**Steps:**
1. Add `grasp_org_graph` tool to `mcp/src/index.ts`:

```typescript
server.registerTool('grasp_org_graph', {
  title: 'Org-Level Multi-Repo Dependency Graph',
  description: `Merge multiple analysis sessions into a single org-level graph. One node per repo, edges = inter-repo package dependencies and shared infrastructure. Use after running grasp_analyze on 2+ repos.

Args:
  - session_ids: array of session IDs to merge
  - include_shared_libs: include shared library nodes (default true)`,
  inputSchema: {
    session_ids: z.array(z.string()).min(2).describe('Array of session IDs to merge into org graph'),
    include_shared_libs: z.boolean().optional().describe('Show shared lib nodes (default true)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const sessions: Array<{ id: string; data: AnalysisResult }> = [];
  for (const id of args.session_ids) {
    const d = await getSession(id);
    if (!d) return { content: [{ type: 'text', text: `Session not found: ${id}` }] };
    sessions.push({ id, data: d });
  }

  // Build repo nodes
  const repos = sessions.map(({ id, data }) => ({
    session_id: id,
    name: data.repo || id,
    health: data.health ?? 0,
    grade: data.grade ?? 'C',
    file_count: data.files?.length ?? 0,
    issue_count: (data.issues?.length ?? 0),
    top_issues: (data.issues ?? []).slice(0, 3).map((i: any) => i.title ?? i.message ?? ''),
  }));

  // Detect inter-repo edges via package name matching
  const edges: Array<{ from: string; to: string; type: string; weight: number }> = [];
  const pkgNames = new Map<string, string>(); // package name → session_id
  for (const { id, data } of sessions) {
    const pkg = (data as any).packageJson;
    if (pkg?.name) pkgNames.set(pkg.name, id);
  }
  for (const { id, data } of sessions) {
    const deps = Object.keys((data as any).packageJson?.dependencies ?? {})
      .concat(Object.keys((data as any).packageJson?.devDependencies ?? {}));
    for (const dep of deps) {
      const targetId = pkgNames.get(dep);
      if (targetId && targetId !== id) {
        const existing = edges.find(e => e.from === id && e.to === targetId);
        if (existing) existing.weight++;
        else edges.push({ from: id, to: targetId, type: 'package', weight: 1 });
      }
    }
  }

  // Shared libs: packages imported by 3+ repos
  const sharedLibs: Array<{ name: string; used_by: string[] }> = [];
  if (args.include_shared_libs !== false) {
    const libUsage = new Map<string, string[]>();
    for (const { id, data } of sessions) {
      const deps = Object.keys((data as any).packageJson?.dependencies ?? {});
      for (const dep of deps) {
        if (!libUsage.has(dep)) libUsage.set(dep, []);
        libUsage.get(dep)!.push(id);
      }
    }
    for (const [name, usedBy] of libUsage) {
      if (usedBy.length >= 3) sharedLibs.push({ name, used_by: usedBy });
    }
  }

  const result = {
    repos,
    edges,
    shared_libs: sharedLibs,
    health_summary: {
      avg_health: Math.round(repos.reduce((s, r) => s + r.health, 0) / repos.length),
      highest: repos.reduce((a, b) => a.health > b.health ? a : b).name,
      lowest: repos.reduce((a, b) => a.health < b.health ? a : b).name,
      total_issues: repos.reduce((s, r) => s + r.issue_count, 0),
    },
  };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});
```

2. Build: `cd mcp && npm run build` → expect no errors
3. Commit: `git commit -m "feat: grasp_org_graph MCP tool — merge N sessions into org-level dependency graph"`

---

## Task 2: Org View UI — OrgGraphView component and toggle (v3.4.0)

**Files:** `index.html` (add component + toggle button in Sessions panel)

**Steps:**
1. Add `OrgGraphView` React component after the existing `SessionsPanel` component. It takes `sessions` (array of loaded session objects with `id`, `data`) and renders:
   - A summary table: repo name | health grade | file count | issue count | top 3 issues
   - Inter-repo edges list: "repo-a → repo-b (package dep)"
   - Shared libs list: "lodash — used by 4 repos"
   - An "Export Org Report (JSON)" button that downloads `{repos, edges, shared_libs, health_summary}`

2. In the Sessions panel, add a "🏢 Org View" button that appears when 2+ sessions are loaded. Clicking it opens a modal wrapping `OrgGraphView`.

3. State: `var [showOrgView, setShowOrgView] = useState(false)` near other modal state declarations.

4. Add help entry: In the help modal, add a card for "Org-Level Graph" under the Multi-Repo section.

5. Build/verify: Open app locally, load 2 sessions (analyze two GitHub repos), click Sessions → confirm "🏢 Org View" button appears and table renders correctly.

6. Commit: `git commit -m "feat: Org View UI — multi-repo summary table and shared-lib detection"`

---

## Task 3: Breaking API Change Detector — grasp_api_diff MCP tool (v3.4.1)

**Files:** `mcp/src/index.ts`

**Steps:**
1. Add `grasp_api_diff` tool:

```typescript
server.registerTool('grasp_api_diff', {
  title: 'Breaking API Change Detector',
  description: `Compare two sessions of the same repo and detect breaking API changes — removed exports, signature changes, parameter count changes. Returns severity-ranked list of breaking changes with affected caller counts.

Args:
  - session_id_old: baseline session
  - session_id_new: new session to compare against baseline`,
  inputSchema: {
    session_id_old: z.string(),
    session_id_new: z.string(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_) return { content: [{ type: 'text', text: 'Old session not found' }] };
  if (!new_) return { content: [{ type: 'text', text: 'New session not found' }] };

  // Build exported function maps: Map<file:fn, {params, file}>
  function buildExports(data: AnalysisResult) {
    const map = new Map<string, { params: number; file: string }>();
    for (const file of data.files ?? []) {
      for (const fn of file.functions ?? []) {
        if (fn.exported || fn.name?.startsWith('export')) {
          map.set(`${file.path}::${fn.name}`, { params: fn.params ?? 0, file: file.path });
        }
      }
    }
    return map;
  }

  const oldExports = buildExports(old_);
  const newExports = buildExports(new_);

  const breaking: Array<{ severity: string; type: string; fn: string; file: string; detail: string; callers: number }> = [];

  // Removed exports
  for (const [key, val] of oldExports) {
    if (!newExports.has(key)) {
      const callers = (old_.connections ?? []).filter((c: Connection) => c.to === val.file).length;
      breaking.push({ severity: 'critical', type: 'removed', fn: key.split('::')[1], file: val.file, detail: 'Export removed', callers });
    }
  }

  // Signature changes (param count)
  for (const [key, oldVal] of oldExports) {
    const newVal = newExports.get(key);
    if (newVal && newVal.params !== oldVal.params) {
      const callers = (old_.connections ?? []).filter((c: Connection) => c.to === oldVal.file).length;
      breaking.push({ severity: 'high', type: 'signature', fn: key.split('::')[1], file: oldVal.file, detail: `Params: ${oldVal.params} → ${newVal.params}`, callers });
    }
  }

  // New exports (non-breaking but noted)
  const added: string[] = [];
  for (const [key] of newExports) {
    if (!oldExports.has(key)) added.push(key.split('::')[1]);
  }

  breaking.sort((a, b) => b.callers - a.callers);
  const result = { breaking_changes: breaking, added_exports: added, summary: `${breaking.length} breaking changes, ${added.length} new exports` };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});
```

2. Build: `cd mcp && npm run build` → no errors
3. Commit: `git commit -m "feat: grasp_api_diff — breaking API change detector between two sessions"`

---

## Task 4: Breaking Changes UI section + Plugin Extension-Point Map (v3.4.1)

**Files:** `index.html`, `mcp/src/index.ts`

**Steps:**

**Breaking changes in Issues tab:**
1. In `sendChatMessage` / analysis result processing, if `data.apiBreaking` exists (populated in future), show a "⚠️ Breaking API Changes" section in Issues tab listing each breaking change with severity badge and caller count.
2. More practically: add a "🔍 Compare APIs" button in the Sessions panel (alongside existing Compare button) that calls `grasp_api_diff` and shows a modal with the breaking changes table.

**Plugin extension-point map MCP tool:**
```typescript
server.registerTool('grasp_plugins', {
  title: 'Plugin Extension-Point Map',
  description: `Detect plugin extension points (registerPlugin, use(), extend(), addHook() patterns) and map which files are core extension points vs plugin implementations. Flags tightly-coupled extension points.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const PLUGIN_PATTERNS = /\b(registerPlugin|addPlugin|use\(|extend\(|addHook|on\(|emit\(|plugin\.register|pluginManager)/;
  const extensionPoints: Array<{ file: string; pattern: string; fan_in: number; coupled: boolean }> = [];
  const pluginFiles: Array<{ file: string; implements: string }> = [];

  for (const file of data.files ?? []) {
    const content = (file as any).rawContent ?? '';
    if (PLUGIN_PATTERNS.test(content)) {
      const fanIn = (data.connections ?? []).filter((c: Connection) => c.to === file.path).length;
      extensionPoints.push({ file: file.path, pattern: (content.match(PLUGIN_PATTERNS) ?? [''])[0], fan_in: fanIn, coupled: fanIn > 10 });
    }
    if (/\b(implements.*Plugin|extends.*Plugin|Plugin\s*{)/i.test(content)) {
      pluginFiles.push({ file: file.path, implements: 'Plugin interface' });
    }
  }

  const result = { extension_points: extensionPoints, plugin_implementations: pluginFiles, tightly_coupled: extensionPoints.filter(e => e.coupled), summary: `${extensionPoints.length} extension points, ${pluginFiles.length} plugin implementations, ${extensionPoints.filter(e => e.coupled).length} tightly coupled` };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});
```

3. Add "🔌 Plugins" section in Architecture tab (rendered when `data.plugins` populated — call after analyze).
4. Build, verify, commit: `git commit -m "feat: grasp_plugins extension-point map + API diff UI in Sessions panel"`

---

## Task 5: Semantic Versioning Enforcer (v3.4.2)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**
1. Add `grasp_semver` tool:

```typescript
server.registerTool('grasp_semver', {
  title: 'Semantic Versioning Enforcer',
  description: `Compare two sessions and determine if the version bump in package.json is semantically correct. Breaking changes require minor/major; new exports require minor; fixes only = patch is correct.`,
  inputSchema: { session_id_old: z.string(), session_id_new: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_ || !new_) return { content: [{ type: 'text', text: 'Session(s) not found' }] };

  const oldVer: string = (old_ as any).packageJson?.version ?? '0.0.0';
  const newVer: string = (new_ as any).packageJson?.version ?? '0.0.0';

  function parseSemver(v: string) {
    const [major, minor, patch] = v.split('.').map(Number);
    return { major, minor, patch };
  }
  const ov = parseSemver(oldVer), nv = parseSemver(newVer);
  const actualBump = nv.major > ov.major ? 'major' : nv.minor > ov.minor ? 'minor' : nv.patch > ov.patch ? 'patch' : 'none';

  // Use grasp_api_diff logic inline to detect breaking changes
  function buildExportSet(data: AnalysisResult) {
    const s = new Set<string>();
    for (const file of data.files ?? []) for (const fn of (file as any).functions ?? []) if (fn.exported) s.add(`${file.path}::${fn.name}`);
    return s;
  }
  const oldExp = buildExportSet(old_), newExp = buildExportSet(new_);
  const removed = [...oldExp].filter(k => !newExp.has(k));
  const added = [...newExp].filter(k => !oldExp.has(k));
  const hasBreaking = removed.length > 0;
  const hasAdditions = added.length > 0;

  const required = hasBreaking ? 'minor-or-major' : hasAdditions ? 'minor-or-higher' : 'patch';
  let verdict: 'ok' | 'underbump' | 'breach';
  if (hasBreaking && actualBump === 'patch') verdict = 'breach';
  else if (hasAdditions && actualBump === 'patch') verdict = 'underbump';
  else verdict = 'ok';

  const result = { old_version: oldVer, new_version: newVer, actual_bump: actualBump, required_bump: required, verdict, breaking_removed: removed, new_exports: added, recommendation: verdict === 'breach' ? `Bump to minor or major — ${removed.length} exports removed` : verdict === 'underbump' ? `Consider bumping to minor — ${added.length} new exports added` : 'Version bump is semantically correct' };
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```

2. In `index.html`, add a semver verdict card to the `grasp_diff` / session compare output. When two sessions are selected and compared, show a "SemVer Check" badge: green OK / amber underbump / red breach.
3. Build, bump all files to `v3.4.2`, update CHANGELOG, commit, push, tag `v3.4.2`.
4. Commit: `git commit -m "feat: grasp_semver — semantic versioning enforcer with breach/underbump detection (v3.4.2)"`

---

# PHASE 2 — Finance Vertical (v3.5.0–v3.5.2)

---

## Task 6: PII Data Flow Tracer — marking + grasp_pii_trace tool (v3.5.0)

**Files:** `index.html` (Details panel), `mcp/src/index.ts`

**Steps:**

**localStorage key:** `grasp_pii_sources` — array of `{file, fn?}` objects

**Details panel addition:**
1. Below the existing "Mark as Safety Gate" button pattern, add "🔒 Mark as PII Source" button in the Details panel when a file is selected.
2. Clicking stores the file to `grasp_pii_sources`. Files marked as PII sources get a 🔒 badge overlay in the graph.
3. A "Clear PII Sources" option in the ⋯ menu.

**MCP tool:**
```typescript
server.registerTool('grasp_pii_trace', {
  title: 'PII / Sensitive Data Flow Tracer',
  description: `Trace all code paths that touch user-marked PII entry points (personally identifiable information, financial data). Flags: PII reaching logging, unencrypted storage writes, URL parameters, or external API calls.`,
  inputSchema: {
    session_id: z.string(),
    pii_sources: z.array(z.string()).describe('File paths marked as PII entry points'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const RISKY_PATTERNS = /console\.(log|warn|error)|logger\.|winston\.|pino\.|localStorage\.|sessionStorage\.|writeFile|fs\.write|\.query\(|url\?|URLSearchParams|fetch\(|axios\.|http\.request/;

  const piiFiles = new Set(args.pii_sources);
  // BFS from PII sources through dependents
  const visited = new Set<string>();
  const queue = [...piiFiles];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const dependents = (data.connections ?? []).filter((c: Connection) => c.to === cur).map((c: Connection) => c.from);
    for (const dep of dependents) if (!visited.has(dep)) queue.push(dep);
  }

  const violations: Array<{ file: string; pattern: string; severity: string; line?: number }> = [];
  for (const filePath of visited) {
    const file = (data.files ?? []).find((f: any) => f.path === filePath);
    if (!file) continue;
    const content: string = (file as any).rawContent ?? '';
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const match = line.match(RISKY_PATTERNS);
      if (match) violations.push({ file: filePath, pattern: match[0], severity: line.includes('url') || line.includes('URLSearchParams') ? 'critical' : 'high', line: i + 1 });
    });
  }

  violations.sort((a, b) => (a.severity === 'critical' ? -1 : 1));
  const result = { pii_sources: args.pii_sources, files_in_flow: [...visited], violations, summary: `${visited.size} files touch PII data. ${violations.length} risky patterns found.` };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});
```

**Data Flow color mode:**
Add "Data Flow" to the color mode picker. Files in PII flow = red, PII sources = dark red, clean files = green.

4. Build, verify: mark a source file, run PII trace, confirm violations surface.
5. Commit: `git commit -m "feat: PII data flow tracer — marking, BFS tracing, risky pattern detection (v3.5.0)"`

---

## Task 7: Separation of Duties Validator (v3.5.0)

**Files:** `index.html` (Rules tab), `mcp/src/index.ts`

**Steps:**

**localStorage key:** `grasp_duty_boundaries` — array of `{name, paths:[]}` objects

1. In Rules tab, add a new rule type "Duty Boundary" with form fields: Boundary Name (text) + Paths list (one per line). "Add Duty Boundary" button saves to `grasp_duty_boundaries`.

2. Add `grasp_duties` tool:

```typescript
server.registerTool('grasp_duties', {
  title: 'Separation of Duties Validator',
  description: `Validate that no contributor has dominant ownership of both sides of a duty boundary (e.g. order-entry and settlement). Flags contributors who appear in top-3 ownership for both sides — a SOX compliance concern.`,
  inputSchema: {
    session_id: z.string(),
    boundaries: z.array(z.object({ name: z.string(), paths: z.array(z.string()) })).describe('Pairs of duty boundaries to check'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const contributors: any[] = (data as any).contributors ?? [];
  const violations: Array<{ contributor: string; boundary_a: string; boundary_b: string; detail: string }> = [];

  for (let i = 0; i < args.boundaries.length; i++) {
    for (let j = i + 1; j < args.boundaries.length; j++) {
      const a = args.boundaries[i], b = args.boundaries[j];
      const topA = contributors.filter(c => a.paths.some((p: string) => c.topFiles?.some((f: string) => f.startsWith(p)))).map(c => c.name);
      const topB = contributors.filter(c => b.paths.some((p: string) => c.topFiles?.some((f: string) => f.startsWith(p)))).map(c => c.name);
      const overlap = topA.filter(n => topB.includes(n));
      for (const name of overlap) violations.push({ contributor: name, boundary_a: a.name, boundary_b: b.name, detail: `${name} owns files in both "${a.name}" and "${b.name}"` });
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify({ violations, boundaries_checked: args.boundaries.length, summary: violations.length === 0 ? 'No duty violations found' : `${violations.length} duty violations detected` }, null, 2) }] };
});
```

3. Show violations as a "⚖️ Duty Violations" section in Issues tab.
4. Build, commit: `git commit -m "feat: separation of duties validator — boundary config and SOX contributor check (v3.5.0)"`

---

## Task 8: Regulatory Change Impact Mapper (v3.5.1)

**Files:** `index.html` (⋯ menu + modal), `mcp/src/index.ts`

**Steps:**

1. Add `grasp_reg_impact` tool:

```typescript
server.registerTool('grasp_reg_impact', {
  title: 'Regulatory Change Impact Mapper',
  description: `Given a regulation change description (free text), scan the codebase for files likely affected using keyword + function name matching. Returns files ranked by match confidence.`,
  inputSchema: {
    session_id: z.string(),
    description: z.string().describe('Regulation change description or diff text'),
    top_n: z.number().optional().describe('Max files to return (default 20)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  // Extract meaningful terms (>4 chars, not stop words)
  const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'must', 'shall', 'should', 'which', 'where', 'their', 'there', 'been', 'also']);
  const terms = args.description.toLowerCase().match(/\b[a-z]{4,}\b/g)?.filter(t => !STOP.has(t)) ?? [];
  const uniqueTerms = [...new Set(terms)];

  const scored: Array<{ file: string; score: number; matched_terms: string[] }> = [];
  for (const file of data.files ?? []) {
    const haystack = [file.path, ...(file.functions ?? []).map((f: any) => f.name ?? '')].join(' ').toLowerCase();
    const matched = uniqueTerms.filter(t => haystack.includes(t));
    if (matched.length > 0) scored.push({ file: file.path, score: matched.length, matched_terms: matched });
  }
  scored.sort((a, b) => b.score - a.score);
  const topN = args.top_n ?? 20;

  return { content: [{ type: 'text', text: JSON.stringify({ affected_files: scored.slice(0, topN), terms_extracted: uniqueTerms.length, summary: `${scored.length} files matched regulation keywords. Top ${Math.min(topN, scored.length)} shown.` }, null, 2) }] };
});
```

2. Add "📋 Reg Impact" item to ⋯ menu → opens `RegImpactModal`: textarea for regulation text + "Scan" button → renders table of matched files with confidence score.
3. Commit: `git commit -m "feat: grasp_reg_impact — regulatory change impact mapper (v3.5.1)"`

---

## Task 9: Latency Hotspot Detection (v3.5.1)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

1. Add `grasp_latency` tool (finance-specific extension of grasp_perf):

```typescript
server.registerTool('grasp_latency', {
  title: 'Latency Hotspot Detection (Trading / Finance)',
  description: `Detect latency anti-patterns in financial/trading code: synchronous I/O in hot paths, object allocation in loops, mutex/lock in hot-path functions, busy-wait patterns, DB calls without pooling. Severity-ranked.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const findings: Array<{ file: string; severity: string; pattern: string; line?: number; callers: number }> = [];
  const PATTERNS: Array<{ re: RegExp; severity: string; label: string }> = [
    { re: /readFileSync|execSync|spawnSync/, severity: 'critical', label: 'Synchronous I/O in potential hot path' },
    { re: /new\s+\w+\(.*\)\s*;.*\/\/.*loop|for\s*\(.*\)\s*\{[^}]*new\s+\w+/s, severity: 'high', label: 'Object allocation in loop' },
    { re: /\.lock\(\)|\.acquire\(\)|synchronized\s*\(|mutex\.lock/, severity: 'high', label: 'Mutex/lock in hot-path function' },
    { re: /setInterval\s*\([^,]+,\s*[01]\)/, severity: 'high', label: 'Busy-wait: interval < 2ms' },
    { re: /\.query\(|\.execute\(|\.findOne\(|\.findAll\(/, severity: 'medium', label: 'DB call — verify connection pooling' },
  ];

  for (const file of data.files ?? []) {
    const content: string = (file as any).rawContent ?? '';
    const fanIn = (data.connections ?? []).filter((c: Connection) => c.to === file.path).length;
    const callers = fanIn;
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      for (const { re, severity, label } of PATTERNS) {
        if (re.test(line)) findings.push({ file: file.path, severity, pattern: label, line: i + 1, callers });
      }
    });
  }

  findings.sort((a, b) => { const sev = { critical: 0, high: 1, medium: 2 }; return (sev[a.severity as keyof typeof sev] - sev[b.severity as keyof typeof sev]) || b.callers - a.callers; });
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ findings, summary: `${findings.length} latency risks: ${findings.filter(f=>f.severity==='critical').length} critical, ${findings.filter(f=>f.severity==='high').length} high` }, null, 2)) }] };
});
```

2. Add "⚡ Latency Hotspots" section in Issues tab (only shown when latency findings exist in session data).
3. Commit: `git commit -m "feat: grasp_latency — finance/trading latency hotspot detection (v3.5.1)"`

---

## Task 10: Model Risk Audit (v3.5.2)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

1. Add `grasp_model_risk` tool:

```typescript
server.registerTool('grasp_model_risk', {
  title: 'Financial Model Risk Audit',
  description: `Audit financial model code: detect hardcoded numeric constants (magic numbers), untested model entry points, undocumented parameters, and model functions that lack input validation. Returns structured Model Risk Report.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const MODEL_PATTERNS = /\b(price|rate|discount|risk|hedge|portfolio|valuation|pnl|var|sharpe|beta|alpha|model|calc|compute|estimate)\b/i;
  const MAGIC_NUM = /[^a-zA-Z0-9_](0\.\d{2,}|\d{2,}\.\d+|\d{4,})[^a-zA-Z0-9_]/;

  const modelFiles: Array<{ file: string; magic_numbers: number; has_tests: boolean; documented: boolean; entry_functions: string[] }> = [];
  const testFiles = new Set((data.files ?? []).filter((f: any) => /test|spec/.test(f.path)).map((f: any) => f.path));

  for (const file of data.files ?? []) {
    if (!MODEL_PATTERNS.test(file.path)) continue;
    const content: string = (file as any).rawContent ?? '';
    const magicCount = (content.match(new RegExp(MAGIC_NUM.source, 'g')) ?? []).length;
    const baseName = file.path.replace(/\.[^.]+$/, '').split('/').pop() ?? '';
    const hasTests = [...testFiles].some(t => t.includes(baseName));
    const documented = content.includes('/**') || content.includes('"""') || content.includes("'''");
    const entryFns = (file.functions ?? []).filter((f: any) => (data.connections ?? []).filter((c: Connection) => c.to === file.path).length > 2).map((f: any) => f.name);
    if (magicCount > 3 || !hasTests || !documented) modelFiles.push({ file: file.path, magic_numbers: magicCount, has_tests: hasTests, documented, entry_functions: entryFns });
  }

  const result = { model_files: modelFiles, high_risk: modelFiles.filter(f => !f.has_tests || f.magic_numbers > 10), summary: `${modelFiles.length} model files audited. ${modelFiles.filter(f=>!f.has_tests).length} untested, ${modelFiles.filter(f=>f.magic_numbers>3).length} with magic numbers.` };
  return { content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }] };
});
```

2. Add "📊 Model Risk" card in the Actions/Suggestions tab when model files detected.

---

## Task 11: Compliance REST API (v3.5.2)

**Files:** `mcp/src/index.ts` (HTTP server section)

**Steps:**

1. After the existing `main()` function but before the `main().catch()` call, add an HTTP server that optionally starts alongside the MCP stdio server when `--http` flag is passed:

```typescript
import * as http from 'http';
import * as url from 'url';

function startHttpServer(port = 7332) {
  const srv = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const parsed = url.parse(req.url ?? '/', true);
    const sessionId = parsed.query['session_id'] as string;
    const token = parsed.query['token'] as string | undefined;
    const envelope = (report_type: string, data: any) => JSON.stringify({ version: '3.5.2', generated_at: new Date().toISOString(), session_id: sessionId, report_type, data }, null, 2);

    if (!sessionId && !parsed.pathname?.startsWith('/health')) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'session_id required' })); return;
    }

    try {
      if (parsed.pathname === '/health') { res.end(JSON.stringify({ status: 'ok' })); return; }
      if (parsed.pathname === '/report/sbom') {
        const session = await getSession(sessionId);
        if (!session) { res.writeHead(404); res.end(JSON.stringify({ error: 'session not found' })); return; }
        // Reuse grasp_sbom logic — format from query param
        const format = (parsed.query['format'] as string) ?? 'cyclonedx';
        res.end(envelope('sbom', { format, note: 'Run grasp_sbom MCP tool for full output' }));
        return;
      }
      if (parsed.pathname === '/report/dora') { res.end(envelope('dora', { note: 'Requires GitHub token. Run grasp_dora MCP tool.' })); return; }
      if (parsed.pathname === '/report/do178c') { res.end(envelope('do178c', { note: 'Run grasp_req_trace + grasp_anomaly for full evidence package.' })); return; }
      if (parsed.pathname === '/report/pii-audit') { res.end(envelope('pii-audit', { note: 'Mark PII sources first, then run grasp_pii_trace.' })); return; }
      if (parsed.pathname === '/report/model-risk') { res.end(envelope('model-risk', { note: 'Run grasp_model_risk MCP tool for full output.' })); return; }
      res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown report type' }));
    } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  });
  srv.listen(port, () => process.stderr.write(`[grasp] HTTP report API on :${port}\n`));
}

if (process.argv.includes('--http')) startHttpServer(Number(process.argv.find(a => a.startsWith('--http-port='))?.split('=')[1] ?? '7332'));
```

2. Update CLI help text in README and mcp/README.md: `npx grasp --http` starts the REST server.
3. Build, bump all files to `v3.5.2`, CHANGELOG, commit, push, tag `v3.5.2`.
4. Commit: `git commit -m "feat: compliance REST API — /report/sbom|dora|do178c|pii-audit|model-risk endpoints (v3.5.2)"`

---

# PHASE 3 — OS / Kernel Vertical (v3.6.0–v3.6.2)

---

## Task 12: Kernel Subsystem Boundary Map + grasp_subsystems (v3.6.0)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

1. Add `grasp_subsystems` tool:

```typescript
server.registerTool('grasp_subsystems', {
  title: 'Kernel / OS Subsystem Boundary Map',
  description: `Detect directory-level subsystem groupings in C/C++ repos (networking, fs, mm, drivers, arch, crypto, etc.) and flag cross-subsystem dependencies. Also supports user-defined subsystems via custom boundaries.`,
  inputSchema: {
    session_id: z.string(),
    custom_boundaries: z.array(z.object({ name: z.string(), paths: z.array(z.string()) })).optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const DEFAULT_SUBSYSTEMS = [
    { name: 'networking', paths: ['net/', 'drivers/net/', 'include/net/'] },
    { name: 'filesystem', paths: ['fs/', 'include/linux/fs'] },
    { name: 'memory-management', paths: ['mm/', 'include/linux/mm'] },
    { name: 'drivers', paths: ['drivers/'] },
    { name: 'arch', paths: ['arch/'] },
    { name: 'crypto', paths: ['crypto/'] },
    { name: 'security', paths: ['security/'] },
    { name: 'kernel-core', paths: ['kernel/'] },
  ];
  const subsystems = [...DEFAULT_SUBSYSTEMS, ...(args.custom_boundaries ?? [])];

  function getSubsystem(filePath: string) {
    return subsystems.find(s => s.paths.some(p => filePath.startsWith(p)))?.name ?? 'other';
  }

  const crossBoundary: Array<{ from: string; to: string; from_subsystem: string; to_subsystem: string }> = [];
  for (const conn of data.connections ?? []) {
    const fromSys = getSubsystem((conn as Connection).from);
    const toSys = getSubsystem((conn as Connection).to);
    if (fromSys !== toSys && fromSys !== 'other' && toSys !== 'other') {
      crossBoundary.push({ from: (conn as Connection).from, to: (conn as Connection).to, from_subsystem: fromSys, to_subsystem: toSys });
    }
  }

  const subsystemStats = subsystems.map(s => ({
    name: s.name,
    file_count: (data.files ?? []).filter((f: any) => s.paths.some(p => f.path.startsWith(p))).length,
    cross_boundary_deps: crossBoundary.filter(c => c.from_subsystem === s.name || c.to_subsystem === s.name).length,
  }));

  return { content: [{ type: 'text', text: truncate(JSON.stringify({ subsystems: subsystemStats, cross_boundary_violations: crossBoundary, summary: `${crossBoundary.length} cross-subsystem dependencies detected` }, null, 2)) }] };
});
```

2. In Architecture tab, add a "🗂 Subsystems" sub-section showing subsystem breakdown (only for C/C++ repos detected by language stat).

---

## Task 13: ABI Stability Checker — grasp_abi_diff (v3.6.0)

**Files:** `mcp/src/index.ts`

**Steps:**

1. Add `grasp_abi_diff` tool (universal — works for any language):

```typescript
server.registerTool('grasp_abi_diff', {
  title: 'ABI / API Stability Checker',
  description: `Compare exported symbols between two sessions. For C/C++: function signatures in headers. For JS/TS: non-underscore exports. Flags removed exports (breaking), signature changes (breaking), new exports (non-breaking). Works for any language.`,
  inputSchema: {
    session_id_old: z.string(),
    session_id_new: z.string(),
    header_only: z.boolean().optional().describe('Only check .h/.hpp header files (C/C++ mode)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_ || !new_) return { content: [{ type: 'text', text: 'Session(s) not found' }] };

  function getExports(data: AnalysisResult, headerOnly: boolean) {
    const exports: Array<{ symbol: string; file: string; params: number }> = [];
    for (const file of data.files ?? []) {
      if (headerOnly && !file.path.match(/\.(h|hpp|hxx)$/)) continue;
      for (const fn of (file as any).functions ?? []) {
        if (fn.exported || (fn.name && !fn.name.startsWith('_'))) {
          exports.push({ symbol: `${file.path}::${fn.name}`, file: file.path, params: fn.params ?? 0 });
        }
      }
    }
    return exports;
  }

  const oldExps = getExports(old_, args.header_only ?? false);
  const newExps = getExports(new_, args.header_only ?? false);
  const oldMap = new Map(oldExps.map(e => [e.symbol, e]));
  const newMap = new Map(newExps.map(e => [e.symbol, e]));

  const removed = oldExps.filter(e => !newMap.has(e.symbol)).map(e => ({ ...e, change: 'removed' }));
  const changed = oldExps.filter(e => newMap.has(e.symbol) && newMap.get(e.symbol)!.params !== e.params).map(e => ({ ...e, new_params: newMap.get(e.symbol)!.params, change: 'signature_changed' }));
  const added = newExps.filter(e => !oldMap.has(e.symbol)).map(e => ({ ...e, change: 'added' }));

  const stability_score = oldExps.length === 0 ? 100 : Math.round(((oldExps.length - removed.length - changed.length) / oldExps.length) * 100);
  return { content: [{ type: 'text', text: JSON.stringify({ stability_score, removed, changed, added, summary: `ABI stability: ${stability_score}/100. ${removed.length} removed, ${changed.length} changed, ${added.length} added.` }, null, 2) }] };
});
```

2. Build, bump to `v3.6.0`, CHANGELOG, commit, push, tag.
3. Commit: `git commit -m "feat: kernel subsystem boundary map + ABI stability checker (v3.6.0)"`

---

## Task 14: Kconfig Analysis + IRQ Dependency Graph (v3.6.1)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

**grasp_kconfig:**
```typescript
server.registerTool('grasp_kconfig', {
  title: 'Kconfig / Build-Time Conditional Analysis',
  description: `Parse Kconfig files and #ifdef CONFIG_* patterns in C files. Maps config options to conditionally compiled files. Detects high-risk toggles (affecting >50 files) and dead code under specific configs.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const configUsage = new Map<string, string[]>(); // CONFIG_X → [files]
  for (const file of data.files ?? []) {
    const content: string = (file as any).rawContent ?? '';
    const matches = content.match(/CONFIG_[A-Z0-9_]+/g) ?? [];
    for (const cfg of matches) {
      if (!configUsage.has(cfg)) configUsage.set(cfg, []);
      configUsage.get(cfg)!.push(file.path);
    }
  }

  const options = [...configUsage.entries()].map(([name, files]) => ({ name, file_count: files.length, high_risk: files.length > 50, files: files.slice(0, 10) }));
  options.sort((a, b) => b.file_count - a.file_count);
  return { content: [{ type: 'text', text: truncate(JSON.stringify({ config_options: options.slice(0, 50), high_risk_toggles: options.filter(o => o.high_risk), summary: `${options.length} config options. ${options.filter(o=>o.high_risk).length} affect >50 files.` }, null, 2)) }] };
});
```

**grasp_irq:**
```typescript
server.registerTool('grasp_irq', {
  title: 'IRQ / Interrupt Dependency Graph',
  description: `Detect interrupt handler patterns and trace their call chains. Flags: dynamic allocation (malloc/new) in IRQ chain, sleeping calls in IRQ chain, excessive call depth from interrupt context.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const IRQ_PATTERNS = /\birq_handler\b|__irqhandler|ISR_VECTOR|INTERRUPT\s+PROCEDURE|xTaskCreate.*Interrupt|IRQ_CONNECT\s*\(/;
  const ALLOC_PATTERNS = /\bmalloc\b|\bcalloc\b|\bnew\s+\w+/;
  const SLEEP_PATTERNS = /\bsleep\b|\bdelay\b|\bwait\b|\bmsDelay\b|\bvTaskDelay\b/;

  const irqHandlers: Array<{ file: string; fn: string; violations: string[] }> = [];
  for (const file of data.files ?? []) {
    const content: string = (file as any).rawContent ?? '';
    if (!IRQ_PATTERNS.test(content)) continue;
    const violations: string[] = [];
    if (ALLOC_PATTERNS.test(content)) violations.push('Dynamic allocation in IRQ context (forbidden in safety-critical RTOS)');
    if (SLEEP_PATTERNS.test(content)) violations.push('Blocking/sleep call in IRQ handler (causes system hang)');
    const depth = (data.files ?? []).filter((f: any) => (data.connections ?? []).some((c: Connection) => c.from === file.path && f.path === c.to)).length;
    if (depth > 5) violations.push(`Call depth ${depth} from IRQ handler (>5 increases stack overflow risk)`);
    irqHandlers.push({ file: file.path, fn: 'IRQ handler', violations });
  }

  return { content: [{ type: 'text', text: JSON.stringify({ irq_handlers: irqHandlers, violations_total: irqHandlers.reduce((s, h) => s + h.violations.length, 0), summary: `${irqHandlers.length} IRQ handlers. ${irqHandlers.filter(h=>h.violations.length>0).length} have violations.` }, null, 2) }] };
});
```

3. Add "⚡ IRQ" section in Security tab (shown for C/C++ repos).
4. Commit: `git commit -m "feat: grasp_kconfig build-time conditional analysis + grasp_irq interrupt dependency graph (v3.6.1)"`

---

## Task 15: Patch Series Impact (v3.6.2)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

```typescript
server.registerTool('grasp_patch_impact', {
  title: 'Patch Series Impact Analyzer',
  description: `Given an ordered list of commit SHAs, rank patches by blast radius and subsystem crossings. Helps kernel/OS reviewers prioritize which patches in a series need most attention.`,
  inputSchema: {
    session_id: z.string(),
    commits: z.array(z.string()).describe('Ordered list of commit SHAs in the patch series'),
    token: z.string().optional(),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  // Use grasp_timeline data if available, otherwise estimate from session
  const timeline: any[] = (data as any).timeline ?? [];
  const patches = args.commits.map((sha, i) => {
    const commit = timeline.find((t: any) => t.hash?.startsWith(sha)) ?? { hash: sha, files: [] };
    const changedFiles: string[] = commit.files ?? [];
    const blastRadius = changedFiles.reduce((sum: number, f: string) => {
      return sum + (data.connections ?? []).filter((c: Connection) => c.to === f).length;
    }, 0);
    const complexity = changedFiles.reduce((sum: number, f: string) => {
      const file = (data.files ?? []).find((fl: any) => fl.path === f);
      return sum + ((file as any)?.complexity ?? 0);
    }, 0);
    return { patch: i + 1, sha, files_changed: changedFiles.length, blast_radius: blastRadius, complexity, review_priority: blastRadius + complexity };
  });

  patches.sort((a, b) => b.review_priority - a.review_priority);
  return { content: [{ type: 'text', text: JSON.stringify({ patches_ranked: patches, series_summary: { total_files: patches.reduce((s,p)=>s+p.files_changed,0), max_blast_radius: Math.max(...patches.map(p=>p.blast_radius)), review_first: patches[0]?.sha }, summary: `Series of ${patches.length} patches. Review patch ${patches[0]?.patch}/${patches.length} first (blast radius ${patches[0]?.blast_radius}).` }, null, 2) }] };
});
```

2. Add "⚙️ Patch Impact" button in ⋯ menu → opens modal with textarea for commit SHAs + ranked output table.
3. Bump to `v3.6.2`, CHANGELOG, commit, push, tag.
4. Commit: `git commit -m "feat: grasp_patch_impact — patch series blast radius ranking for OS/kernel contributors (v3.6.2)"`

---

# PHASE 4 — Open Source Vertical (v3.7.0–v3.7.2)

---

## Task 16: GitHub App Webhook Handler (v3.7.0)

**Files:** `github-app/src/index.ts` (create), `github-app/package.json` (update)

**Steps:**

1. The `github-app/` directory exists as a stub. Implement the webhook handler:

```typescript
// github-app/src/index.ts
import * as http from 'http';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const GRASP_BIN = process.env.GRASP_BIN ?? 'npx grasp-mcp-server';
const PORT = Number(process.env.PORT ?? 3001);

function verifySignature(body: string, sig: string): boolean {
  if (!SECRET) return true; // unsigned in dev
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end(JSON.stringify({ status: 'ok' })); return; }
  if (req.method !== 'POST' || req.url !== '/webhook') { res.writeHead(404); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const sig = req.headers['x-hub-signature-256'] as string ?? '';
    if (!verifySignature(body, sig)) { res.writeHead(401); res.end('Invalid signature'); return; }

    const event = req.headers['x-github-event'] as string;
    const payload = JSON.parse(body);
    res.end('ok');

    if (event === 'push' && payload.ref === `refs/heads/${payload.repository.default_branch}`) {
      const repo = payload.repository.full_name;
      process.stderr.write(`[grasp-app] Push to ${repo} default branch — queuing analysis\n`);
      // Fire and forget: run grasp analyze and post commit status
      setTimeout(() => {
        try {
          process.stderr.write(`[grasp-app] Analyzing ${repo}\n`);
        } catch (e) { process.stderr.write(`[grasp-app] Error: ${e}\n`); }
      }, 0);
    }

    if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
      const repo = payload.repository.full_name;
      const pr = payload.number;
      process.stderr.write(`[grasp-app] PR #${pr} on ${repo} — queuing health comment\n`);
    }
  });
});

server.listen(PORT, () => process.stderr.write(`[grasp-app] Webhook server on :${PORT}\n`));
```

2. Update `github-app/package.json` to add `"main": "dist/index.js"`, `"scripts": { "build": "tsc", "start": "node dist/index.js" }`.
3. Add `github-app/Dockerfile` based on the existing `docker/Dockerfile` pattern.
4. Update `docker-compose.yml` in `deploy/` to include the github-app service.
5. Commit: `git commit -m "feat: GitHub App webhook handler — push + PR event processing (v3.7.0)"`

---

## Task 17: Good First Issue Generator (v3.7.0)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

```typescript
server.registerTool('grasp_good_first_issues', {
  title: 'Good First Issue Generator',
  description: `Identify ideal first-contribution targets: isolated files (fan-in ≤ 2), low complexity (< 10), no test counterpart, stable (not in active churn). Returns 3–5 ranked suggestions with GitHub issue draft text.`,
  inputSchema: { session_id: z.string(), max_suggestions: z.number().optional() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const testFiles = new Set((data.files ?? []).filter((f: any) => /test|spec/.test(f.path)).map((f: any) => f.path));
  const recentFiles = new Set(((data as any).timeline ?? []).slice(0, 10).flatMap((t: any) => t.files ?? []));

  const candidates = (data.files ?? [])
    .filter((f: any) => {
      const fanIn = (data.connections ?? []).filter((c: Connection) => c.to === f.path).length;
      const fanOut = (data.connections ?? []).filter((c: Connection) => c.from === f.path).length;
      const complexity = f.complexity ?? 0;
      const baseName = f.path.replace(/\.[^.]+$/, '').split('/').pop() ?? '';
      const hasTest = [...testFiles].some(t => t.includes(baseName));
      const isActive = recentFiles.has(f.path);
      return fanIn <= 2 && fanOut <= 3 && complexity < 10 && !hasTest && !isActive && !f.path.match(/test|spec|vendor|node_modules/);
    })
    .sort((a: any, b: any) => (a.complexity ?? 0) - (b.complexity ?? 0))
    .slice(0, args.max_suggestions ?? 5);

  const suggestions = candidates.map((f: any) => ({
    file: f.path,
    why: `Fan-in: ${(data.connections ?? []).filter((c: Connection) => c.to === f.path).length}, complexity: ${f.complexity ?? 0}, no tests`,
    issue_title: `Add tests for ${f.path.split('/').pop()}`,
    issue_body: `## Good First Issue\n\n**File:** \`${f.path}\`\n\n**Task:** Add unit tests for this module.\n\n**Why this file?**\n- Low complexity (score: ${f.complexity ?? 0})\n- Not actively changing\n- No existing test counterpart\n\n**Suggested approach:**\n1. Read \`${f.path}\`\n2. Identify the main exported function(s)\n3. Create \`${f.path.replace(/\.[^.]+$/, '.test$&')}\`\n4. Write tests covering happy path and edge cases`,
  }));

  return { content: [{ type: 'text', text: JSON.stringify({ suggestions, summary: `${suggestions.length} good first issue candidates identified` }, null, 2) }] };
});
```

2. Add "🌱 Good First Issues" button in ⋯ menu → opens modal showing the 5 suggestions with "Copy issue text" button per suggestion.
3. Bump to `v3.7.0`, CHANGELOG, commit, push, tag.
4. Commit: `git commit -m "feat: grasp_good_first_issues + GitHub App webhook handler (v3.7.0)"`

---

## Task 18: API Stability Score + Dependents-in-the-Wild (v3.7.1)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

**grasp_api_stability:**
```typescript
server.registerTool('grasp_api_stability', {
  title: 'API Stability Score',
  description: `Score 0–100 measuring how stable the public API surface is between two sessions. 100 = zero breaking changes, 0 = complete API rewrite. For library authors.`,
  inputSchema: { session_id_old: z.string(), session_id_new: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [old_, new_] = await Promise.all([getSession(args.session_id_old), getSession(args.session_id_new)]);
  if (!old_ || !new_) return { content: [{ type: 'text', text: 'Session(s) not found' }] };

  const getPublicExports = (d: AnalysisResult) => new Set((d.files ?? []).flatMap((f: any) => (f.functions ?? []).filter((fn: any) => fn.exported || (fn.name && !fn.name.startsWith('_'))).map((fn: any) => `${f.path}::${fn.name}`)));
  const oldExp = getPublicExports(old_), newExp = getPublicExports(new_);
  const removed = [...oldExp].filter(k => !newExp.has(k)).length;
  const added = [...newExp].filter(k => !oldExp.has(k)).length;
  const unchanged = [...oldExp].filter(k => newExp.has(k)).length;
  const score = oldExp.size === 0 ? 100 : Math.round((unchanged / oldExp.size) * 100);

  return { content: [{ type: 'text', text: JSON.stringify({ stability_score: score, unchanged, removed, added, total_exports_old: oldExp.size, total_exports_new: newExp.size, badge_text: `API Stability: ${score}/100` }, null, 2) }] };
});
```

**grasp_dependents (deps.dev integration):**
```typescript
server.registerTool('grasp_dependents', {
  title: 'Dependents in the Wild',
  description: `Query deps.dev for how many public packages depend on this repo. Shows dependent count and which of your files are most-imported by the ecosystem.`,
  inputSchema: { session_id: z.string(), package_name: z.string().optional() },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const pkgName = args.package_name ?? (data as any).packageJson?.name;
  if (!pkgName) return { content: [{ type: 'text', text: 'No package name found. Pass package_name explicitly.' }] };

  try {
    const resp = await fetch(`https://api.deps.dev/v3alpha/projects/github.com%2F${encodeURIComponent(pkgName)}`);
    const json = await resp.json() as any;
    const dependentCount = json?.dependents?.count ?? 'unknown';
    return { content: [{ type: 'text', text: JSON.stringify({ package: pkgName, dependent_count: dependentCount, source: 'deps.dev', note: dependentCount === 'unknown' ? 'Package may not be indexed on deps.dev yet' : `${dependentCount} public packages depend on ${pkgName}` }, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ package: pkgName, dependent_count: 'unavailable', error: e.message }, null, 2) }] };
  }
});
```

3. Show API stability score badge in the health score panel (below the grade) when two sessions are compared.
4. Commit: `git commit -m "feat: grasp_api_stability score + grasp_dependents deps.dev integration (v3.7.1)"`

---

## Task 19: Fork Divergence + OpenSSF Scorecard + Contributor Impact (v3.7.2)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

**grasp_fork_diff:**
```typescript
server.registerTool('grasp_fork_diff', {
  title: 'Fork Divergence Analysis',
  description: `Compare a fork session against its upstream session. Shows diverged files, identical files, fork-only files, and the blast radius of merging upstream back.`,
  inputSchema: { session_id_fork: z.string(), session_id_upstream: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const [fork, upstream] = await Promise.all([getSession(args.session_id_fork), getSession(args.session_id_upstream)]);
  if (!fork || !upstream) return { content: [{ type: 'text', text: 'Session(s) not found' }] };

  const forkFiles = new Map((fork.files ?? []).map((f: any) => [f.path, f]));
  const upstreamFiles = new Map((upstream.files ?? []).map((f: any) => [f.path, f]));

  const diverged: string[] = [], identical: string[] = [], forkOnly: string[] = [], upstreamOnly: string[] = [];
  for (const [path, fFile] of forkFiles) {
    if (!upstreamFiles.has(path)) { forkOnly.push(path); continue; }
    const uFile = upstreamFiles.get(path)!;
    if ((fFile as any).hash !== (uFile as any).hash && ((fFile as any).lines !== (uFile as any).lines || (fFile as any).functions?.length !== (uFile as any).functions?.length)) diverged.push(path);
    else identical.push(path);
  }
  for (const path of upstreamFiles.keys()) if (!forkFiles.has(path)) upstreamOnly.push(path);

  const mergeBlastRadius = diverged.reduce((sum, p) => sum + (fork.connections ?? []).filter((c: Connection) => c.to === p).length, 0);
  return { content: [{ type: 'text', text: JSON.stringify({ diverged: diverged.length, identical: identical.length, fork_only: forkOnly.length, upstream_only: upstreamOnly.length, diverged_files: diverged, merge_blast_radius: mergeBlastRadius, summary: `Fork has diverged in ${diverged.length} files. Merging upstream would affect ${mergeBlastRadius} dependent files.` }, null, 2) }] };
});
```

**OpenSSF Scorecard** — add to `grasp_analyze` output (no separate tool):
In the analysis result post-processing in `mcp/src/index.ts`, after analysis completes for GitHub repos, attempt:
```typescript
// After analysis completes, fetch OpenSSF scorecard async (fire-and-forget stored in session)
if (source.includes('github.com') || !source.startsWith('/')) {
  fetch(`https://api.securityscorecards.dev/projects/github.com/${repoPath}`)
    .then(r => r.json())
    .then((scorecard: any) => {
      if (scorecard?.score) {
        const existingSession = sessionStore.get(sessionId);
        if (existingSession) (existingSession as any).openssf = { score: scorecard.score, checks: scorecard.checks };
      }
    }).catch(() => {});
}
```

**Contributor impact** — extend `grasp_contributors` output:
Add `impact_score` field per contributor: `impact_score = files_owned.reduce((s, f) => s + (fanIn[f] ?? 0) + (complexity[f] ?? 0), 0)`. Sort by impact_score desc.

3. Bump to `v3.7.2`, CHANGELOG, commit, push, tag.
4. Commit: `git commit -m "feat: fork divergence, OpenSSF scorecard integration, contributor impact score (v3.7.2)"`

---

# PHASE 5 — ESA Part 2 (v3.8.0–v3.8.2)

---

## Task 20: Ada / SPARK Deep Support (v3.8.0)

**Files:** `mcp/src/parser.js`

**Steps:**

1. In `parser.js`, find the `SUPPORTED_EXTENSIONS` or file type detection section and add:
   - `.adb` → Ada body, `.ads` → Ada spec, language = `'Ada'`

2. Add Ada parsing in the file content processing section:
```javascript
function parseAdaFile(content, filePath) {
  const functions = [];
  const imports = [];
  
  // Extract procedures and functions
  const fnRegex = /\b(procedure|function)\s+(\w+)\s*(?:\([^)]*\))?\s*(?:return\s+\w+)?\s*is/gi;
  let match;
  while ((match = fnRegex.exec(content)) !== null) {
    functions.push({ name: match[2], type: match[1].toLowerCase(), line: content.slice(0, match.index).split('\n').length, exported: !content.slice(0, match.index).includes('private') });
  }
  
  // Extract with-clauses (imports)
  const withRegex = /^\s*with\s+([\w.]+)\s*;/gm;
  while ((match = withRegex.exec(content)) !== null) {
    imports.push(match[1].replace(/\./g, '/'));
  }
  
  // SPARK annotations
  const sparkIssues = [];
  if (/Ada\.Unchecked_Conversion/.test(content)) sparkIssues.push({ type: 'warning', msg: 'Ada.Unchecked_Conversion — potential type safety issue' });
  if (/Ada\.Unchecked_Deallocation/.test(content)) sparkIssues.push({ type: 'warning', msg: 'Ada.Unchecked_Deallocation — potential memory safety issue' });
  
  return { functions, imports, sparkIssues, language: 'Ada' };
}
```

3. Call `parseAdaFile` for `.adb`/`.ads` files in the main file processing loop.
4. Add Ada to the language color in Architecture layer view.
5. Commit: `git commit -m "feat: Ada/SPARK parser — .adb/.ads support, SPARK contract detection (v3.8.0)"`

---

## Task 21: Multi-Language Call Graph — grasp_multilang (v3.8.0)

**Files:** `mcp/src/index.ts`

**Steps:**

```typescript
server.registerTool('grasp_multilang', {
  title: 'Multi-Language Call Graph',
  description: `Detect cross-language call boundaries: Ada pragma Import/Export to C, Python ctypes/cffi calling C, JavaScript calling Rust/WASM. Renders cross-language edges and flags safety gaps where MISRA violations may not be caught across the boundary.`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const crossLangEdges: Array<{ from_file: string; to_file: string; mechanism: string; risk: string }> = [];

  for (const file of data.files ?? []) {
    const content: string = (file as any).rawContent ?? '';
    const lang: string = (file as any).language ?? '';

    // Ada → C via pragma Import
    if (lang === 'Ada' || file.path.match(/\.(adb|ads)$/)) {
      const pragmaImport = content.match(/pragma\s+Import\s*\(\s*C\s*,\s*(\w+)\s*,\s*"([^"]+)"/gi) ?? [];
      for (const p of pragmaImport) {
        const cFn = p.match(/"([^"]+)"/)?.[1];
        const cFile = (data.files ?? []).find((f: any) => (f as any).rawContent?.includes(`${cFn}(`));
        crossLangEdges.push({ from_file: file.path, to_file: cFile?.path ?? `[C: ${cFn}]`, mechanism: 'Ada pragma Import(C)', risk: 'MISRA rules do not cross Ada→C boundary' });
      }
    }

    // Python → C via ctypes/cffi
    if (lang === 'Python' || file.path.match(/\.py$/)) {
      if (/ctypes|cffi|cdll|CDLL/.test(content)) {
        crossLangEdges.push({ from_file: file.path, to_file: '[C shared library]', mechanism: 'Python ctypes/cffi', risk: 'C code not visible to Python static analysis' });
      }
    }

    // JavaScript → WASM
    if (file.path.match(/\.[jt]sx?$/) && /WebAssembly\.instantiate|\.wasm/.test(content)) {
      crossLangEdges.push({ from_file: file.path, to_file: '[WebAssembly module]', mechanism: 'WebAssembly', risk: 'WASM module not analysed by Grasp' });
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify({ cross_language_edges: crossLangEdges, summary: `${crossLangEdges.length} cross-language boundaries detected` }, null, 2) }] };
});
```

2. Build, bump to `v3.8.0`, CHANGELOG, commit, push, tag.
3. Commit: `git commit -m "feat: Ada support + grasp_multilang cross-language call graph (v3.8.0)"`

---

## Task 22: Heritage Software Genealogy + ICD Mapper (v3.8.1)

**Files:** `index.html`, `mcp/src/index.ts`

**Steps:**

**Heritage:**
- localStorage key: `grasp_heritage_manifest` — array of `{file, origin_mission, origin_version, delta_functions:[]}`
- ⋯ menu → "🏛 Heritage Manifest" opens upload modal (JSON/CSV)
- Files with heritage entries get a 🏛 badge in graph
- MCP tool `grasp_heritage`:
```typescript
server.registerTool('grasp_heritage', {
  title: 'Heritage Software Genealogy',
  description: `Overlay heritage manifest (which files came from prior missions/versions) on the codebase. Returns heritage coverage %, delta complexity, and files with zero delta (reuse candidates for certification shortcut).`,
  inputSchema: { session_id: z.string(), manifest: z.array(z.object({ file: z.string(), origin_mission: z.string(), origin_version: z.string().optional(), delta_functions: z.array(z.string()).optional() })) },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };
  const total = data.files?.length ?? 0;
  const zeroDelta = args.manifest.filter(m => !m.delta_functions?.length);
  const heritage_pct = total === 0 ? 0 : Math.round((args.manifest.length / total) * 100);
  return { content: [{ type: 'text', text: JSON.stringify({ heritage_pct, total_files: total, heritage_files: args.manifest.length, zero_delta_files: zeroDelta, certification_shortcut_candidates: zeroDelta.length, summary: `${heritage_pct}% heritage. ${zeroDelta.length} files unchanged from original — certification evidence reusable.` }, null, 2) }] };
});
```

**ICD Mapper:**
- localStorage key: `grasp_icd_entries`
- New "📋 ICD" tab in right panel
- MCP tool `grasp_icd` matches ICD entries to code functions, flags unimplemented interfaces and undocumented interfaces

3. Commit: `git commit -m "feat: heritage software genealogy + ICD mapper (v3.8.1)"`

---

## Task 23: ECSS-E-ST-40C Compliance Checker (v3.8.2)

**Files:** `mcp/src/index.ts`, `index.html`

**Steps:**

```typescript
server.registerTool('grasp_ecss', {
  title: 'ECSS-E-ST-40C Compliance Checker',
  description: `Check ESA software engineering standard ECSS-E-ST-40C compliance. Verifiable rules: DI-01 (unique IDs in file headers), DI-04 (documented interfaces), DI-07 (test coverage), DI-10 (no circular deps), DI-15 (no dead code).`,
  inputSchema: { session_id: z.string() },
  annotations: { readOnlyHint: true },
}, async (args) => {
  const data = await getSession(args.session_id);
  if (!data) return { content: [{ type: 'text', text: 'Session not found' }] };

  const rules = [
    {
      id: 'DI-01', name: 'Unique software item identification',
      check: () => {
        const missing = (data.files ?? []).filter((f: any) => !/(@file|@module|\/\*\*\s*\n.*\*\/)/s.test((f as any).rawContent ?? '')).map((f: any) => f.path);
        return { status: missing.length === 0 ? 'pass' : 'fail', findings: missing.length, detail: missing.slice(0, 10) };
      }
    },
    { id: 'DI-04', name: 'Documented interfaces', check: () => { const undoc = (data.files ?? []).filter((f: any) => !(f as any).rawContent?.includes('/**') && !/(f: any).rawContent?.includes('"""')).length; return { status: undoc === 0 ? 'pass' : 'warn', findings: undoc, detail: [] }; } },
    { id: 'DI-07', name: 'Test coverage documented', check: () => { const testFiles = new Set((data.files ?? []).filter((f: any) => /test|spec/.test(f.path)).map((f: any) => f.path)); const untested = (data.files ?? []).filter((f: any) => !/(test|spec)/.test(f.path) && ![...testFiles].some(t => t.includes(f.path.split('/').pop()?.replace(/\.[^.]+$/,'')??''))).length; return { status: untested === 0 ? 'pass' : 'warn', findings: untested, detail: [] }; } },
    { id: 'DI-10', name: 'No circular dependencies', check: () => { const cycles = (data as any).cycles ?? []; return { status: cycles.length === 0 ? 'pass' : 'fail', findings: cycles.length, detail: cycles.slice(0, 5) }; } },
    { id: 'DI-15', name: 'No dead code in deliverable', check: () => { const dead = (data as any).deadFunctions ?? []; return { status: dead.length === 0 ? 'pass' : 'warn', findings: dead.length, detail: dead.slice(0, 10) }; } },
  ];

  const results = rules.map(r => ({ ...r, ...r.check() })).map(({ check: _, ...r }) => r);
  const passed = results.filter(r => r.status === 'pass').length;
  return { content: [{ type: 'text', text: JSON.stringify({ rules: results, passed, total: results.length, compliance_pct: Math.round((passed / results.length) * 100), summary: `ECSS compliance: ${passed}/${results.length} rules pass` }, null, 2) }] };
});
```

2. Add ECSS section to Certification Report export (extends T3/DO-178C export).

---

## Task 24: VS Code Inline Health Extension (v3.8.2)

**Files:** `vscode-extension/src/extension.ts`, `vscode-extension/package.json`

**Steps:**

1. In `vscode-extension/src/extension.ts`, add decoration providers:

```typescript
import * as vscode from 'vscode';

const fanInDecoration = vscode.window.createTextEditorDecorationType({ after: { margin: '0 0 0 1em', color: '#888' } });

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '⬡ --';
  statusBar.tooltip = 'Grasp health score';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Inline decorations on active editor change
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor) return;
    updateDecorations(editor, statusBar);
  }, null, context.subscriptions);

  // Re-analyse on save
  vscode.workspace.onDidSaveTextDocument(doc => {
    const ext = doc.fileName.split('.').pop();
    if (['ts','js','tsx','jsx','py','c','cpp','h'].includes(ext ?? '')) {
      vscode.commands.executeCommand('grasp.reanalyze');
    }
  }, null, context.subscriptions);

  context.subscriptions.push(vscode.commands.registerCommand('grasp.reanalyze', () => {
    vscode.window.showInformationMessage('Grasp: re-analysing workspace…');
    // Trigger grasp_watch via MCP
  }));
}

function updateDecorations(editor: vscode.TextEditor, statusBar: vscode.StatusBarItem) {
  const grasp = (global as any).__graspSession;
  if (!grasp) return;
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const fileData = grasp.files?.find((f: any) => f.path === filePath);
  if (!fileData) return;

  statusBar.text = `⬡ ${grasp.health ?? '--'} ${grasp.grade ?? ''}`;

  const decorations: vscode.DecorationOptions[] = [];
  editor.document.getText().split('\n').forEach((line, i) => {
    if (/^(import|require|from)/.test(line)) {
      const fanIn = grasp.connections?.filter((c: any) => c.to === filePath).length ?? 0;
      if (fanIn > 3) decorations.push({ range: new vscode.Range(i, line.length, i, line.length), renderOptions: { after: { contentText: ` ← fan-in: ${fanIn}` } } });
    }
  });
  editor.setDecorations(fanInDecoration, decorations);
}

export function deactivate() {}
```

2. Add `"activationEvents": ["onStartupFinished"]` and `"contributes": { "commands": [{"command":"grasp.reanalyze","title":"Grasp: Re-analyse"}] }` to `vscode-extension/package.json`.
3. Build: `cd vscode-extension && npm run build` → no errors.
4. Bump to `v3.8.2`, CHANGELOG, commit, push, tag.
5. Commit: `git commit -m "feat: ECSS-E-ST-40C compliance checker + VS Code inline health decorations (v3.8.2)"`

---

# PHASE 6 — Grasp Cloud (v3.9.0–v3.9.3)

---

## Task 25: SQLite Persistent Session Storage (v3.9.0)

**Files:** `mcp/src/session-store.ts` (modify), add `better-sqlite3` dependency

**Steps:**

1. `cd mcp && npm install better-sqlite3 @types/better-sqlite3`

2. In `mcp/src/session-store.ts`, replace the in-memory store with SQLite-backed store:

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DB_PATH = process.env.GRASP_DB ?? path.join(os.homedir(), '.grasp', 'sessions.db');

export class SessionStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repo TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER,
      data BLOB
    )`);
  }

  async get(id: string): Promise<any | null> {
    const row = this.db.prepare('SELECT data FROM sessions WHERE id = ? AND expires_at > unixepoch()').get(id) as any;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  async set(id: string, data: any, ttlDays = 30): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86400;
    const repo = data.repo ?? '';
    this.db.prepare('INSERT OR REPLACE INTO sessions (id, repo, expires_at, data) VALUES (?, ?, ?, ?)').run(id, repo, expiresAt, JSON.stringify(data));
  }

  async list(): Promise<Array<{ id: string; repo: string; created_at: number }>> {
    return this.db.prepare('SELECT id, repo, created_at FROM sessions WHERE expires_at > unixepoch() ORDER BY created_at DESC').all() as any[];
  }

  async prune(): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()').run();
  }
}
```

3. Build: `cd mcp && npm run build` → no errors. Sessions now survive server restarts.
4. Bump to `v3.9.0`, CHANGELOG, commit, push, tag.
5. Commit: `git commit -m "feat: SQLite persistent session storage — sessions survive restarts, 30-day TTL (v3.9.0)"`

---

## Task 26: GitHub OAuth + Org Workspace (v3.9.1)

**Files:** `mcp/src/index.ts` (HTTP server extension), `saas/src/` (if using saas layer)

**Steps:**

1. Extend the HTTP server from Task 11 with OAuth routes:

```typescript
// Add to HTTP server handler
if (parsed.pathname === '/auth/github') {
  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  if (!clientId) { res.writeHead(500); res.end(JSON.stringify({ error: 'GITHUB_CLIENT_ID not set' })); return; }
  const state = crypto.randomBytes(16).toString('hex');
  // Store state in memory temporarily
  (global as any).__oauthStates = (global as any).__oauthStates ?? new Map();
  (global as any).__oauthStates.set(state, Date.now());
  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=read:user,read:org` });
  res.end(); return;
}

if (parsed.pathname === '/auth/github/callback') {
  const code = parsed.query['code'] as string;
  const state = parsed.query['state'] as string;
  const states: Map<string,number> = (global as any).__oauthStates ?? new Map();
  if (!states.has(state)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid state' })); return; }
  states.delete(state);

  const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  });
  const tokenJson = await tokenResp.json() as any;
  const accessToken = tokenJson.access_token;

  const userResp = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'grasp-cloud' } });
  const user = await userResp.json() as any;

  // Store user session in SQLite (extend sessions table)
  res.writeHead(302, { Location: `/?auth=success&user=${encodeURIComponent(user.login)}` });
  res.end(); return;
}
```

2. Add `GET /api/workspace/:room` and `PUT /api/workspace/:room` endpoints (extend team dashboard sync from v3.3.19).
3. Add role model: `grasp_org_roles` table in SQLite: `(org TEXT, user TEXT, role TEXT)`.
4. Commit: `git commit -m "feat: GitHub OAuth flow + org workspace with role-based access (v3.9.1)"`

---

## Task 27: Billing Tier + SaaS API (v3.9.2)

**Files:** `mcp/src/index.ts` (HTTP server), `saas/src/`

**Steps:**

1. Add entitlement middleware to HTTP server:

```typescript
function checkEntitlement(tier: 'free'|'pro'|'enterprise', required: 'free'|'pro'|'enterprise'): boolean {
  const tiers = { free: 0, pro: 1, enterprise: 2 };
  return tiers[tier] >= tiers[required];
}
```

2. Free tier: 3 sessions, 7-day history. Pro: unlimited sessions, 90-day TTL. Gate `/report/*` endpoints behind Pro tier check.

3. Add Stripe Checkout redirect (no card data handled by Grasp):
```typescript
if (parsed.pathname === '/billing/checkout') {
  const priceId = process.env.STRIPE_PRO_PRICE_ID ?? '';
  if (!priceId) { res.writeHead(503); res.end(JSON.stringify({ error: 'Billing not configured' })); return; }
  // Redirect to Stripe Checkout hosted page
  res.writeHead(302, { Location: `https://checkout.stripe.com/pay/${priceId}?prefilled_email=${encodeURIComponent(parsed.query['email'] as string ?? '')}` });
  res.end(); return;
}
```

4. Add queued analysis API:
```typescript
// POST /api/v1/analyze → returns job_id immediately
// GET /api/v1/jobs/:id → returns status + session_id when done
const jobs = new Map<string, { status: string; session_id?: string; error?: string }>();
```

5. Commit: `git commit -m "feat: billing tier entitlements + SaaS API with queued analysis (v3.9.2)"`

---

## Task 28: CI Webhooks + Hosted Auto-Analysis (v3.9.3)

**Files:** `github-app/src/index.ts` (extend), `deploy/docker-compose.cloud.yml` (create)

**Steps:**

1. Complete the GitHub App webhook handler to fully process push events:

```typescript
// In the push event handler (Task 16 skeleton)
if (event === 'push' && payload.ref === `refs/heads/${payload.repository.default_branch}`) {
  const repo = payload.repository.full_name;
  const token = process.env.GITHUB_APP_TOKEN ?? '';
  // Queue analysis job
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'queued', repo });
  setTimeout(async () => {
    try {
      jobs.set(jobId, { status: 'running', repo });
      // POST to grasp analyze endpoint
      const analyzeResp = await fetch(`http://localhost:${GRASP_PORT}/api/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, token }),
      });
      const { session_id } = await analyzeResp.json() as any;
      jobs.set(jobId, { status: 'done', repo, session_id });

      // Post commit status
      await fetch(`https://api.github.com/repos/${repo}/statuses/${payload.after}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'grasp-app' },
        body: JSON.stringify({ state: 'success', description: `Grasp analysis complete`, context: 'grasp/health', target_url: `https://app.grasp.dev/?repo=${repo}` }),
      });
    } catch (e: any) {
      jobs.set(jobId, { status: 'error', repo, error: e.message });
    }
  }, 100);
}
```

2. Create `deploy/docker-compose.cloud.yml`:

```yaml
version: '3.8'
services:
  grasp-mcp:
    image: ghcr.io/ashfordeou/grasp-mcp-server:latest
    command: ["node", "dist/index.js", "--http", "--http-port=7332"]
    environment:
      - GRASP_DB=/data/sessions.db
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
    volumes:
      - grasp-data:/data
    ports:
      - "7332:7332"

  grasp-app:
    image: ghcr.io/ashfordeou/grasp-github-app:latest
    environment:
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - GITHUB_APP_TOKEN=${GITHUB_APP_TOKEN}
      - GRASP_PORT=7332
    ports:
      - "3001:3001"
    depends_on:
      - grasp-mcp

volumes:
  grasp-data:
```

3. Update `docker/README.md` with cloud deployment instructions.
4. Bump to `v3.9.3`, CHANGELOG, commit, push, tag `v3.9.3`.
5. Commit: `git commit -m "feat: CI webhooks + hosted auto-analysis + cloud docker-compose (v3.9.3)"`

---

## Version Bump Reminder (per CLAUDE.md)

After completing all tasks in each version group, bump these 34 files before committing the version tag:

| File | Field |
|------|-------|
| `browser-extension/package.json` + `manifest.json` + `manifest.firefox.json` + `manifest.safari.json` | `"version"` |
| `mcp/package.json` | `"version"` |
| `mcp/server.json` | `"version"` — appears **twice** |
| `mcp/README.md` | `**Current version: X.Y.Z**` |
| `vscode-extension/package.json` | `"version"` only — do NOT touch the `grasp-mcp-server` dep pin |
| `jetbrains-plugin/build.gradle.kts` | `version =` appears **twice** + `changeNotes` |
| `eclipse-plugin/pom.xml` + `jenkins-plugin/pom.xml` | `<version>` |
| All other `package.json` files (14 dirs) | `"version"` |
| `gpt-actions/src/server.ts` | hardcoded version string |
| `index.html` | `window.GRASP_VERSION` — **two occurrences** |
| `team-dashboard.html` | `GRASP_VERSION` |
| `docs/index.html` | version — two occurrences |
| `docker/Dockerfile` | `grasp-mcp-server@X.Y.Z` |
| `docker/README.md` | version in table |
| `README.md` | version references |
| `CHANGELOG.md` | new entry at top |

**Do NOT bump:** `shared/`, `ai-tools/`, `saas/`, `github-app/`, `slack-bot/`

---

## Verification Checklist (per phase)

Before tagging each version:
- [ ] `cd mcp && npm run build` — no TypeScript errors
- [ ] New MCP tools return valid JSON from a test session
- [ ] New UI elements render in browser without console errors
- [ ] Help modal entry added for each new feature
- [ ] All 34 version files bumped
- [ ] CHANGELOG entry written
- [ ] Tag pushed and GitHub release created
