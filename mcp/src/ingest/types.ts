/**
 * Shared types for multimodal ingestion.
 *
 * Ingestion turns ANY artifact — code, docs, PDFs, spreadsheets, images,
 * audio/video, web pages — into a normalized `IngestedDoc` of plain text plus
 * provenance. Downstream, the semantic layer extracts a knowledge graph from
 * these docs; code continues to flow through the deterministic AST parser.
 */

export type IngestKind =
  | 'text'
  | 'markdown'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'html'
  | 'image'
  | 'audio'
  | 'video'
  | 'youtube'
  | 'url'
  | 'code';

export interface IngestedChunk {
  /** Stable id: `${docId}#${index}`. */
  id: string;
  index: number;
  text: string;
  /** Optional locator within the source (page, sheet, timestamp range, heading). */
  locator?: string;
}

export interface IngestedDoc {
  /** Stable id derived from the source path/url. */
  id: string;
  source: string;
  kind: IngestKind;
  title?: string;
  text: string;
  chunks: IngestedChunk[];
  /** Free-form provenance (page count, duration, sheet names, model used…). */
  metadata: Record<string, unknown>;
  /** Non-fatal notes (e.g. "OCR confidence low", "captions auto-generated"). */
  warnings?: string[];
}

/** Raised when an optional extractor dependency is not installed. */
export class OptionalDependencyError extends Error {
  constructor(
    readonly dependency: string,
    readonly forKind: string,
    readonly installHint: string,
  ) {
    super(`Ingesting ${forKind} needs the optional dependency "${dependency}". Install it with: ${installHint}`);
    this.name = 'OptionalDependencyError';
  }
}

/** Raised when an external tool (ffmpeg, yt-dlp) is required but not on PATH. */
export class ExternalToolError extends Error {
  constructor(
    readonly tool: string,
    readonly forKind: string,
    readonly installHint: string,
  ) {
    super(`Ingesting ${forKind} needs the external tool "${tool}". Install it: ${installHint}`);
    this.name = 'ExternalToolError';
  }
}
