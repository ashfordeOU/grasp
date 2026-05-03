// =====================================================================
// Python import resolver — Jedi-style relative + package resolution.
// Handles:
//   from .utils import foo        -> ./utils.py | ./utils/__init__.py
//   from ..core import bar        -> ../core.py | ../core/__init__.py
//   from package import module    -> <root>/package/module.py
//                                    or <root>/package/__init__.py
//                                    or <root>/package.py
// where <root> is the nearest ancestor of currentFile that contains an
// `__init__.py` (or, lacking that, the directory of currentFile itself).
// =====================================================================

function dirname(p: string): string {
  const ix = p.lastIndexOf('/');
  return ix < 0 ? '' : p.slice(0, ix);
}

function joinPosix(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
}

function normalize(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0 || out[out.length - 1] === '..') out.push('..');
      else out.pop();
      continue;
    }
    out.push(part);
  }
  // Preserve leading slash if any.
  return (p.startsWith('/') ? '/' : '') + out.join('/');
}

/**
 * Resolve a Python import to a file path that exists in `allFiles`,
 * or return null if no match. `currentFile` and `allFiles` are repo-
 * relative POSIX-style paths.
 */
export function resolvePythonImport(
  currentFile: string,
  importPath: string,
  allFiles: string[],
): string | null {
  if (!importPath) return null;
  const fileSet = new Set(allFiles);
  const curDir = dirname(currentFile);

  // ── Relative imports: leading dots count up-levels. ────────────────
  const dotMatch = importPath.match(/^(\.+)(.*)$/);
  if (dotMatch) {
    const dots = dotMatch[1].length;
    const rest = dotMatch[2];
    // 1 dot = current dir, 2 dots = parent, etc.
    const upParts = curDir.split('/').filter(Boolean);
    const upCount = dots - 1;
    if (upCount > upParts.length) return null;
    const baseParts = upCount === 0 ? upParts : upParts.slice(0, upParts.length - upCount);
    const base = baseParts.join('/');
    const restPath = rest.replace(/\./g, '/');
    return tryCandidates(base, restPath, fileSet);
  }

  // ── Absolute / package imports. ────────────────────────────────────
  // Walk up from currentFile's directory looking for the package root
  // (highest ancestor that still has an __init__.py — i.e. follow the
  // package chain up to the topmost dir that is a Python package).
  const segs = curDir.split('/').filter(Boolean);
  const candidates: string[] = [];
  // Always try the file's own directory first.
  candidates.push(curDir);
  for (let i = segs.length - 1; i >= 0; i--) {
    const dir = segs.slice(0, i).join('/');
    candidates.push(dir);
  }
  // Also try project root (empty string).
  if (!candidates.includes('')) candidates.push('');

  const restPath = importPath.replace(/\./g, '/');
  for (const root of candidates) {
    const hit = tryCandidates(root, restPath, fileSet);
    if (hit) return hit;
  }
  return null;
}

function tryCandidates(base: string, rest: string, fileSet: Set<string>): string | null {
  const root = base ? base : '';
  const tries: string[] = [];
  if (rest === '') {
    // `from . import x` style without rest — resolve to package __init__.
    tries.push(normalize(joinPosix(root, '__init__.py')));
  } else {
    // <root>/<rest>.py
    tries.push(normalize(joinPosix(root, rest + '.py')));
    // <root>/<rest>/__init__.py
    tries.push(normalize(joinPosix(root, rest + '/__init__.py')));
    // For dotted paths we already converted dots to slashes; also try
    // collapsing the last segment as the module file (covered above).
  }
  for (const t of tries) {
    if (fileSet.has(t)) return t;
  }
  return null;
}
