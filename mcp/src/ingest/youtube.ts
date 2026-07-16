/**
 * YouTube ingestion.
 *
 * Preferred path: pull existing captions via the optional `youtube-transcript`
 * dependency (fast, no media download). Fallback: if a video has no captions and
 * `yt-dlp` + ffmpeg are available, download the audio and transcribe locally.
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ExternalToolError, OptionalDependencyError } from './types.js';

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    const err: Buffer[] = [];
    p.stderr?.on('data', (d: Buffer) => err.push(d));
    p.on('error', () => resolve({ code: -1, stderr: 'spawn error' }));
    p.on('close', (code) => resolve({ code: code ?? -1, stderr: Buffer.concat(err).toString('utf8') }));
  });
}

export async function extractYoutube(
  url: string,
  whisperModel?: string,
): Promise<{ text: string; title?: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  // 1) Try captions.
  try {
    const mod: any = await import('youtube-transcript');
    const api = mod.YoutubeTranscript || mod.default || mod;
    const segments = await api.fetchTranscript(url);
    const text = segments.map((s: any) => s.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return { text, kind: 'youtube', metadata: { url, source: 'captions', segments: segments.length }, warnings: ['Captions may be auto-generated.'] } as any;
    }
  } catch (e) {
    if (e instanceof OptionalDependencyError) throw e;
    // No captions available — fall through to audio transcription.
  }

  // 2) Fallback: download audio with yt-dlp and transcribe locally.
  const ytdlp = await run('yt-dlp', ['--version']);
  if (ytdlp.code !== 0) {
    throw new ExternalToolError('yt-dlp', 'YouTube video without captions', 'brew install yt-dlp / pip install yt-dlp (also needs ffmpeg)');
  }
  const tmp = path.join(os.tmpdir(), `grasp-yt-${Date.now()}.m4a`);
  try {
    const dl = await run('yt-dlp', ['-f', 'bestaudio', '-x', '--audio-format', 'm4a', '-o', tmp, url]);
    if (dl.code !== 0 || !fs.existsSync(tmp)) {
      throw new Error(`yt-dlp failed: ${dl.stderr.slice(-300)}`);
    }
    const { extractMedia } = await import('./media.js');
    const res = await extractMedia(tmp, 'audio', whisperModel);
    return { text: res.text, metadata: { url, source: 'transcription', ...res.metadata }, warnings: res.warnings };
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup errors */
    }
  }
}
