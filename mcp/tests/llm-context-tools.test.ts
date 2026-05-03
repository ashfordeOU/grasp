/**
 * Smoke tests for the 4 Phase 2 LLM-context MCP tools (v3.18.0):
 *   - grasp_minimal_context
 *   - grasp_traverse
 *   - grasp_semantic_search
 *   - grasp_apply_refactor
 *
 * Pattern mirrors smoke-new-tools.test.ts: spawn the real server,
 * grasp_analyze the local mcp/src dir, then exercise each new tool.
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

const SERVER_BIN = path.join(__dirname, '..', 'dist', 'index.js');
const REPO_PATH = path.join(__dirname, '..', 'src');
const TIMEOUT = 90_000;

function startServer(): { proc: ChildProcessWithoutNullStreams; lines: readline.Interface } {
  const proc = spawn('node', [SERVER_BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: proc.stdout });
  return { proc, lines };
}

function nextResponse(lines: readline.Interface): Promise<any> {
  return new Promise((resolve, reject) => {
    const onLine = (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined || msg.method === undefined) {
          lines.off('line', onLine);
          resolve(msg);
        }
      } catch { /* skip non-JSON */ }
    };
    lines.on('line', onLine);
    setTimeout(() => {
      lines.off('line', onLine);
      reject(new Error('timeout waiting for response'));
    }, TIMEOUT - 1000);
  });
}

let msgId = 1;
function send(proc: ChildProcessWithoutNullStreams, msg: object) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

