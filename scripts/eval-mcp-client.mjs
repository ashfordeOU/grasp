// Minimal MCP-server stdio client for the eval harness. Extracted out of
// eval-token-reduction.mjs so each script stays under the critical-
// complexity threshold Grasp's analyzer flags.

import { spawn } from 'child_process';
import * as readline from 'readline';

function nextResponse(rl, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const onLine = (line) => {
      if (done) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined || msg.method === undefined) {
          done = true;
          rl.off('line', onLine);
          resolve(msg);
        }
      } catch { /* skip non-JSON */ }
    };
    rl.on('line', onLine);
    setTimeout(() => {
      if (done) return;
      done = true;
      rl.off('line', onLine);
      reject(new Error('timeout'));
    }, timeoutMs);
  });
}

export async function graspMinimalContext(serverBin, source) {
  const proc = spawn('node', [serverBin], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GRASP_DISABLE_EMBEDDINGS: '1' },
  });
  const rl = readline.createInterface({ input: proc.stdout });
  let id = 1;
  const send = (m) => proc.stdin.write(JSON.stringify(m) + '\n');
  try {
    send({
      jsonrpc: '2.0', id: id++, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'eval', version: '1' } },
    });
    await nextResponse(rl, 30_000);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    send({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'grasp_analyze', arguments: { source } } });
    const analyze = await nextResponse(rl, 600_000);
    if (analyze.error) throw new Error(`grasp_analyze: ${JSON.stringify(analyze.error)}`);
    const text = analyze.result?.content?.[0]?.text ?? '';
    const sessionId = JSON.parse(text).session_id;

    send({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'grasp_minimal_context', arguments: { session_id: sessionId } } });
    const ctx = await nextResponse(rl, 60_000);
    if (ctx.error) throw new Error(`grasp_minimal_context: ${JSON.stringify(ctx.error)}`);
    const ctxText = ctx.result?.content?.[0]?.text ?? '';
    return { sessionId, text: ctxText, tokens: Math.ceil(ctxText.length / 4), chars: ctxText.length };
  } finally {
    proc.kill();
    rl.close();
  }
}
