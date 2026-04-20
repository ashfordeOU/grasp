import { timingSafeEqual } from 'node:crypto';

/**
 * GitLab signs webhooks with a plain token in X-Gitlab-Token header.
 * Compare timing-safely to prevent timing attacks.
 */
export function verifyGitLabSignature(
  headerToken: string | undefined,
  expectedSecret: string
): boolean {
  if (!headerToken) return false;
  try {
    return timingSafeEqual(
      Buffer.from(headerToken),
      Buffer.from(expectedSecret)
    );
  } catch {
    return false;
  }
}
