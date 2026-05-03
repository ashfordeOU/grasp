// Shared test helpers for spawning the real MCP server over stdio and
// exchanging JSON-RPC messages with it. Used by smoke-new-tools.test.ts and
// llm-context-tools.test.ts (and any future smoke suite) so the boilerplate
// lives in one place — extracted out of the two duplicates Grasp's analyzer
// flagged as the "Same Name: nextResponse / onLine" duplicate-function
// findings.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface SmokeServer {
  proc: ChildProcessWithoutNullStreams;
  lines: readline.Interface;
  tmpHome: string;
}

export interface StartServerOptions {
  serverBin: string;
  envOverrides?: Record<string, string>;
  homePrefix?: string;
}

export function startSmokeServer(opts: StartServerOptions): SmokeServer {
  // Each suite gets its own HOME so brain.db / Kuzu graph file locks don't
  // contend when Jest parallelises test files.
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), opts.homePrefix ?? 'grasp-smoke-'));
  const proc = spawn('node', [opts.serverBin], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: tmpHome,
      GRASP_DISABLE_EMBEDDINGS: '1',
      ...(opts.envOverrides ?? {}),
    },
  });
  const lines = readline.createInterface({ input: proc.stdout });
  return { proc, lines, tmpHome };
}

export function killSmokeServer(server: SmokeServer | undefined): void {
  if (!server) return;
  try { server.proc.kill(); } catch { /* ignore */ }
  if (server.tmpHome) {
    try { fs.rmSync(server.tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function nextRpcResponse(lines: readline.Interface, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMcpResponseLine = (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined || msg.method === undefined) {
          lines.off('line', onMcpResponseLine);
          resolve(msg);
        }
      } catch { /* skip non-JSON */ }
    };
    lines.on('line', onMcpResponseLine);
    setTimeout(() => {
      lines.off('line', onMcpResponseLine);
      reject(new Error('timeout waiting for response'));
    }, Math.max(1000, timeoutMs - 1000));
  });
}

export function sendRpc(proc: ChildProcessWithoutNullStreams, msg: object): void {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

let _msgId = 1;
export function nextMsgId(): number { return _msgId++; }

export async function callMcpTool(
  server: SmokeServer,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<any> {
  const id = nextMsgId();
  sendRpc(server.proc, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } });
  return nextRpcResponse(server.lines, timeoutMs);
}

export async function initializeMcpHandshake(
  server: SmokeServer,
  timeoutMs: number,
): Promise<void> {
  sendRpc(server.proc, {
    jsonrpc: '2.0',
    id: nextMsgId(),
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } },
  });
  await nextRpcResponse(server.lines, timeoutMs);
  sendRpc(server.proc, { jsonrpc: '2.0', method: 'notifications/initialized' });
}
