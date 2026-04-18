import {
  extractPackageName,
  extractImportedPackages,
  detectDeadPackages,
  findDeadPackages,
} from '../src/dead-packages';
import type { FileEntry } from '../src/types';

// ── extractPackageName ────────────────────────────────────────────────────────

describe('extractPackageName', () => {
  test('returns the package name for a plain import', () => {
    expect(extractPackageName('lodash')).toBe('lodash');
    expect(extractPackageName('express')).toBe('express');
  });

  test('handles sub-path imports — returns only package name', () => {
    expect(extractPackageName('lodash/cloneDeep')).toBe('lodash');
    expect(extractPackageName('react-dom/client')).toBe('react-dom');
  });

  test('handles scoped packages', () => {
    expect(extractPackageName('@modelcontextprotocol/sdk')).toBe('@modelcontextprotocol/sdk');
    expect(extractPackageName('@types/node')).toBe('@types/node');
    expect(extractPackageName('@scope/pkg/sub')).toBe('@scope/pkg');
  });

  test('returns null for relative imports', () => {
    expect(extractPackageName('./utils')).toBeNull();
    expect(extractPackageName('../services/auth')).toBeNull();
    expect(extractPackageName('../../lib')).toBeNull();
  });

  test('returns null for absolute paths', () => {
    expect(extractPackageName('/usr/local/lib')).toBeNull();
  });

  test('returns null for Node.js builtins', () => {
    expect(extractPackageName('fs')).toBeNull();
    expect(extractPackageName('path')).toBeNull();
    expect(extractPackageName('crypto')).toBeNull();
    expect(extractPackageName('child_process')).toBeNull();
    expect(extractPackageName('node:fs')).toBeNull();
    expect(extractPackageName('node:path')).toBeNull();
  });

  test('returns null for builtin sub-paths', () => {
    expect(extractPackageName('fs/promises')).toBeNull();
    expect(extractPackageName('path/posix')).toBeNull();
  });
});

// ── extractImportedPackages ───────────────────────────────────────────────────

describe('extractImportedPackages', () => {
  test('extracts ES module imports', () => {
    const src = `
      import lodash from 'lodash';
      import { map } from 'lodash/fp';
      import type { Foo } from 'some-type-pkg';
    `;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.has('lodash')).toBe(true);
    expect(pkgs.has('some-type-pkg')).toBe(true);
  });

  test('extracts CommonJS require', () => {
    const src = `
      const express = require('express');
      const path = require('path'); // builtin — should be ignored
    `;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.has('express')).toBe(true);
    expect(pkgs.has('path')).toBe(false);
  });

  test('extracts dynamic imports', () => {
    const src = `const mod = await import('some-module');`;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.has('some-module')).toBe(true);
  });

  test('ignores relative imports', () => {
    const src = `import { helper } from './utils';`;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.size).toBe(0);
  });

  test('ignores side-effect imports of relative paths', () => {
    const src = `import './polyfills';`;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.size).toBe(0);
  });

  test('handles scoped packages', () => {
    const src = `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';`;
    const pkgs = extractImportedPackages(src);
    expect(pkgs.has('@modelcontextprotocol/sdk')).toBe(true);
  });
});

// ── detectDeadPackages ────────────────────────────────────────────────────────

