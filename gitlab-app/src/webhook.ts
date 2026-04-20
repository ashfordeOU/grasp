import type { Request, Response } from 'express';
import { verifyGitLabSignature } from './webhook-verify.js';
import { buildMrComment, postMrComment, postCommitStatus } from './comment.js';
import { analyzeGitLabRepo } from './analyzer-bridge.js';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';
const GITLAB_TOKEN   = process.env.GITLAB_TOKEN ?? '';
const GITLAB_HOST    = process.env.GITLAB_HOST ?? 'gitlab.com';

interface MergeRequestPayload {
  object_kind: 'merge_request';
  object_attributes: {
    iid: number;
    title: string;
    state: string;
    action: string;
    last_commit: { id: string };
    source: { path_with_namespace: string };
  };
  project: { id: number; path_with_namespace: string };
}

interface PushPayload {
  object_kind: 'push';
  after: string;
  project: { id: number; path_with_namespace: string };
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const headerToken = req.headers['x-gitlab-token'] as string | undefined;
  if (WEBHOOK_SECRET && !verifyGitLabSignature(headerToken, WEBHOOK_SECRET)) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  const event = req.headers['x-gitlab-event'] as string;
  const payload = req.body;

  // Respond immediately — GitLab requires a fast ack
  res.status(202).json({ received: true });

  try {
    if (event === 'Merge Request Hook') {
      await handleMergeRequest(payload as MergeRequestPayload);
    } else if (event === 'Push Hook') {
      await handlePush(payload as PushPayload);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }
}

async function handleMergeRequest(payload: MergeRequestPayload): Promise<void> {
  const { action } = payload.object_attributes;
  if (!['open', 'reopen', 'update'].includes(action)) return;

  const projectPath = payload.project.path_with_namespace;
  const mrIid = payload.object_attributes.iid;
  const mrTitle = payload.object_attributes.title;
  const sha = payload.object_attributes.last_commit.id;

  await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, 'running', 0);

  const summary = await analyzeGitLabRepo(projectPath, GITLAB_HOST, GITLAB_TOKEN);

  const comment = buildMrComment(summary, projectPath, mrTitle);
  await postMrComment(GITLAB_HOST, GITLAB_TOKEN, projectPath, mrIid, comment);

  const state = summary.score >= 60 ? 'success' : 'failed';
  await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, state, summary.score);
}

async function handlePush(payload: PushPayload): Promise<void> {
  const projectPath = payload.project.path_with_namespace;
  const sha = payload.after;
  if (!sha || sha === '0000000000000000000000000000000000000000') return;

  await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, 'running', 0);
  const summary = await analyzeGitLabRepo(projectPath, GITLAB_HOST, GITLAB_TOKEN);
  const state = summary.score >= 60 ? 'success' : 'failed';
  await postCommitStatus(GITLAB_HOST, GITLAB_TOKEN, projectPath, sha, state, summary.score);
}
