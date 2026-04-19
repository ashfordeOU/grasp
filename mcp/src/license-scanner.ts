import * as fs from 'fs';
import * as path from 'path';

export interface LicenseDep {
  name: string;
  version: string;
  license: string;
  licenseCategory: 'permissive' | 'copyleft' | 'unknown';
}

export interface LicenseViolation {
  name: string;
  license: string;
  licenseCategory: string;
}

export interface LicenseScanResult {
  dependencies: LicenseDep[];
  summary: { total: number; permissive: number; copyleft: number; unknown: number };
  violations: LicenseViolation[];
}

const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'Unlicense', '0BSD', 'BlueOak-1.0.0']);
const COPYLEFT = new Set(['GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-2.0', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'MPL-2.0', 'EUPL-1.2']);

function categorize(license: string): 'permissive' | 'copyleft' | 'unknown' {
  if (!license) return 'unknown';
  const norm = license.trim().toUpperCase();
  for (const p of PERMISSIVE) if (norm === p.toUpperCase()) return 'permissive';
  for (const c of COPYLEFT) if (norm === c.toUpperCase()) return 'copyleft';
  if (norm.includes('MIT') || norm.includes('BSD') || norm.includes('APACHE') || norm.includes('ISC')) return 'permissive';
  if (norm.includes('GPL') || norm.includes('AGPL')) return 'copyleft';
  return 'unknown';
}

async function readPackageJson(pkgJsonPath: string, deps: LicenseDep[]): Promise<void> {
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(raw);
    const licenseRaw = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? pkg.licenses?.[0]?.type ?? '');
    deps.push({ name: pkg.name || path.basename(path.dirname(pkgJsonPath)), version: pkg.version || 'unknown', license: licenseRaw || 'UNLICENSED', licenseCategory: categorize(licenseRaw) });
  } catch { /* skip */ }
}

async function scanNpmModules(projectRoot: string): Promise<LicenseDep[]> {
  const nodeModulesPath = path.join(projectRoot, 'node_modules');
  const deps: LicenseDep[] = [];
  if (!fs.existsSync(nodeModulesPath)) return deps;
  let entries: string[];
  try { entries = fs.readdirSync(nodeModulesPath); } catch { return deps; }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      try {
        const scoped = fs.readdirSync(path.join(nodeModulesPath, entry));
        for (const sub of scoped) await readPackageJson(path.join(nodeModulesPath, entry, sub, 'package.json'), deps);
      } catch { /* skip */ }
    } else {
      await readPackageJson(path.join(nodeModulesPath, entry, 'package.json'), deps);
    }
  }
  return deps;
}

export async function scanLicenses(projectRoot: string, allowedLicenses?: string[], flagCopyleft = true): Promise<LicenseScanResult> {
  const deps = await scanNpmModules(projectRoot);
  const summary = { total: deps.length, permissive: deps.filter(d => d.licenseCategory === 'permissive').length, copyleft: deps.filter(d => d.licenseCategory === 'copyleft').length, unknown: deps.filter(d => d.licenseCategory === 'unknown').length };
  const violations: LicenseViolation[] = [];
  for (const dep of deps) {
    if (flagCopyleft && dep.licenseCategory === 'copyleft') violations.push({ name: dep.name, license: dep.license, licenseCategory: dep.licenseCategory });
    else if (allowedLicenses && allowedLicenses.length > 0 && !allowedLicenses.includes(dep.license)) violations.push({ name: dep.name, license: dep.license, licenseCategory: dep.licenseCategory });
  }
  return { dependencies: deps, summary, violations };
}
