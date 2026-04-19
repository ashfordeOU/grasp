import { createHmac } from 'node:crypto';

const SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET ?? 'grasp-dev-secret';
const TIERS = ['free', 'team', 'enterprise'] as const;
type Tier = typeof TIERS[number];

export function generateLicenseKey(tier: Tier, owner: string): string {
  const payload = `${tier}:${owner}:${Date.now()}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', SIGNING_SECRET).update(payloadB64).digest('hex').slice(0, 16);
  return `gsp-${tier}-${payloadB64}-${sig}`;
}

export function validateLicenseKey(key: string): { valid: boolean; tier?: Tier; owner?: string } {
  const m = key.match(/^gsp-(free|team|enterprise)-([A-Za-z0-9_-]+)-([a-f0-9]{16})$/);
  if (!m) return { valid: false };
  const [, tier, payloadB64, sig] = m;
  const expected = createHmac('sha256', SIGNING_SECRET).update(payloadB64).digest('hex').slice(0, 16);
  if (sig !== expected) return { valid: false };
  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const [, owner] = payload.split(':');
  return { valid: true, tier: tier as Tier, owner };
}
