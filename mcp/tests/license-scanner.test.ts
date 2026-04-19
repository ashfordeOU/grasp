import { scanLicenses } from '../src/license-scanner';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = path.join(os.tmpdir(), 'grasp-lic-' + Date.now());
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function mkPkg(dir: string, name: string, license: string) {
  const pkgDir = path.join(dir, 'node_modules', name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version: '1.0.0', license }));
}

test('categorizes permissive licenses', async () => {
  mkPkg(tmpDir, 'lodash', 'MIT');
  mkPkg(tmpDir, 'express', 'MIT');
  const result = await scanLicenses(tmpDir);
  expect(result.summary.permissive).toBe(2);
  expect(result.summary.copyleft).toBe(0);
});

test('flags copyleft license', async () => {
  mkPkg(tmpDir, 'some-gpl-pkg', 'GPL-3.0');
  const result = await scanLicenses(tmpDir);
  expect(result.violations.length).toBeGreaterThan(0);
  expect(result.violations[0].license).toBe('GPL-3.0');
});

test('handles missing license field', async () => {
  const pkgDir = path.join(tmpDir, 'node_modules', 'nolicense');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'nolicense', version: '1.0.0' }));
  const result = await scanLicenses(tmpDir);
  const dep = result.dependencies.find(d => d.name === 'nolicense');
  expect(dep?.licenseCategory).toBe('unknown');
});
