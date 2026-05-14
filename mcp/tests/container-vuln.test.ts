import { Parser } from '../src/parser';

// ── parseContainerDeps ──────────────────────────────────────────────────────

describe('Parser.parseContainerDeps', () => {
  it('returns empty array for empty input', () => {
    expect(Parser.parseContainerDeps([])).toEqual([]);
    expect(Parser.parseContainerDeps(null as any)).toEqual([]);
  });

  it('parses FROM lines in Dockerfile', () => {
    const files = [{
      name: 'Dockerfile', path: 'Dockerfile',
      content: 'FROM nginx:1.25.3\nRUN apt-get install -y curl\nFROM node:18-alpine AS builder\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ image: 'nginx', tag: '1.25.3', source: 'dockerfile' });
    expect(out[1]).toMatchObject({ image: 'node', tag: '18-alpine', source: 'dockerfile' });
  });

  it('strips AS alias from multi-stage FROM', () => {
    const files = [{
      name: 'Dockerfile', path: 'backend/Dockerfile',
      content: 'FROM python:3.11-slim AS base\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out[0]).toMatchObject({ image: 'python', tag: '3.11-slim' });
  });

  it('strips digest from FROM image@sha256:', () => {
    const files = [{
      name: 'Dockerfile', path: 'Dockerfile',
      content: 'FROM nginx:1.25.3@sha256:abc123def456\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out[0]).toMatchObject({ image: 'nginx', tag: '1.25.3' });
  });

  it('skips FROM scratch and comments', () => {
    const files = [{
      name: 'Dockerfile', path: 'Dockerfile',
      content: '# base image\nFROM scratch\nFROM alpine:3.18\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ image: 'alpine', tag: '3.18' });
  });

  it('defaults tag to latest when no tag specified', () => {
    const files = [{
      name: 'Dockerfile', path: 'Dockerfile',
      content: 'FROM ubuntu\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out[0]).toMatchObject({ image: 'ubuntu', tag: 'latest' });
  });

  it('parses image: fields from docker-compose.yml', () => {
    const files = [{
      name: 'docker-compose.yml', path: 'docker-compose.yml',
      content: `version: '3'
services:
  web:
    image: nginx:1.25.3
  db:
    image: "postgres:15.2"
  cache:
    image: 'redis:7-alpine'
`,
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(3);
    expect(out.find((d: any) => d.image === 'nginx')).toMatchObject({ tag: '1.25.3', source: 'compose' });
    expect(out.find((d: any) => d.image === 'postgres')).toMatchObject({ tag: '15.2', source: 'compose' });
    expect(out.find((d: any) => d.image === 'redis')).toMatchObject({ tag: '7-alpine', source: 'compose' });
  });

  it('parses image: fields from CI YAML workflow', () => {
    const files = [{
      name: 'ci.yml', path: '.github/workflows/ci.yml',
      content: `jobs:
  test:
    container:
      image: node:18-alpine
`,
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ image: 'node', tag: '18-alpine', source: 'ci' });
  });

  it('skips ${{ expression }} image refs in CI YAML', () => {
    const files = [{
      name: 'ci.yml', path: '.github/workflows/ci.yml',
      content: `jobs:
  test:
    container:
      image: \${{ matrix.image }}
`,
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out).toEqual([]);
  });

  it('deduplicates the same image:tag across files', () => {
    const files = [
      { name: 'Dockerfile', path: 'Dockerfile', content: 'FROM nginx:1.25.3\n' },
      { name: 'docker-compose.yml', path: 'docker-compose.yml', content: 'services:\n  web:\n    image: nginx:1.25.3\n' },
    ];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(1);
  });

  it('handles Dockerfile.prod naming', () => {
    const files = [{
      name: 'Dockerfile.prod', path: 'docker/Dockerfile.prod',
      content: 'FROM alpine:3.19\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ image: 'alpine', tag: '3.19', source: 'dockerfile' });
  });

  it('handles registry-prefixed images', () => {
    const files = [{
      name: 'Dockerfile', path: 'Dockerfile',
      content: 'FROM ghcr.io/myorg/myapp:v2.1.0\n',
    }];
    const out = Parser.parseContainerDeps(files);
    expect(out[0]).toMatchObject({ image: 'ghcr.io/myorg/myapp', tag: 'v2.1.0' });
  });
});

// ── checkSupplyChainIntegrity ───────────────────────────────────────────────

describe('Parser.checkSupplyChainIntegrity', () => {
  it('returns empty result for no files', () => {
    const out = Parser.checkSupplyChainIntegrity([]);
    expect(out).toEqual({ passed: [], failed: [], warnings: [] });
  });

  it('passes when npm lockfile has full integrity hashes', () => {
    const lock = {
      packages: {
        '': { name: 'myapp' },
        'node_modules/lodash': { version: '4.17.21', integrity: 'sha512-abc123' },
        'node_modules/express': { version: '4.18.2', integrity: 'sha512-def456' },
      },
    };
    const files = [{ name: 'package-lock.json', path: 'package-lock.json', content: JSON.stringify(lock) }];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.failed).toHaveLength(0);
    expect(out.passed.find((c: any) => c.check === 'npm-integrity')).toBeTruthy();
  });

  it('fails when npm lockfile has zero integrity hashes', () => {
    const lock = {
      packages: {
        '': { name: 'myapp' },
        'node_modules/lodash': { version: '4.17.21' },
        'node_modules/express': { version: '4.18.2' },
      },
    };
    const files = [{ name: 'package-lock.json', path: 'package-lock.json', content: JSON.stringify(lock) }];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.failed.find((c: any) => c.check === 'npm-integrity')).toBeTruthy();
  });

  it('warns when npm lockfile has partial integrity hashes', () => {
    const lock = {
      packages: {
        '': { name: 'myapp' },
        'node_modules/a': { version: '1.0.0', integrity: 'sha512-aaa' },
        'node_modules/b': { version: '2.0.0' },
        'node_modules/c': { version: '3.0.0' },
      },
    };
    const files = [{ name: 'package-lock.json', path: 'package-lock.json', content: JSON.stringify(lock) }];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.warnings.find((c: any) => c.check === 'npm-integrity')).toBeTruthy();
  });

  it('passes go-sum check when go.sum present', () => {
    const files = [
      { name: 'go.mod', path: 'go.mod', content: 'module example.com/app\ngo 1.21\n' },
      { name: 'go.sum', path: 'go.sum', content: 'github.com/foo/bar v1.0.0 h1:abc\n' },
    ];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.passed.find((c: any) => c.check === 'go-sum')).toBeTruthy();
    expect(out.failed).toHaveLength(0);
  });

  it('fails go-sum check when go.sum missing', () => {
    const files = [
      { name: 'go.mod', path: 'go.mod', content: 'module example.com/app\n' },
    ];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.failed.find((c: any) => c.check === 'go-sum')).toBeTruthy();
  });

  it('passes cargo-lock check when Cargo.lock present', () => {
    const files = [
      { name: 'Cargo.toml', path: 'Cargo.toml', content: '[package]\nname = "myapp"\n' },
      { name: 'Cargo.lock', path: 'Cargo.lock', content: '[[package]]\nname = "serde"\nversion = "1.0.150"\n' },
    ];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.passed.find((c: any) => c.check === 'cargo-lock')).toBeTruthy();
  });

  it('fails cargo-lock check when Cargo.lock missing', () => {
    const files = [
      { name: 'Cargo.toml', path: 'Cargo.toml', content: '[package]\nname = "myapp"\n' },
    ];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.failed.find((c: any) => c.check === 'cargo-lock')).toBeTruthy();
  });

  it('passes pip-hash check when requirements.txt has --hash= lines', () => {
    const files = [{
      name: 'requirements.txt', path: 'requirements.txt',
      content: 'django==4.2.0 \\\n    --hash=sha256:abc123\nrequests==2.28.0 \\\n    --hash=sha256:def456\n',
    }];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.passed.find((c: any) => c.check === 'pip-hash')).toBeTruthy();
  });

  it('warns pip-hash when requirements.txt has no hashes', () => {
    const files = [{
      name: 'requirements.txt', path: 'requirements.txt',
      content: 'django==4.2.0\nrequests==2.28.0\n',
    }];
    const out = Parser.checkSupplyChainIntegrity(files);
    expect(out.warnings.find((c: any) => c.check === 'pip-hash')).toBeTruthy();
  });
});

// ── queryNVD (mocked fetch) ─────────────────────────────────────────────────

describe('Parser.queryNVD', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('returns empty array when no queryable deps (all latest)', async () => {
    const out = await Parser.queryNVD([{ image: 'nginx', tag: 'latest', fromFile: 'Dockerfile', source: 'dockerfile' }]);
    expect(out).toEqual([]);
  });

  it('returns empty array for empty input', async () => {
    expect(await Parser.queryNVD([])).toEqual([]);
  });

  it('returns hits when NVD finds CVEs for pinned image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2026-42945',
              descriptions: [{ lang: 'en', value: 'Nginx RCE via crafted HTTP/2 frame' }],
              metrics: {
                cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL' } }],
              },
            },
          },
        ],
      }),
    } as any);
    const out = await Parser.queryNVD([{ image: 'nginx', tag: '1.25.3', fromFile: 'Dockerfile', source: 'dockerfile' }]);
    expect(out).toHaveLength(1);
    expect(out[0].image).toBe('nginx');
    expect(out[0].vulns[0].id).toBe('CVE-2026-42945');
    expect(out[0].vulns[0].severity).toBe('critical');
  });

  it('skips year-only tags (e.g. docker date tags)', async () => {
    const out = await Parser.queryNVD([{ image: 'ubuntu', tag: '2024', fromFile: 'Dockerfile', source: 'dockerfile' }]);
    expect(out).toEqual([]);
  });

  it('degrades gracefully on fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const out = await Parser.queryNVD([{ image: 'nginx', tag: '1.25.3', fromFile: 'Dockerfile', source: 'dockerfile' }]);
    expect(out).toEqual([]);
  });
});

