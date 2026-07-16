/** Fetch a web page and reduce it to readable text (dependency-free). */
import { extractHtml } from './html.js';

export async function extractWebPage(url: string): Promise<{ text: string; title?: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'grasp-mcp/ingest (+https://github.com/ashfordeOU/grasp)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  if (contentType.includes('application/json')) {
    return { text: body, metadata: { url, contentType }, warnings: undefined };
  }
  if (contentType.includes('html') || /<html[\s>]/i.test(body)) {
    const { text, title, metadata } = extractHtml(body);
    return { text, title, metadata: { url, contentType, ...metadata } };
  }
  // Plain text / markdown / anything else.
  return { text: body, metadata: { url, contentType } };
}
