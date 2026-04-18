/**
 * Webhook signature verification.
 * GitHub signs payloads with HMAC-SHA256 using the webhook secret.
 * Spec: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Returns true if the X-Hub-Signature-256 header matches the computed
 * HMAC of the raw request body.
 */
export function verifySignature(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Webhook payload shapes (minimal, only fields we use) ─────────────────────

export interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    html_url: string;
    head: { sha: string; ref: string };
    base: { repo: { full_name: string; owner: { login: string }; name: string } };
  };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
    private: boolean;
  };
  installation: { id: number };
  sender: { login: string };
}
