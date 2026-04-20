import express from 'express';
import { handleWebhook } from './webhook.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '7332', 10);

app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'grasp-gitlab-bot' }));
app.post('/webhook', handleWebhook);

app.listen(PORT, () => {
  console.log(`Grasp GitLab Bot listening on port ${PORT}`);
});
