import express from 'express';
import { handleWebhook } from './webhook.js';
import { buildAuthUrl, exchangeCode } from './oauth.js';
import { randomBytes } from 'node:crypto';

const app = express();
const PORT = parseInt(process.env.PORT ?? '7332', 10);

app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'grasp-gitlab-bot' }));
app.post('/webhook', handleWebhook);

app.get('/oauth/start', (req, res) => {
  const host = (req.query['gitlab_host'] as string) ?? 'gitlab.com';
  const state = randomBytes(16).toString('hex');
  res.redirect(buildAuthUrl(host, state));
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query['code'] as string;
  if (!code) { res.status(400).send('Missing code'); return; }
  try {
    const host = process.env.GITLAB_HOST ?? 'gitlab.com';
    const tokens = await exchangeCode(host, code);
    res.json({ access_token: tokens.access_token, expires_at: tokens.expires_at });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Grasp GitLab Bot listening on port ${PORT}`);
});
