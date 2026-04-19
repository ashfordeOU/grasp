import { validateLicenseKey, generateLicenseKey } from '../src/license.js';

test('validateLicenseKey accepts valid enterprise key', () => {
  const key = generateLicenseKey('enterprise', 'acme-corp');
  expect(validateLicenseKey(key).valid).toBe(true);
  expect(validateLicenseKey(key).tier).toBe('enterprise');
});

test('validateLicenseKey rejects malformed key', () => {
  expect(validateLicenseKey('bad-key').valid).toBe(false);
});

test('generateLicenseKey has correct prefix', () => {
  const key = generateLicenseKey('team', 'acme');
  expect(key).toMatch(/^gsp-team-/);
});

test('validateLicenseKey rejects tampered signature', () => {
  const key = generateLicenseKey('enterprise', 'acme');
  const tampered = key.slice(0, -4) + 'aaaa';
  expect(validateLicenseKey(tampered).valid).toBe(false);
});

test('validateLicenseKey roundtrips owner correctly', () => {
  const key = generateLicenseKey('enterprise', 'acme-corp');
  expect(validateLicenseKey(key).owner).toBe('acme-corp');
});

test('owner with colon is preserved correctly', () => {
  const key = generateLicenseKey('team', 'acme:corp');
  const result = validateLicenseKey(key);
  expect(result.valid).toBe(true);
  expect(result.owner).toBe('acme:corp');
});
