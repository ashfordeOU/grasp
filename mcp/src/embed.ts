import * as path from 'path';
import * as os from 'os';

let _pipeline: any = null;
let _initFailed = false;
let _initPromise: Promise<any> | null = null;

const INIT_TIMEOUT_MS = Number(process.env.GRASP_EMBED_INIT_TIMEOUT_MS ?? 15_000);

export async function getEmbedder(): Promise<any | null> {
  if (_initFailed || process.env.GRASP_DISABLE_EMBEDDINGS === '1') return null;
  if (_pipeline) return _pipeline;
  if (!_initPromise) {
    _initPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      (env as any).allowLocalModels = false;
      (env as any).cacheDir = path.join(os.homedir(), '.grasp', 'models');
      return (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    })();
  }
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), INIT_TIMEOUT_MS));
    const winner = await Promise.race([_initPromise, timeout]);
    if (!winner) {
      _initFailed = true;
      return null;
    }
    _pipeline = winner;
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
