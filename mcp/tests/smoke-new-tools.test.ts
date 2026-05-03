/**
 * End-to-end smoke test for the 22 new enterprise MCP tools.
 * Spawns the real MCP server over stdio, runs grasp_analyze on the
 * local grasp repo, then calls every new tool and verifies no errors.
 */

import * as path from 'path';
import {
  startSmokeServer,
  killSmokeServer,
  initializeMcpHandshake,
  callMcpTool,
  type SmokeServer,
} from './helpers/mcp-client';

const SERVER_BIN = path.join(__dirname, '..', 'dist', 'index.js');
const REPO_PATH = path.join(__dirname, '..', 'src'); // mcp/src — small enough for CI
const TIMEOUT = 60_000;

describe('new enterprise tools smoke test', () => {
  let server: SmokeServer | undefined;
  let sessionId: string;

  beforeAll(async () => {
    server = startSmokeServer({ serverBin: SERVER_BIN, homePrefix: 'grasp-smoke-' });
    server.proc.stderr.on('data', (d: Buffer) => {
      if (process.env.DEBUG_SMOKE) process.stderr.write('[server] ' + d.toString());
    });

    await initializeMcpHandshake(server, TIMEOUT);

    const analyzeResp = await callMcpTool(server, 'grasp_analyze', { source: REPO_PATH }, TIMEOUT);
    if (analyzeResp.error) throw new Error(`grasp_analyze failed: ${JSON.stringify(analyzeResp.error)}`);
    const text = analyzeResp.result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);
    sessionId = parsed.session_id;
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  }, TIMEOUT);

  afterAll(() => { killSmokeServer(server); });

  async function ok(name: string, extra: Record<string, unknown> = {}) {
    const resp = await callMcpTool(server!, name, { session_id: sessionId, ...extra }, TIMEOUT);
    if (resp.error) throw new Error(`${name} RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    if (!text) throw new Error(`${name} returned empty response`);
    if (text.startsWith('MCP error')) throw new Error(`${name} tool error: ${text.slice(0, 300)}`);
    if (text.includes('Session not found') || text.includes('not found')) {
      // Allow "not found" in error messages for multi-session tools we pass the same ID
      if (!text.startsWith('{')) throw new Error(`${name} session-not-found: ${text.slice(0, 100)}`);
    }
    return JSON.parse(text);
  }

  // Shorthand for tools that use session_id_old / session_id_new
  async function okDiff(name: string, extra: Record<string, unknown> = {}) {
    return ok(name, { session_id_old: sessionId, session_id_new: sessionId, ...extra });
  }

  // ── 22 tools ─────────────────────────────────────────────────────────────

  test('grasp_org_graph — multi-session org graph', async () => {
    // Requires min 2 sessions; pass the same one twice for smoke test
    const resp = await callMcpTool(server!, 'grasp_org_graph', {
      session_ids: [sessionId, sessionId],
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_org_graph RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    if (text.startsWith('MCP error')) throw new Error(`grasp_org_graph error: ${text.slice(0, 300)}`);
    const r = JSON.parse(text);
    expect(r).toHaveProperty('repos'); // org graph returns repos + edges + shared_libs
    expect(r).toHaveProperty('edges');
  }, TIMEOUT);

  test('grasp_api_diff — API surface diff (same→same = no changes)', async () => {
    const r = await okDiff('grasp_api_diff');
    expect(r).toHaveProperty('added_exports');
    expect(r).toHaveProperty('breaking_changes');
    expect(r).toHaveProperty('summary');
  }, TIMEOUT);

  test('grasp_plugins — extension point detection', async () => {
    const r = await ok('grasp_plugins');
    expect(r).toHaveProperty('extension_points');
    expect(r).toHaveProperty('plugin_implementations');
  }, TIMEOUT);

  test('grasp_semver — semver recommendation (same→same = patch)', async () => {
    const r = await okDiff('grasp_semver');
    expect(r).toHaveProperty('recommendation');
  }, TIMEOUT);

  test('grasp_pii_trace — PII data flow', async () => {
    const r = await ok('grasp_pii_trace', { pii_sources: [] });
    expect(r).toHaveProperty('pii_sources');
    expect(r).toHaveProperty('violations'); // actual field name
  }, TIMEOUT);

  test('grasp_duties — 4-eyes / segregation of duties', async () => {
    const r = await ok('grasp_duties');
    expect(r).toHaveProperty('violations');
  }, TIMEOUT);

  test('grasp_reg_impact — regulatory change impact', async () => {
    const r = await ok('grasp_reg_impact', { regulation: 'GDPR', keywords: [] });
    expect(r).toHaveProperty('direct_impact'); // actual field
    expect(r).toHaveProperty('risk_level');
  }, TIMEOUT);

  test('grasp_latency — latency hotspot analysis', async () => {
    const r = await ok('grasp_latency');
    expect(r).toHaveProperty('hotspots');
  }, TIMEOUT);

  test('grasp_model_risk — ML model risk findings', async () => {
    const r = await ok('grasp_model_risk');
    expect(r).toHaveProperty('findings');
    expect(r).toHaveProperty('summary');
  }, TIMEOUT);

  test('grasp_subsystems — subsystem map', async () => {
    const r = await ok('grasp_subsystems');
    expect(r).toHaveProperty('subsystems');
  }, TIMEOUT);

  test('grasp_abi_diff — ABI compatibility (same→same = 0 removed)', async () => {
    const r = await okDiff('grasp_abi_diff');
    expect(r).toHaveProperty('added');
    expect(r).toHaveProperty('removed');
    expect(r).toHaveProperty('stability_score');
    expect((r as any).stability_score).toBe(100); // same session = no change
  }, TIMEOUT);

  test('grasp_kconfig — Kconfig symbol usage', async () => {
    const r = await ok('grasp_kconfig');
    expect(r).toHaveProperty('config_options');
    expect(r).toHaveProperty('summary');
  }, TIMEOUT);

  test('grasp_irq — IRQ handler analysis', async () => {
    const r = await ok('grasp_irq');
    expect(r).toHaveProperty('irq_handlers'); // actual field name
    expect(r).toHaveProperty('violations_total');
  }, TIMEOUT);

  test('grasp_patch_impact — patch blast radius', async () => {
    // grasp_patch_impact requires a commits array (list of changed file paths)
    const r = await ok('grasp_patch_impact', { commits: ['mcp/src/index.ts'] });
    expect(r).toHaveProperty('patches_ranked'); // actual fields: patches_ranked, series_summary
    expect(r).toHaveProperty('series_summary');
  }, TIMEOUT);

  test('grasp_good_first_issues — beginner-friendly issue generator', async () => {
    const r = await ok('grasp_good_first_issues');
    expect(r).toHaveProperty('suggestions');
    expect(r).toHaveProperty('summary');
  }, TIMEOUT);

  test('grasp_api_stability — API stability score (same→same = 100)', async () => {
    const r = await okDiff('grasp_api_stability');
    expect(r).toHaveProperty('stability_score');
    expect(r).toHaveProperty('removed');
    expect(r).toHaveProperty('added');
    expect((r as any).stability_score).toBe(100);
  }, TIMEOUT);

  test('grasp_dependents — local file blast radius', async () => {
    const r = await ok('grasp_dependents', { file_path: 'mcp/src/index.ts' });
    expect(r).toHaveProperty('depended_on_by');
    expect(r).toHaveProperty('blast_radius');
  }, TIMEOUT);

  test('grasp_fork_diff — fork divergence (same→same = 0)', async () => {
    const resp = await callMcpTool(server!, 'grasp_fork_diff', {
      session_id_fork: sessionId,
      session_id_upstream: sessionId,
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_fork_diff error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    if (text.startsWith('MCP error')) throw new Error(`grasp_fork_diff error: ${text.slice(0, 300)}`);
    const r = JSON.parse(text);
    expect(r).toHaveProperty('diverged');
    expect(r).toHaveProperty('identical');
  }, TIMEOUT);

  test('grasp_multilang — cross-language call graph', async () => {
    const r = await ok('grasp_multilang');
    expect(r).toHaveProperty('cross_language_edges');
    expect(r).toHaveProperty('summary');
  }, TIMEOUT);

  test('grasp_heritage — heritage/legacy genealogy', async () => {
    const r = await ok('grasp_heritage', { manifest: [] });
    expect(r).toHaveProperty('heritage_files');
  }, TIMEOUT);

  test('grasp_icd — interface control document', async () => {
    const r = await ok('grasp_icd', { icd_entries: [] });
    expect(r).toHaveProperty('matched'); // actual fields: matched, unimplemented, undocumented
    expect(r).toHaveProperty('undocumented');
  }, TIMEOUT);

  test('grasp_ecss — ECSS-E-ST-40C compliance', async () => {
    const r = await ok('grasp_ecss');
    expect(r).toHaveProperty('rules');
    expect(r).toHaveProperty('compliance_pct');
  }, TIMEOUT);

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

  test('grasp_exec_flow — execution flow from entry point', async () => {
    const r = await ok('grasp_exec_flow', { entry_point: 'main', max_depth: 3 });
    expect(r).toHaveProperty('steps');
    expect(r).toHaveProperty('mermaid');
    expect(Array.isArray((r as any).steps)).toBe(true);
  }, TIMEOUT);

  test('grasp_skillmd — generates SKILL.md content', async () => {
    const r = await ok('grasp_skillmd');
    expect(r).toHaveProperty('skillmd');
    expect(typeof (r as any).skillmd).toBe('string');
    expect((r as any).skillmd.length).toBeGreaterThan(50);
  }, TIMEOUT);

  test('grasp_hooks — generates Claude Code + Cursor hooks', async () => {
    const r = await ok('grasp_hooks');
    expect(r).toHaveProperty('claude_settings_json');
    expect(r).toHaveProperty('cursor_mdc');
    expect(r).toHaveProperty('claudemd_snippet');
  }, TIMEOUT);

  test('grasp_mro — method resolution order for class hierarchies', async () => {
    const r = await ok('grasp_mro');
    expect(r).toHaveProperty('classes');
    expect(r).toHaveProperty('language_summary');
    expect(Array.isArray((r as any).classes)).toBe(true);
  }, TIMEOUT);

  test('grasp_communities — Leiden community detection', async () => {
    const r = await ok('grasp_communities');
    expect(r).toHaveProperty('communities');
    expect(r).toHaveProperty('modularity_score');
    expect(Array.isArray((r as any).communities)).toBe(true);
  }, TIMEOUT);

  test('grasp_contracts — multi-repo contract analysis', async () => {
    const resp = await callMcpTool(server!, 'grasp_contracts', {
      provider_session_id: sessionId,
      consumer_session_ids: [sessionId],
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_contracts error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    if (text.startsWith('MCP error')) throw new Error(`grasp_contracts error: ${text.slice(0, 300)}`);
    const r = JSON.parse(text);
    expect(r).toHaveProperty('contracts');
    expect(r).toHaveProperty('violations');
    expect(r).toHaveProperty('coverage_pct');
  }, TIMEOUT);

  test('grasp_confidence — connection confidence scores', async () => {
    const r = await ok('grasp_confidence');
    expect(r).toHaveProperty('connections');
    expect(r).toHaveProperty('avg_confidence');
    expect(r).toHaveProperty('distribution');
    expect(Array.isArray((r as any).connections)).toBe(true);
  }, TIMEOUT);

  test('grasp_wiki — auto-generated repo wiki', async () => {
    const r = await ok('grasp_wiki');
    expect(r).toHaveProperty('pages');
    expect(r).toHaveProperty('page_count');
    expect((r as any).page_count).toBeGreaterThan(0);
    expect((r as any).pages).toHaveProperty(['index.md']);
  }, TIMEOUT);

  test('grasp_registry_list — list all indexed repos', async () => {
    const resp = await callMcpTool(server!, 'grasp_registry_list', {}, TIMEOUT);
    if (resp.error) throw new Error(`grasp_registry_list error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    const r = JSON.parse(text);
    expect(r).toHaveProperty('repos');
    expect(r).toHaveProperty('total');
    expect(Array.isArray((r as any).repos)).toBe(true);
  }, TIMEOUT);

  test('grasp_registry_status — registry health status', async () => {
    const resp = await callMcpTool(server!, 'grasp_registry_status', {}, TIMEOUT);
    if (resp.error) throw new Error(`grasp_registry_status error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    const r = JSON.parse(text);
    expect(r).toHaveProperty('indexed_repos');
    expect(r).toHaveProperty('active_sessions');
  }, TIMEOUT);

  test('grasp_resolve_receiver — self/this type inference', async () => {
    const r = await ok('grasp_resolve_receiver');
    expect(r).toHaveProperty('resolutions');
    expect(r).toHaveProperty('total_methods');
    expect(Array.isArray((r as any).resolutions)).toBe(true);
  }, TIMEOUT);

  it('grasp_search returns hybrid search results', async () => {
    const r = await callMcpTool(server!, 'grasp_search', { source: REPO_PATH, query: 'analyze repository dependencies' }, TIMEOUT);
    expect(r.result?.content?.[0]?.text).toBeDefined();
    const text = r.result.content[0].text;
    expect(text).not.toMatch(/error/i);
  }, TIMEOUT);

  it('grasp_rename dry-run returns diff', async () => {
    const r = await callMcpTool(server!, 'grasp_rename', { source: REPO_PATH, old_name: 'analyzeSource', new_name: 'analyzeRepo', apply: false }, TIMEOUT);
    expect(r.result?.content?.[0]?.text).toBeDefined();
    const text = r.result.content[0].text;
    expect(text).not.toMatch(/^Error:/);
  }, TIMEOUT);

  it('grasp_route_map runs without error', async () => {
    const r = await callMcpTool(server!, 'grasp_route_map', { session_id: sessionId }, TIMEOUT);
    expect(r.result?.content?.[0]?.text).toBeDefined();
  }, TIMEOUT);

  it('grasp_api_impact runs without error', async () => {
    const r = await callMcpTool(server!, 'grasp_api_impact', { source: REPO_PATH, handler: 'analyzeSource' }, TIMEOUT);
    expect(r.result?.content?.[0]?.text).toBeDefined();
    expect(r.result.content[0].text).not.toMatch(/^Error:/);
  }, TIMEOUT);

  it('grasp_tool_map detects MCP tool definitions', async () => {
    const r = await callMcpTool(server!, 'grasp_tool_map', { source: REPO_PATH }, TIMEOUT);
    const text = r.result?.content?.[0]?.text ?? '';
    expect(text).not.toMatch(/^Error:/);
    // mcp/src/ contains many registerTool calls
    const parsed = JSON.parse(text);
    expect(parsed.tool_count).toBeGreaterThan(0);
  }, TIMEOUT);

  it('grasp_shape_check runs without error', async () => {
    const r = await callMcpTool(server!, 'grasp_shape_check', { source: REPO_PATH, function_name: 'analyzeSource' }, TIMEOUT);
    expect(r.result?.content?.[0]?.text).toBeDefined();
  }, TIMEOUT);

  it('grasp_group_add and grasp_group_list round-trip', async () => {
    const add = await callMcpTool(server!, 'grasp_group_add', { group: 'test-group', source: REPO_PATH }, TIMEOUT);
    expect(add.result?.content?.[0]?.text).toMatch(/Added/);
    const list = await callMcpTool(server!, 'grasp_group_list', {}, TIMEOUT);
    const text = list.result?.content?.[0]?.text ?? '';
    expect(JSON.parse(text).groups.some((g: any) => g.name === 'test-group')).toBe(true);
  }, TIMEOUT);

  test('grasp_graph_schema — returns Class/Interface/Method node tables', async () => {
    const r = await ok('grasp_graph_schema');
    expect(r).toHaveProperty('node_tables');
    expect(r.node_tables).toContain('Class');
    expect(r.node_tables).toContain('Interface');
    expect(r.node_tables).toContain('Method');
    expect(r.node_tables).toContain('Constructor');
  }, TIMEOUT);

  test('grasp_snapshot — saves snapshot and returns id', async () => {
    const resp = await callMcpTool(server!, 'grasp_snapshot', {
      session_id: sessionId,
      name: 'smoke-baseline',
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_snapshot RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('snapshot_id');
    expect(parsed).toHaveProperty('name', 'smoke-baseline');
    expect(parsed).toHaveProperty('health_score');
    expect(typeof parsed.snapshot_id).toBe('number');
  }, TIMEOUT);

  test('grasp_org_summary — returns org stats (rate-limit tolerant)', async () => {
    const resp = await callMcpTool(server!, 'grasp_org_summary', { org: 'ashfordeOU' }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_org_summary RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text.length).toBeGreaterThan(5);
    // Accept rate-limit errors gracefully — only validate structure on success
    if (!text.includes('failed') && !text.includes('rate limit')) {
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty('org');
      expect(parsed).toHaveProperty('repo_count');
      expect(parsed).toHaveProperty('overall_health_grade');
    }
  }, TIMEOUT);

  test('grasp_coverage_gaps — returns coverage analysis shape', async () => {
    const r = await ok('grasp_coverage_gaps');
    expect(r).toHaveProperty('overall_coverage_estimate');
    expect(r).toHaveProperty('total_functions');
    expect(r).toHaveProperty('uncovered_functions');
    expect(r).toHaveProperty('coverage_by_module');
    expect(typeof r.overall_coverage_estimate).toBe('number');
    expect(Array.isArray(r.uncovered_functions)).toBe(true);
  }, TIMEOUT);

  test('grasp_diff_snapshots — same snapshot vs itself = STABLE', async () => {
    // First save a snapshot to get a real ID
    const snapResp = await callMcpTool(server!, 'grasp_snapshot', {
      session_id: sessionId, name: 'diff-test-snap',
    }, TIMEOUT);
    if (snapResp.error) throw new Error(`grasp_snapshot failed: ${JSON.stringify(snapResp.error)}`);
    const snapText = snapResp.result?.content?.[0]?.text ?? '';
    const snap = JSON.parse(snapText);
    const snapId: number = snap.snapshot_id;
    if (!Number.isFinite(snapId)) throw new Error(`grasp_snapshot did not return a valid snapshot_id: ${snapText}`);

    const resp = await callMcpTool(server!, 'grasp_diff_snapshots', {
      snapshot_id_old: snapId,
      snapshot_id_new: snapId,
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_diff_snapshots RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('drift_level', 'STABLE');
    expect(parsed).toHaveProperty('health_score_delta', 0);
    expect(parsed).toHaveProperty('new_circular_deps');
    expect(parsed).toHaveProperty('coupling_increased');
  }, TIMEOUT);

  // ── Edge cases ────────────────────────────────────────────────────────

  test('grasp_snapshot — nonexistent session returns not-found message', async () => {
    const resp = await callMcpTool(server!, 'grasp_snapshot', {
      session_id: 'nonexistent-session-xyz-999',
    }, TIMEOUT);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toMatch(/not found/i);
  }, TIMEOUT);

  test('grasp_diff_snapshots — missing snapshots return not-found messages', async () => {
    const resp = await callMcpTool(server!, 'grasp_diff_snapshots', {
      snapshot_id_old: 9999999,
      snapshot_id_new: 9999998,
    }, TIMEOUT);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toMatch(/not found/i);
  }, TIMEOUT);

  test('grasp_coverage_gaps — nonexistent session returns not-found message', async () => {
    const resp = await callMcpTool(server!, 'grasp_coverage_gaps', {
      session_id: 'nonexistent-xyz-coverage',
    }, TIMEOUT);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toMatch(/not found/i);
  }, TIMEOUT);

  // ── Phase 1 graph-analytics tools (v3.18.0) ────────────────────────────

  test('grasp_hub_nodes — returns top hubs by degree', async () => {
    const resp = await callMcpTool(server!, 'grasp_hub_nodes', { session_id: sessionId, top: 5 }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_hub_nodes RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Hub nodes');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('rows');
    expect(Array.isArray(sc.rows)).toBe(true);
  }, TIMEOUT);

  test('grasp_bridge_nodes — returns betweenness scores', async () => {
    const resp = await callMcpTool(server!, 'grasp_bridge_nodes', { session_id: sessionId, top: 5 }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_bridge_nodes RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Bridge nodes');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('rows');
    expect(sc).toHaveProperty('node_count');
  }, TIMEOUT);

  test('grasp_surprising_connections — returns rare cross-layer edges', async () => {
    const resp = await callMcpTool(server!, 'grasp_surprising_connections', { session_id: sessionId, max: 10 }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_surprising_connections RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Surprising connections');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('rows');
    expect(sc).toHaveProperty('total_cross_layer_edges');
  }, TIMEOUT);

  test('grasp_knowledge_gaps — returns isolated/untested/weak sections', async () => {
    const resp = await callMcpTool(server!, 'grasp_knowledge_gaps', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_knowledge_gaps RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Knowledge gaps');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('isolated_files');
    expect(sc).toHaveProperty('untested_hotspots');
    expect(sc).toHaveProperty('weak_communities');
  }, TIMEOUT);

  test('grasp_suggested_questions — returns review-question list', async () => {
    const resp = await callMcpTool(server!, 'grasp_suggested_questions', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_suggested_questions RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Suggested review questions');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('questions');
    expect(Array.isArray(sc.questions)).toBe(true);
  }, TIMEOUT);

  // ── Phase 2 LLM-context tools (v3.18.0) ────────────────────────────────

  test('grasp_minimal_context — sub-100 token orientation', async () => {
    const resp = await callMcpTool(server!, 'grasp_minimal_context', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_minimal_context RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toMatch(/files,/);
    expect(text).toMatch(/Languages:/);
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('repo');
    expect(sc).toHaveProperty('file_count');
  }, TIMEOUT);

  test('grasp_traverse — token-budget BFS walk', async () => {
    const resp = await callMcpTool(server!, 'grasp_traverse', {
      session_id: sessionId, start: 'index.ts', direction: 'both', max_tokens: 200, max_depth: 3,
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_traverse RPC error: ${JSON.stringify(resp.error)}`);
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('visited');
    expect(Array.isArray(sc.visited)).toBe(true);
  }, TIMEOUT);

  test('grasp_semantic_search — function search by query', async () => {
    const resp = await callMcpTool(server!, 'grasp_semantic_search', {
      session_id: sessionId, query: 'analyze', top_k: 5,
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_semantic_search RPC error: ${JSON.stringify(resp.error)}`);
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('results');
    expect(Array.isArray(sc.results)).toBe(true);
  }, TIMEOUT);

  test('grasp_apply_refactor — dry_run returns diff', async () => {
    const resp = await callMcpTool(server!, 'grasp_apply_refactor', {
      session_id: sessionId,
      ops: [{ kind: 'rename', old_name: 'analyzeSource', new_name: 'analyzeRepo' }],
      dry_run: true,
    }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_apply_refactor RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('DRY RUN');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('dry_run', true);
    expect(sc).toHaveProperty('ops');
  }, TIMEOUT);

  // ── Phase 4 graph-export tools (v3.18.0) ───────────────────────────────

  test('grasp_export_graphml — emits GraphML XML', async () => {
    const resp = await callMcpTool(server!, 'grasp_export_graphml', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_export_graphml RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('<graphml');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('format', 'graphml');
    expect(sc).toHaveProperty('node_count');
    expect(sc).toHaveProperty('edge_count');
    expect(sc).toHaveProperty('content');
  }, TIMEOUT);

  test('grasp_export_cypher — emits Cypher CREATE statements', async () => {
    const resp = await callMcpTool(server!, 'grasp_export_cypher', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_export_cypher RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('CREATE (');
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('format', 'cypher');
    expect(sc).toHaveProperty('content');
  }, TIMEOUT);

  test('grasp_export_obsidian — emits Obsidian Canvas JSON', async () => {
    const resp = await callMcpTool(server!, 'grasp_export_obsidian', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_export_obsidian RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('format', 'obsidian-canvas');
    expect(sc).toHaveProperty('content');
    // structuredContent.content is the source of truth (text may be truncated).
    const parsed = JSON.parse(sc.content);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
    // text content should be JSON-ish (starts with {)
    expect(text.trimStart().startsWith('{')).toBe(true);
  }, TIMEOUT);

  test('grasp_architecture_overview — combined report', async () => {
    const resp = await callMcpTool(server!, 'grasp_architecture_overview', { session_id: sessionId }, TIMEOUT);
    if (resp.error) throw new Error(`grasp_architecture_overview RPC error: ${JSON.stringify(resp.error)}`);
    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('summary');
    expect(sc).toHaveProperty('layers');
    expect(sc).toHaveProperty('top_hubs');
    expect(sc).toHaveProperty('top_questions');
    expect(Array.isArray(sc.layers)).toBe(true);
  }, TIMEOUT);
});
