/** Image OCR via the optional `tesseract.js` dependency (fully local, WASM). */
import { OptionalDependencyError } from './types.js';

export async function extractImage(buf: Buffer, lang = 'eng'): Promise<{ text: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  let Tesseract: any;
  try {
    Tesseract = await import('tesseract.js');
  } catch {
    throw new OptionalDependencyError('tesseract.js', 'image OCR', 'npm i tesseract.js');
  }
  const lib = Tesseract.default || Tesseract;
  const { data } = await lib.recognize(buf, lang);
  const conf = typeof data.confidence === 'number' ? data.confidence : undefined;
  const warnings = conf !== undefined && conf < 60 ? [`OCR confidence low (${Math.round(conf)}%) — text may be unreliable.`] : undefined;
  return { text: (data.text || '').trim(), metadata: { ocrConfidence: conf, lang }, warnings };
}
