import { randomBytes } from 'node:crypto';

export interface ApiKeyRecord {
  tier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  owner: string;
}

export function generateApiKey(tier: ApiKeyRecord['tier']): { apiKey: string; record: ApiKeyRecord } {
  const apiKey = `gsp_${randomBytes(16).toString('hex')}`;
  return { apiKey, record: { tier, createdAt: new Date().toISOString(), owner: '' } };
}

export function validateApiKey(key: string, store: Map<string, ApiKeyRecord>): ApiKeyRecord | null {
  return store.get(key) ?? null;
}

export function getRateLimit(tier: ApiKeyRecord['tier'] | null): number {
  return { free: 30, pro: 300, enterprise: 3000 }[tier ?? 'free'] ?? 30;
}
