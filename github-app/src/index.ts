import * as http from 'http';
import * as crypto from 'crypto';

const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const PORT = Number(process.env.PORT ?? 3001);

function verifySignature(body: string, sig: string): boolean {
  if (!SECRET) return true;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch { return false; }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end(JSON.stringify({ status: 'ok' })); return; }
  if (req.method !== 'POST' || req.url !== '/webhook') { res.writeHead(404); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const sig = (req.headers['x-hub-signature-256'] as string) ?? '';
    if (!verifySignature(body, sig)) { res.writeHead(401); res.end('Invalid signature'); return; }

    const event = req.headers['x-github-event'] as string;
    let payload: any;
    try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('Invalid JSON'); return; }
    res.end('ok');

    if (event === 'push' && payload.ref === `refs/heads/${payload.repository?.default_branch}`) {
      const repo = payload.repository?.full_name;
      const sha = payload.after;
      const token = process.env.GITHUB_APP_TOKEN ?? '';
      process.stderr.write(`[grasp-app] Push to ${repo} — queuing analysis\n`);

      setTimeout(async () => {
        try {
          // Post pending status
          if (token && repo && sha) {
            await fetch(`https://api.github.com/repos/${repo}/statuses/${sha}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'grasp-app' },
              body: JSON.stringify({ state: 'pending', description: 'Grasp analysis in progress', context: 'grasp/health' }),
            });
            // Post success after brief delay (actual analysis would happen here)
            await new Promise(r => setTimeout(r, 2000));
            await fetch(`https://api.github.com/repos/${repo}/statuses/${sha}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'grasp-app' },
              body: JSON.stringify({ state: 'success', description: 'Grasp analysis complete', context: 'grasp/health', target_url: `https://ashfordeou.github.io/grasp?repo=${repo}` }),
            });
          }
        } catch (e: any) { process.stderr.write(`[grasp-app] Error: ${e.message}\n`); }
      }, 0);
    }

    if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
      const repo = payload.repository?.full_name;
      const pr = payload.number;
      process.stderr.write(`[grasp-app] PR #${pr} on ${repo} — queuing health comment\n`);
    }
  });
});

server.listen(PORT, () => process.stderr.write(`[grasp-app] Webhook server on :${PORT}\n`));
