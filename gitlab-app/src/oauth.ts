export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

const CLIENT_ID     = process.env.GITLAB_OAUTH_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GITLAB_OAUTH_CLIENT_SECRET ?? '';
const REDIRECT_URI  = process.env.GITLAB_OAUTH_REDIRECT_URI ?? '';

export function buildAuthUrl(gitlabHost: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'api read_user',
    state,
  });
  return `https://${gitlabHost}/oauth/authorize?${params}`;
}

export async function exchangeCode(
  gitlabHost: string,
  code: string
): Promise<OAuthTokens> {
  const res = await fetch(`https://${gitlabHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth exchange failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshTokens(
  gitlabHost: string,
  refreshToken: string
): Promise<OAuthTokens> {
  const res = await fetch(`https://${gitlabHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export function isExpired(tokens: OAuthTokens, bufferMs = 60_000): boolean {
  return Date.now() + bufferMs >= tokens.expires_at;
}
