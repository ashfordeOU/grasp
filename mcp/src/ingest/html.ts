/**
 * HTML → readable text. Dependency-free: strips scripts/styles, converts block
 * elements to line breaks, decodes common entities, and pulls the <title>.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function htmlToText(html: string): { text: string; title?: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : undefined;

  let body = html;
  // Drop non-content elements entirely.
  body = body.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  body = body.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  body = body.replace(/<!--[\s\S]*?-->/g, ' ');
  // Turn block boundaries into newlines so structure survives.
  body = body.replace(/<(\/)?(p|div|section|article|br|li|tr|h[1-6]|ul|ol|table|header|footer|blockquote)[^>]*>/gi, '\n');
  // Strip all remaining tags.
  body = body.replace(/<[^>]+>/g, ' ');
  body = decodeEntities(body);
  body = body.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: body, title };
}

export function extractHtml(html: string): { text: string; title?: string; metadata: Record<string, unknown> } {
  const { text, title } = htmlToText(html);
  return { text, title, metadata: { htmlBytes: html.length } };
}
