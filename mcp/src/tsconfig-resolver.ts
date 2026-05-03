// =====================================================================
// TS-config path-alias resolver
// Parses tsconfig.json files (with comments / trailing commas) and
// resolves import specifiers like '@/components/Button' against the
// `compilerOptions.paths` map to a repo-relative path.
// =====================================================================

import * as path from 'path';
import { stripJsonComments } from './tsconfig-comment-stripper.js';

export interface TsconfigEntry {
  baseUrl: string;
  paths: Record<string, string[]>;
  configDir: string;
}

function applyTsPath(
  spec: string,
  pattern: string,
  targets: string[],
  baseUrl: string,
): string | null {
  const starIdx = pattern.indexOf('*');
  if (starIdx === -1) {
    if (pattern !== spec) return null;
    const target = targets[0];
    if (!target) return null;
    return path.normalize(path.join(baseUrl, target)).split(path.sep).join('/');
  }
  const prefix = pattern.slice(0, starIdx);
  const suffix = pattern.slice(starIdx + 1);
  if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) return null;
  const middle = spec.slice(prefix.length, spec.length - suffix.length);
  const target = targets[0];
  if (!target) return null;
  return path.normalize(path.join(baseUrl, target.replace('*', middle))).split(path.sep).join('/');
}

/**
 * Parse a tsconfig.json file content. Returns null when there is no
 * `compilerOptions` block (i.e. nothing useful for path resolution).
 *
 * `extends` chains are not followed in this v1 — we just ignore the
 * field, keeping the implementation dependency-free.
 */
export function parseTsconfig(
  tsconfigContent: string,
  tsconfigDir: string,
): { baseUrl: string; paths: Record<string, string[]> } | null {
  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonComments(tsconfigContent));
  } catch {
    return null;
  }
  const co = parsed?.compilerOptions;
  if (!co || typeof co !== 'object') return null;
  const baseUrlRaw: string = typeof co.baseUrl === 'string' ? co.baseUrl : './';
  // Resolve baseUrl relative to the directory containing the tsconfig.
  const baseUrl = path.normalize(path.isAbsolute(baseUrlRaw) ? baseUrlRaw : path.join(tsconfigDir, baseUrlRaw));
  const rawPaths = (co.paths && typeof co.paths === 'object') ? co.paths : {};
  const paths: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rawPaths)) {
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      paths[k] = v as string[];
    }
  }
  return { baseUrl, paths };
}

/**
 * Resolve an import spec against an ordered list of tsconfig entries
 * (most-specific configDir first). Returns the resolved path relative
 * to the repo root (forward-slash separators), or null when no pattern
 * matches in any tsconfig.
 *
 * Pattern semantics match TypeScript: `@/*` matches anything starting
 * with `@/`; the `*` capture is substituted into the replacement.
 * Patterns without `*` must match the spec exactly.
 */
export function resolveTsImport(
  spec: string,
  tsconfigs: TsconfigEntry[],
): string | null {
  for (const cfg of tsconfigs) {
    for (const [pattern, targets] of Object.entries(cfg.paths)) {
      const resolved = applyTsPath(spec, pattern, targets, cfg.baseUrl);
      if (resolved !== null) return resolved;
    }
  }
  return null;
}