// ── querySocketDev (mocked fetch) ───────────────────────────────────────────

describe('Parser.querySocketDev', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('returns empty array for non-npm packages', async () => {
    const out = await Parser.querySocketDev([
      { ecosystem: 'PyPI', name: 'django', version: '4.2.0', fromFile: 'requirements.txt' },
    ]);
    expect(out).toEqual([]);
  });

  it('returns empty array for empty input', async () => {
    expect(await Parser.querySocketDev([])).toEqual([]);
  });

  it('flags npm package with low malware score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: { overall: 0.1, malware: 0.05, supplyChain: 0.3 },
        alerts: [{ type: 'malware', severity: 'critical', description: 'Malicious code detected' }],
      }),
    } as any);
    const out = await Parser.querySocketDev([
      { ecosystem: 'npm', name: 'evil-package', version: '1.0.0', fromFile: 'package.json' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('evil-package');
    expect(out[0].risks.some((r: any) => r.type === 'malware')).toBe(true);
  });

  it('does not flag clean package with high scores', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: { overall: 0.95, malware: 0.99, supplyChain: 0.92 },
        alerts: [],
      }),
    } as any);
    const out = await Parser.querySocketDev([
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21', fromFile: 'package.json' },
    ]);
    expect(out).toHaveLength(0);
  });

  it('degrades gracefully on fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const out = await Parser.querySocketDev([
      { ecosystem: 'npm', name: 'pkg', version: '1.0.0', fromFile: 'package.json' },
    ]);
    expect(out).toEqual([]);
  });

  it('deduplicates same name@version across multiple manifests', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ score: { overall: 0.9, malware: 0.95, supplyChain: 0.9 }, alerts: [] }) } as any);
    const pkgs = [
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21', fromFile: 'frontend/package.json' },
      { ecosystem: 'npm', name: 'lodash', version: '4.17.21', fromFile: 'backend/package.json' },
    ];
    await Parser.querySocketDev(pkgs);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
  });
});

