/** PDF text extraction via the optional `pdf-parse` dependency. */
import { OptionalDependencyError } from './types.js';

export async function extractPdf(buf: Buffer): Promise<{ text: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  let pdfParse: (b: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown }>;
  try {
    const mod: any = await import('pdf-parse');
    pdfParse = mod.default || mod;
  } catch {
    throw new OptionalDependencyError('pdf-parse', 'PDF', 'npm i pdf-parse');
  }
  const data = await pdfParse(buf);
  const warnings = data.text.trim() ? undefined : ['PDF produced no extractable text — it may be a scanned image (try OCR).'];
  return {
    text: data.text || '',
    metadata: { pages: data.numpages, info: data.info },
    warnings,
  };
}
