/** Word .docx extraction via the optional `mammoth` dependency. */
import { OptionalDependencyError } from './types.js';

export async function extractDocx(buf: Buffer): Promise<{ text: string; metadata: Record<string, unknown> }> {
  let mammoth: any;
  try {
    mammoth = await import('mammoth');
  } catch {
    throw new OptionalDependencyError('mammoth', 'Word .docx', 'npm i mammoth');
  }
  const result = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
  return { text: result.value || '', metadata: { messages: result.messages?.length ?? 0 } };
}
