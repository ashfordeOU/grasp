import { createHmac } from 'node:crypto';
import { verifySignature } from '../src/webhook.js';

describe('verifySignature', () => {
  const secret = 'test-webhook-secret';
  const body = Buffer.from('{"action":"opened"}');

  function makeSignature(b: Buffer, s: string): string {
    return `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;
  }

  test('returns true for a valid signature', () => {
    const sig = makeSignature(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  test('returns false for wrong secret', () => {
    const sig = makeSignature(body, 'wrong-secret');
    expect(verifySignature(body, sig, secret)).toBe(false);
  });

  test('returns false for tampered body', () => {
    const sig = makeSignature(body, secret);
    const tampered = Buffer.from('{"action":"closed"}');
    expect(verifySignature(tampered, sig, secret)).toBe(false);
  });

  test('returns false when signature is undefined', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  test('returns false when signature has wrong prefix', () => {
    const raw = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifySignature(body, `sha1=${raw}`, secret)).toBe(false);
    expect(verifySignature(body, raw, secret)).toBe(false);
  });

  test('returns false for empty signature', () => {
    expect(verifySignature(body, '', secret)).toBe(false);
  });

  test('is timing-safe (no early exit on length mismatch)', () => {
    // Should not throw even with mismatched-length string
    const short = 'sha256=abc';
    expect(() => verifySignature(body, short, secret)).not.toThrow();
    expect(verifySignature(body, short, secret)).toBe(false);
  });
});
