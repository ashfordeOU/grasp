// =====================================================================
// TS-config path-alias resolver
// Parses tsconfig.json files (with comments / trailing commas) and
// resolves import specifiers like '@/components/Button' against the
// `compilerOptions.paths` map to a repo-relative path.
// =====================================================================

import * as path from 'path';

export interface TsconfigEntry {
  baseUrl: string;
  paths: Record<string, string[]>;
  configDir: string;
}

/**
 * Strip JSON5-ish comments (// line, /* block *​/) and trailing commas
 * from a tsconfig.json so JSON.parse can consume it. We avoid pulling
 * a dep just for this — the parser is intentionally simple but handles
 * the common tsconfig dialect.
 */
function stripJsonComments(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;
  let inString = false;
  let stringQuote = '';
  while (i < n) {
    const c = input[i];
    const next = i + 1 < n ? input[i + 1] : '';
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === stringQuote) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Strip trailing commas before } or ]
  return out.replace(/,(\s*[\]}])/g, '$1');
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
      const starIdx = pattern.indexOf('*');
      if (starIdx === -1) {
        if (pattern !== spec) continue;
        const target = targets[0];
        if (!target) continue;
        const abs = path.normalize(path.join(cfg.baseUrl, target));
        return abs.split(path.sep).join('/');
      }
      const prefix = pattern.slice(0, starIdx);
      const suffix = pattern.slice(starIdx + 1);
      if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
      const middle = spec.slice(prefix.length, spec.length - suffix.length);
      const target = targets[0];
      if (!target) continue;
      const replaced = target.replace('*', middle);
      const abs = path.normalize(path.join(cfg.baseUrl, replaced));
      return abs.split(path.sep).join('/');
    }
  }
  return null;
}