async function callTool(
  proc: ChildProcessWithoutNullStreams,
  lines: readline.Interface,
  name: string,
  args: Record<string, unknown>
): Promise<any> {
  const id = msgId++;
  send(proc, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  return nextResponse(lines);
}

describe('Phase 2 LLM-context tools smoke test', () => {
  let proc: ChildProcessWithoutNullStreams;
  let lines: readline.Interface;
  let sessionId: string;
  let analyzedSource: string;

  beforeAll(async () => {
    ({ proc, lines } = startServer());
    proc.stderr.on('data', (d: Buffer) => {
      if (process.env.DEBUG_SMOKE) process.stderr.write('[server] ' + d.toString());
    });

    send(proc, {
      jsonrpc: '2.0', id: msgId++, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } },
    });
    await nextResponse(lines);
    send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

    const analyzeResp = await callTool(proc, lines, 'grasp_analyze', { source: REPO_PATH });
    if (analyzeResp.error) throw new Error(`grasp_analyze failed: ${JSON.stringify(analyzeResp.error)}`);
    const text = analyzeResp.result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);
    sessionId = parsed.session_id;
    analyzedSource = parsed.source ?? REPO_PATH;
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  }, TIMEOUT);

  afterAll(() => { proc?.kill(); });

  test('grasp_minimal_context — returns compact orientation summary', async () => {
    const resp = await callTool(proc, lines, 'grasp_minimal_context', { session_id: sessionId });
    if (resp.error) throw new Error(`grasp_minimal_context RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text.length).toBeGreaterThan(20);
    // Should contain the file count + grade structure
    expect(text).toMatch(/files,/);
    expect(text).toMatch(/Languages:/);
    expect(text).toMatch(/Top hubs:/);
    expect(text).toMatch(/Layers:/);

    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('repo');
    expect(sc).toHaveProperty('file_count');
    expect(sc).toHaveProperty('health_grade');
    expect(sc).toHaveProperty('health_score');
    expect(sc).toHaveProperty('languages');
    expect(sc).toHaveProperty('top_hubs');
    expect(sc).toHaveProperty('layers');
    expect(sc).toHaveProperty('circular_deps');
  }, TIMEOUT);

  test('grasp_traverse — BFS with token budget returns visited list', async () => {
    // Pick a real file in the analyzed session — index.ts is guaranteed to exist
    const resp = await callTool(proc, lines, 'grasp_traverse', {
      session_id: sessionId,
      start: 'index.ts',
      direction: 'both',
      max_tokens: 200,
      max_depth: 3,
    });
    if (resp.error) throw new Error(`grasp_traverse RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Traversal from');

    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('start');
    expect(sc).toHaveProperty('visited');
    expect(Array.isArray(sc.visited)).toBe(true);
    expect(sc).toHaveProperty('remaining_budget');
    expect(sc).toHaveProperty('max_tokens', 200);
    expect(sc).toHaveProperty('max_depth', 3);
  }, TIMEOUT);

  test('grasp_semantic_search — keyword fallback returns ranked results', async () => {
    // Use a query that we know matches function names in mcp/src (e.g. "analyze")
    const resp = await callTool(proc, lines, 'grasp_semantic_search', {
      session_id: sessionId,
      query: 'analyze',
      top_k: 5,
    });
    if (resp.error) throw new Error(`grasp_semantic_search RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('Semantic Search');

    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('query', 'analyze');
    expect(sc).toHaveProperty('top_k', 5);
    expect(sc).toHaveProperty('results');
    expect(Array.isArray(sc.results)).toBe(true);
    // Either embeddings worked OR fallback ran — either is fine,
    // but with the substring "analyze" we expect at least one match in mcp/src.
    expect(sc.results.length).toBeGreaterThan(0);
    expect(sc).toHaveProperty('used_fallback');
  }, TIMEOUT);

  test('grasp_apply_refactor — dry_run returns diff without writing', async () => {
    const resp = await callTool(proc, lines, 'grasp_apply_refactor', {
      session_id: sessionId,
      ops: [{ kind: 'rename', old_name: 'analyzeSource', new_name: 'analyzeRepo' }],
      dry_run: true,
    });
    if (resp.error) throw new Error(`grasp_apply_refactor RPC error: ${JSON.stringify(resp.error)}`);
    const text = resp.result?.content?.[0]?.text ?? '';
    expect(text).toContain('DRY RUN');
    expect(text).toContain('analyzeSource');
    expect(text).toContain('analyzeRepo');

    const sc = resp.result?.structuredContent;
    expect(sc).toHaveProperty('ops');
    expect(Array.isArray(sc.ops)).toBe(true);
    expect(sc).toHaveProperty('files_modified');
    expect(sc).toHaveProperty('total_replacements');
    expect(sc).toHaveProperty('dry_run', true);
  }, TIMEOUT);

  test('grasp_apply_refactor — apply=true writes files in a temp dir', async () => {
    // Build a tiny throwaway repo in a temp dir, then analyze and rename.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-apply-refactor-'));
    const fileA = path.join(tmp, 'a.ts');
    const fileB = path.join(tmp, 'b.ts');
    fs.writeFileSync(fileA, 'export function fooBar() { return 1; }\nexport const fooBarAlt = fooBar;\n');
    fs.writeFileSync(fileB, 'import { fooBar } from "./a";\nconst v = fooBar();\n');

    try {
      const analyzeResp = await callTool(proc, lines, 'grasp_analyze', { source: tmp });
      if (analyzeResp.error) throw new Error(`grasp_analyze (tmp) failed: ${JSON.stringify(analyzeResp.error)}`);
      const text = analyzeResp.result?.content?.[0]?.text ?? '';
      const parsed = JSON.parse(text);
      const tmpSession = parsed.session_id;

      const resp = await callTool(proc, lines, 'grasp_apply_refactor', {
        session_id: tmpSession,
        ops: [{ kind: 'rename', old_name: 'fooBar', new_name: 'bazBar' }],
        dry_run: false,
      });
      if (resp.error) throw new Error(`grasp_apply_refactor (apply) RPC error: ${JSON.stringify(resp.error)}`);
      const outText = resp.result?.content?.[0]?.text ?? '';
      expect(outText).toContain('APPLIED');

      // Whole-word rename: fooBar -> bazBar; fooBarAlt should remain (whole-word boundary)
      const newA = fs.readFileSync(fileA, 'utf8');
      const newB = fs.readFileSync(fileB, 'utf8');
      expect(newA).toContain('bazBar');
      expect(newA).toContain('fooBarAlt'); // not renamed (different word)
      expect(newB).toContain('bazBar');
      expect(newB).not.toMatch(/\bfooBar\b/);

      const sc = resp.result?.structuredContent;
      expect(sc).toHaveProperty('dry_run', false);
      expect(sc.total_replacements).toBeGreaterThan(0);
      expect(sc.files_modified.length).toBeGreaterThan(0);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
    }
  }, TIMEOUT);
});
