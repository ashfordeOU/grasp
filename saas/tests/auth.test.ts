import { generateApiKey, validateApiKey, type ApiKeyRecord } from '../src/auth.js';

test('generateApiKey produces a 32-char hex string prefixed gsp_', () => {
  const key = generateApiKey('free');
  expect(key.apiKey).toMatch(/^gsp_[a-f0-9]{32}$/);
});

test('validateApiKey returns tier for known key', () => {
  const { apiKey } = generateApiKey('pro');
  const store = new Map<string, ApiKeyRecord>();
  store.set(apiKey, { tier: 'pro', createdAt: new Date().toISOString(), owner: 'test@example.com' });
  const result = validateApiKey(apiKey, store);
  expect(result?.tier).toBe('pro');
});

test('validateApiKey returns null for unknown key', () => {
  expect(validateApiKey('gsp_badkey', new Map())).toBeNull();
});
