/**
 * Local audio/video transcription.
 *
 * Pipeline: ffmpeg decodes any container to 16 kHz mono float PCM, then the
 * Whisper model that already ships with Grasp (@xenova/transformers) transcribes
 * it in-process. Fully local — no Python, no faster-whisper, nothing leaves the
 * machine. ffmpeg is the one external requirement (near-universal).
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { ExternalToolError, IngestKind } from './types.js';

function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-version']);
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

/** Decode any media file to a 16 kHz mono Float32 PCM sample array via ffmpeg. */
function decodePcm(source: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const args = ['-nostdin', '-i', source, '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'];
    const p = spawn('ffmpeg', args);
    const bufs: Buffer[] = [];
    const errBufs: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => bufs.push(d));
    p.stderr.on('data', (d: Buffer) => errBufs.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(errBufs).toString('utf8').slice(-400)}`));
        return;
      }
      const raw = Buffer.concat(bufs);
      // Align to 4-byte float boundary and view as Float32.
      const usable = raw.byteLength - (raw.byteLength % 4);
      resolve(new Float32Array(raw.buffer, raw.byteOffset, usable / 4));
    });
  });
}

let _transcriberPromise: Promise<any> | null = null;
async function getTranscriber(model: string): Promise<any> {
  if (!_transcriberPromise) {
    _transcriberPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      (env as any).allowLocalModels = false;
      (env as any).cacheDir = path.join(os.homedir(), '.grasp', 'models');
      return (pipeline as any)('automatic-speech-recognition', model);
    })();
  }
  return _transcriberPromise;
}

export async function extractMedia(
  source: string,
  kind: IngestKind,
  whisperModel = 'Xenova/whisper-tiny',
): Promise<{ text: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  if (!(await hasFfmpeg())) {
    throw new ExternalToolError('ffmpeg', `${kind} transcription`, 'brew install ffmpeg  (macOS) / apt-get install ffmpeg (Linux)');
  }
  const samples = await decodePcm(source);
  const durationSec = samples.length / 16000;
  const transcriber = await getTranscriber(whisperModel);
  const output = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  const text = (Array.isArray(output) ? output.map((o: any) => o.text).join(' ') : output.text || '').trim();
  return {
    text,
    metadata: { model: whisperModel, durationSec: Math.round(durationSec), kind },
    warnings: text ? undefined : ['Transcription produced no text (silent or unsupported audio).'],
  };
}
