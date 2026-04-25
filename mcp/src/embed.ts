import * as path from 'path';
import * as os from 'os';

let _pipeline: any = null;
let _initFailed = false;

export async function getEmbedder(): Promise<any | null> {
  if (_initFailed) return null;
  if (_pipeline) return _pipeline;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    (env as any).allowLocalModels = false;
    (env as any).cacheDir = path.join(os.homedir(), '.grasp', 'models');
    _pipeline = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return _pipeline;
  } catch {
    _initFailed = true;
    return null;
  }
}

export async function embed(text: string): Promise<Float32Array | null> {
  const embedder = await getEmbedder();
  if (!embedder) return null;
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  } catch {
    return null;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export function vecToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer);
}

export function blobToVec(b: Buffer): Float32Array {
  return new Float32Array(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  );
}
