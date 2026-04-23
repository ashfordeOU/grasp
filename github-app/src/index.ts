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
      process.stderr.write(`[grasp-app] Push to ${repo} default branch — queuing analysis\n`);
    }

    if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
      const repo = payload.repository?.full_name;
      const pr = payload.number;
      process.stderr.write(`[grasp-app] PR #${pr} on ${repo} — queuing health comment\n`);
    }
  });
});

server.listen(PORT, () => process.stderr.write(`[grasp-app] Webhook server on :${PORT}\n`));
