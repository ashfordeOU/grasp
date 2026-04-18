/**
 * GitHub App authentication helpers.
 *
 * Generates short-lived JWTs using the App private key and exchanges
 * them for per-installation access tokens that can call the GitHub API.
 */

import { createPrivateKey, createSign } from 'node:crypto';

/**
 * Build a signed GitHub App JWT valid for 60 seconds.
 * Spec: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 */
export function buildJWT(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iat: now - 60,   // allow 60s clock drift
    exp: now + 600,  // 10 minutes
    iss: appId,
  })).toString('base64url');

  const data = `${header}.${payload}`;
  const privateKey = createPrivateKey(privateKeyPem);
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  const sig = sign.sign(privateKey).toString('base64url');
  return `${data}.${sig}`;
}

/**
 * Exchange a JWT for a short-lived installation access token.
 */
export async function getInstallationToken(appId: string, installationId: number, privateKeyPem: string): Promise<string> {
  const jwt = buildJWT(appId, privateKeyPem);
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get installation token (${res.status}): ${body}`);
  }
  const data = await res.json() as { token: string };
  return data.token;
}