describe('detectDeadPackages', () => {
  const pkgJson = {
    path: 'package.json',
    content: JSON.stringify({
      dependencies: {
        lodash: '^4.0.0',
        express: '^4.18.0',
        'unused-pkg': '^1.0.0',
      },
      devDependencies: {
        jest: '^29.0.0',
        'unused-dev-pkg': '^2.0.0',
        '@types/express': '^4.0.0',
      },
    }),
  };

  test('detects packages that are never imported', () => {
    const dead = detectDeadPackages([pkgJson], [
      `import _ from 'lodash';`,
      `import express from 'express';`,
    ]);
    const names = dead.map(p => p.name);
    expect(names).toContain('unused-pkg');
    expect(names).toContain('unused-dev-pkg');
    expect(names).not.toContain('lodash');
    expect(names).not.toContain('express');
  });

  test('returns correct type field', () => {
    const dead = detectDeadPackages([pkgJson], []);
    const unusedPkg = dead.find(p => p.name === 'unused-pkg');
    const unusedDev = dead.find(p => p.name === 'unused-dev-pkg');
    expect(unusedPkg?.type).toBe('dependency');
    expect(unusedDev?.type).toBe('devDependency');
  });

  test('returns version string', () => {
    const dead = detectDeadPackages([pkgJson], []);
    const p = dead.find(d => d.name === 'unused-pkg');
    expect(p?.version).toBe('^1.0.0');
  });

  test('returns packageJsonPath', () => {
    const dead = detectDeadPackages([pkgJson], []);
    expect(dead.every(p => p.packageJsonPath === 'package.json')).toBe(true);
  });

  test('skips jest and other build tools', () => {
    const dead = detectDeadPackages([pkgJson], []);
    expect(dead.map(p => p.name)).not.toContain('jest');
  });

  test('skips @types/* when the base package is imported', () => {
    // @types/express is only dead if express itself isn't imported
    const deadWithExpress = detectDeadPackages([pkgJson], [`import express from 'express';`]);
    expect(deadWithExpress.map(p => p.name)).not.toContain('@types/express');

    const deadWithoutExpress = detectDeadPackages([pkgJson], []);
    // @types/express should appear as dead when express is not imported
    expect(deadWithoutExpress.map(p => p.name)).toContain('@types/express');
  });

  test('returns empty array when all packages are used', () => {
    const dead = detectDeadPackages([pkgJson], [
      `import _ from 'lodash';`,
      `import express from 'express';`,
      `import unused from 'unused-pkg';`,
      `import unusedDev from 'unused-dev-pkg';`,
      `import type {} from '@types/express';`,
    ]);
    // Only build-tool packages like jest remain (they're in ALWAYS_USED)
    const realDead = dead.filter(p => p.name !== 'jest');
    expect(realDead).toHaveLength(0);
  });

  test('handles malformed package.json gracefully', () => {
    const bad = { path: 'package.json', content: '{ this is not json }' };
    expect(() => detectDeadPackages([bad], ['import foo from "bar";'])).not.toThrow();
    expect(detectDeadPackages([bad], [])).toEqual([]);
  });

  test('handles package.json with no dependencies', () => {
    const minimal = { path: 'package.json', content: JSON.stringify({ name: 'test' }) };
    expect(detectDeadPackages([minimal], [])).toHaveLength(0);
  });

  test('returns empty when no package.json files given', () => {
    expect(detectDeadPackages([], ['import foo from "bar";'])).toHaveLength(0);
  });
});

// ── findDeadPackages ──────────────────────────────────────────────────────────

describe('findDeadPackages', () => {
  const makeEntry = (path: string, name: string): FileEntry => ({
    path, name, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  });

  test('returns empty array when no package.json in file entries', async () => {
    const entries = [makeEntry('src/index.ts', 'index.ts')];
    const contents = new Map([['src/index.ts', "import 'express';"]]);
    const result = await findDeadPackages(entries, contents, async () => null);
    expect(result).toHaveLength(0);
  });

  test('fetches package.json content when not in codeContents', async () => {
    const entries = [
      makeEntry('src/index.ts', 'index.ts'),
      makeEntry('package.json', 'package.json'),
    ];
    const contents = new Map([['src/index.ts', "import 'used-pkg';"]]);
    const pkgContent = JSON.stringify({
      dependencies: { 'used-pkg': '^1.0.0', 'dead-pkg': '^1.0.0' },
    });

    const result = await findDeadPackages(entries, contents, async (path) => {
      if (path === 'package.json') return pkgContent;
      return null;
    });

    expect(result.map(p => p.name)).toContain('dead-pkg');
    expect(result.map(p => p.name)).not.toContain('used-pkg');
  });

  test('skips package.json files inside node_modules', async () => {
    const entries = [
      makeEntry('node_modules/some-pkg/package.json', 'package.json'),
      makeEntry('package.json', 'package.json'),
    ];
    const contents = new Map<string, string>();
    const pkgContent = JSON.stringify({ dependencies: { 'dead-pkg': '^1.0.0' } });

    const fetchCounts: Record<string, number> = {};
    const result = await findDeadPackages(entries, contents, async (path) => {
      fetchCounts[path] = (fetchCounts[path] ?? 0) + 1;
      return pkgContent;
    });

    // node_modules/some-pkg/package.json should NOT be fetched
    expect(fetchCounts['node_modules/some-pkg/package.json']).toBeUndefined();
    expect(fetchCounts['package.json']).toBe(1);
    expect(result.map(p => p.name)).toContain('dead-pkg');
  });

  test('uses cached content from codeContents map when available', async () => {
    const entries = [
      makeEntry('src/index.ts', 'index.ts'),
      makeEntry('package.json', 'package.json'),
    ];
    const pkgContent = JSON.stringify({ dependencies: { 'dead-pkg': '^1.0.0' } });
    const contents = new Map([
      ['src/index.ts', "// no imports"],
      ['package.json', pkgContent],
    ]);

    let fetchCalled = false;
    const result = await findDeadPackages(entries, contents, async () => {
      fetchCalled = true;
      return null;
    });

    expect(fetchCalled).toBe(false); // should use cached content
    expect(result.map(p => p.name)).toContain('dead-pkg');
  });
});
