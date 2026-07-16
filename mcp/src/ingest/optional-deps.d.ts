/**
 * Ambient declarations for OPTIONAL ingestion dependencies.
 *
 * These packages are not part of Grasp's core install — they are lazy-loaded at
 * runtime by the extractors and marked `external` in build.mjs. Declaring them as
 * `any` here lets the codebase typecheck without forcing the deps to be present.
 */
declare module 'pdf-parse';
declare module 'mammoth';
declare module 'xlsx';
declare module 'tesseract.js';
declare module 'youtube-transcript';