// ── detectVulnerabilities (combined, mocked network) ───────────────────────

describe('Parser.detectVulnerabilities — combined scan', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('returns all result sections', async () => {
    // Mock all network calls to return empty/clean
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], vulnerabilities: [], score: { overall: 0.9, malware: 0.99, supplyChain: 0.9 }, alerts: [] }) } as any);

    const files = [
      { name: 'package.json', path: 'package.json', content: JSON.stringify({ dependencies: { 'lodash': '4.17.21' } }) },
      { name: 'package-lock.json', path: 'package-lock.json', content: JSON.stringify({ packages: { '': {}, 'node_modules/lodash': { version: '4.17.21', integrity: 'sha512-abc' } } }) },
      { name: 'Dockerfile', path: 'Dockerfile', content: 'FROM nginx:1.25.3\n' },
    ];
    const out = await Parser.detectVulnerabilities(files, {});
    expect(out).toHaveProperty('packages');
    expect(out).toHaveProperty('vulnerablePackages');
    expect(out).toHaveProperty('totalVulns');
    expect(out).toHaveProperty('severityCounts');
    expect(out).toHaveProperty('containerDeps');
    expect(out).toHaveProperty('containerVulns');
    expect(out).toHaveProperty('integrity');
    expect(out).toHaveProperty('socketRisks');
    expect(out.containerDeps).toHaveLength(1);
    expect(out.containerDeps[0]).toMatchObject({ image: 'nginx', tag: '1.25.3' });
    expect(out.integrity!.passed.find((c: any) => c.check === 'npm-integrity')).toBeTruthy();
  });

  it('respects skipContainer option', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) } as any);
    const files = [
      { name: 'Dockerfile', path: 'Dockerfile', content: 'FROM nginx:1.25.3\n' },
    ];
    const out = await Parser.detectVulnerabilities(files, { skipContainer: true });
    expect(out.containerDeps).toHaveLength(0);
    expect(out.containerVulns).toHaveLength(0);
  });

  it('respects skipIntegrity option', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) } as any);
    const files = [
      { name: 'package.json', path: 'package.json', content: JSON.stringify({ dependencies: {} }) },
    ];
    const out = await Parser.detectVulnerabilities(files, { skipIntegrity: true });
    expect(out.integrity).toBeNull();
  });

  it('respects skipSocket option', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) } as any);
    const files = [
      { name: 'package.json', path: 'package.json', content: JSON.stringify({ dependencies: { lodash: '4.17.21' } }) },
    ];
    const out = await Parser.detectVulnerabilities(files, { skipSocket: true });
    expect(out.socketRisks).toHaveLength(0);
  });

  it('dogfoods cleanly on grasp repo package.json + Dockerfile', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], vulnerabilities: [], score: { overall: 0.9, malware: 0.99, supplyChain: 0.9 }, alerts: [] }) } as any);
    const graspFiles = [
      {
        name: 'package.json', path: 'mcp/package.json',
        content: JSON.stringify({ dependencies: { 'better-sqlite3': '^11.0.0', '@modelcontextprotocol/sdk': '^1.0.0', 'zod': '^3.22.0' } }),
      },
      {
        name: 'Dockerfile', path: 'docker/Dockerfile',
        content: 'FROM node:20-alpine\nRUN npm install -g grasp-mcp-server@3.20.0\n',
      },
    ];
    const out = await Parser.detectVulnerabilities(graspFiles, {});
    // Should not throw, should return well-formed result
    expect(typeof out.totalVulns).toBe('number');
    expect(Array.isArray(out.containerDeps)).toBe(true);
    expect(out.containerDeps[0]).toMatchObject({ image: 'node', tag: '20-alpine' });
    expect(out.integrity).toBeTruthy();
  });
});
