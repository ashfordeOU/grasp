/**
 * Multimodal ingestion dispatcher.
 *
 * `ingestPath` / `ingestUrl` route any artifact to the right extractor and
 * return a normalized {@link IngestedDoc}. Extractors that need heavy or native
 * dependencies (PDF, docx, xlsx, OCR, media transcription) lazy-load them and
 * raise {@link OptionalDependencyError} / {@link ExternalToolError} with an
 * install hint — the core package stays lean and works with zero extras.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IngestedDoc, IngestedChunk, IngestKind } from './types.js';

export * from './types.js';

const EXT_KIND: Record<string, IngestKind> = {
  '.md': 'markdown', '.mdx': 'markdown', '.markdown': 'markdown', '.qmd': 'markdown', '.rmd': 'markdown',
  '.txt': 'text', '.rst': 'text', '.text': 'text', '.rtf': 'text',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx', '.xlsm': 'xlsx', '.xls': 'xlsx', '.csv': 'text', '.tsv': 'text',
  '.html': 'html', '.htm': 'html', '.xhtml': 'html',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.bmp': 'image', '.tiff': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.flac': 'audio', '.ogg': 'audio', '.aac': 'audio',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.avi': 'video',
};

export function kindForPath(p: string): IngestKind {
  const ext = path.extname(p).toLowerCase();
  return EXT_KIND[ext] ?? 'text';
}

export function docId(source: string): string {
  return 'doc_' + crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
}

/** Split text into overlapping chunks by approximate token budget (~4 chars/token). */
export function chunkText(id: string, text: string, opts: { maxTokens?: number; overlap?: number } = {}): IngestedChunk[] {
  const maxChars = (opts.maxTokens ?? 800) * 4;
  const overlapChars = (opts.overlap ?? 100) * 4;
  const clean = text.replace(/\r\n/g, '\n');
  if (clean.length <= maxChars) {
    return clean.trim() ? [{ id: `${id}#0`, index: 0, text: clean.trim() }] : [];
  }
  // Prefer splitting on paragraph boundaries, then hard-wrap oversized paragraphs.
  const paras = clean.split(/\n{2,}/);
  const chunks: IngestedChunk[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ id: `${id}#${chunks.length}`, index: chunks.length, text: t });
    buf = overlapChars > 0 ? buf.slice(-overlapChars) : '';
  };
  for (const para of paras) {
    if (para.length > maxChars) {
      if (buf.trim()) flush();
      for (let i = 0; i < para.length; i += maxChars - overlapChars) {
        buf = para.slice(i, i + maxChars);
        flush();
      }
      buf = '';
      continue;
    }
    if ((buf + '\n\n' + para).length > maxChars) flush();
    buf += (buf ? '\n\n' : '') + para;
  }
  if (buf.trim()) chunks.push({ id: `${id}#${chunks.length}`, index: chunks.length, text: buf.trim() });
  return chunks;
}

export interface IngestOptions {
  /** OCR language for images (tesseract). Default 'eng'. */
  ocrLang?: string;
  /** Whisper model for media transcription. Default 'Xenova/whisper-tiny'. */
  whisperModel?: string;
  maxTokens?: number;
  overlap?: number;
}

async function extractText(source: string, kind: IngestKind, buf: Buffer, opts: IngestOptions): Promise<{ text: string; title?: string; metadata: Record<string, unknown>; warnings?: string[] }> {
  switch (kind) {
    case 'pdf': {
      const { extractPdf } = await import('./pdf.js');
      return extractPdf(buf);
    }
    case 'docx': {
      const { extractDocx } = await import('./docx.js');
      return extractDocx(buf);
    }
    case 'xlsx': {
      const { extractXlsx } = await import('./xlsx.js');
      return extractXlsx(buf);
    }
    case 'html': {
      const { extractHtml } = await import('./html.js');
      return extractHtml(buf.toString('utf8'));
    }
    case 'image': {
      const { extractImage } = await import('./image.js');
      return extractImage(buf, opts.ocrLang ?? 'eng');
    }
    case 'audio':
    case 'video': {
      const { extractMedia } = await import('./media.js');
      return extractMedia(source, kind, opts.whisperModel);
    }
    case 'markdown':
    case 'text':
    default:
      return { text: buf.toString('utf8'), metadata: {} };
  }
}

/** Ingest a single local file into a normalized document. */
export async function ingestPath(source: string, opts: IngestOptions = {}): Promise<IngestedDoc> {
  const kind = kindForPath(source);
  const buf = fs.readFileSync(source);
  const { text, title, metadata, warnings } = await extractText(source, kind, buf, opts);
  const id = docId(source);
  return {
    id,
    source,
    kind,
    title: title ?? path.basename(source),
    text,
    chunks: chunkText(id, text, opts),
    metadata: { bytes: buf.length, ...metadata },
    warnings,
  };
}

/** Ingest a URL — YouTube links go through caption/transcript extraction. */
export async function ingestUrl(url: string, opts: IngestOptions = {}): Promise<IngestedDoc> {
  const id = docId(url);
  const isYoutube = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/i.test(url);
  if (isYoutube) {
    const { extractYoutube } = await import('./youtube.js');
    const { text, title, metadata, warnings } = await extractYoutube(url, opts.whisperModel);
    return { id, source: url, kind: 'youtube', title, text, chunks: chunkText(id, text, opts), metadata, warnings };
  }
  const { extractWebPage } = await import('./url.js');
  const { text, title, metadata, warnings } = await extractWebPage(url);
  return { id, source: url, kind: 'url', title, text, chunks: chunkText(id, text, opts), metadata, warnings };
}

/** True if a path/url is something the ingestion layer can handle beyond plain code. */
export function isIngestable(source: string): boolean {
  if (/^https?:\/\//i.test(source)) return true;
  const ext = path.extname(source).toLowerCase();
  return ext in EXT_KIND;
}
