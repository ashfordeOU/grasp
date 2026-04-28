import { Parser } from '../src/parser';

describe('Parser.parseManifests', () => {
  it('returns empty array for no files', () => {
    expect(Parser.parseManifests([])).toEqual([]);
    expect(Parser.parseManifests(null as any)).toEqual([]);
  });

  it('parses package.json dependencies + devDependencies', () => {
    const files = [{
      name: 'package.json',
      path: 'package.json',
      content: JSON.stringify({
        dependencies: { 'lodash': '^4.17.20', 'express': '~4.18.0' },
        devDependencies: { 'jest': '29.0.0' },
      }),
    }];
    const out = Parser.parseManifests(files);
    expect(out.length).toBe(3);
    expect(out.find((p: any) => p.name === 'lodash')).toMatchObject({ ecosystem: 'npm', version: '4.17.20' });
    expect(out.find((p: any) => p.name === 'jest')).toMatchObject({ ecosystem: 'npm', version: '29.0.0' });
  });

  it('skips package.json under /node_modules/', () => {
    const files = [{
      name: 'package.json',
      path: 'node_modules/foo/package.json',
      content: JSON.stringify({ dependencies: { 'bar': '1.0.0' } }),
    }];
    expect(Parser.parseManifests(files)).toEqual([]);
  });

  it('prefers package-lock.json resolved version over manifest range', () => {
    const files = [
      {
        name: 'package.json',
        path: 'package.json',
        content: JSON.stringify({ dependencies: { 'lodash': '^4.0.0' } }),
      },
      {
        name: 'package-lock.json',
        path: 'package-lock.json',
        content: JSON.stringify({
          packages: {
            '': { name: 'app' },
            'node_modules/lodash': { version: '4.17.21' },
          },
        }),
      },
    ];
    const out = Parser.parseManifests(files);
    const lodash = out.find((p: any) => p.name === 'lodash');
    expect(lodash).toMatchObject({ version: '4.17.21', source: 'lockfile' });
  });

  it('handles npm v6 lockfile format', () => {
    const files = [
      { name: 'package.json', path: 'package.json', content: JSON.stringify({ dependencies: { 'react': '^17.0.0' } }) },
      { name: 'package-lock.json', path: 'package-lock.json', content: JSON.stringify({ dependencies: { 'react': { version: '17.0.2' } } }) },
    ];
    const out = Parser.parseManifests(files);
    expect(out[0]).toMatchObject({ name: 'react', version: '17.0.2', source: 'lockfile' });
  });

  it('parses requirements.txt with == only (skip ranges)', () => {
    const files = [{
      name: 'requirements.txt',
      path: 'requirements.txt',
      content: `# comment
django==4.2.0
flask>=2.0
requests[security]==2.28.0
-e ./local
`,
    }];
    const out = Parser.parseManifests(files);
    expect(out.length).toBe(2);
    expect(out.find((p: any) => p.name === 'django')).toMatchObject({ ecosystem: 'PyPI', version: '4.2.0' });
    expect(out.find((p: any) => p.name === 'requests')).toMatchObject({ ecosystem: 'PyPI', version: '2.28.0' });
  });

  it('parses go.mod inside require block', () => {
    const files = [{
      name: 'go.mod',
      path: 'go.mod',
      content: `module example.com/app
go 1.21

require (
\tgithub.com/spf13/cobra v1.7.0
\tgolang.org/x/sys v0.10.0
)
`,
    }];
    const out = Parser.parseManifests(files);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ ecosystem: 'Go', name: 'github.com/spf13/cobra', version: 'v1.7.0' });
  });

  it('parses Cargo.toml dependencies', () => {
    const files = [{
      name: 'Cargo.toml',
      path: 'Cargo.toml',
      content: `[package]
name = "myapp"

[dependencies]
serde = "1.0.150"
tokio = { version = "1.25.0", features = ["full"] }
`,
    }];
    const out = Parser.parseManifests(files);
    const serde = out.find((p: any) => p.name === 'serde');
    expect(serde).toMatchObject({ ecosystem: 'crates.io', version: '1.0.150' });
  });

  it('parses pom.xml dependencies', () => {
    const files = [{
      name: 'pom.xml',
      path: 'pom.xml',
      content: `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.21</version>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>\${jackson.version}</version>
    </dependency>
  </dependencies>
</project>`,
    }];
    const out = Parser.parseManifests(files);
    expect(out.length).toBe(1); // ${jackson.version} skipped — unresolvable
    expect(out[0]).toMatchObject({ ecosystem: 'Maven', name: 'org.springframework:spring-core', version: '5.3.21' });
  });

  it('dedupes packages with same ecosystem+name+version', () => {
    const files = [
      { name: 'package.json', path: 'a/package.json', content: JSON.stringify({ dependencies: { 'lodash': '4.17.21' } }) },
      { name: 'package.json', path: 'b/package.json', content: JSON.stringify({ dependencies: { 'lodash': '4.17.21' } }) },
    ];
    expect(Parser.parseManifests(files).length).toBe(1);
  });

  it('handles parseManifests on the grasp repo without crashing', () => {
    const files = [{
      name: 'package.json',
      path: 'mcp/package.json',
      content: JSON.stringify({
        dependencies: { 'better-sqlite3': '^11.0.0', 'kuzu': '^0.10.0' },
      }),
    }];
    const out = Parser.parseManifests(files);
    expect(out.length).toBe(2);
  });
});

describe('Parser._osvSeverity', () => {
  it('maps CVSS 9+ to critical', () => {
    expect(Parser._osvSeverity({ severity: [{ type: 'CVSS_V3', score: '9.8' }] })).toBe('critical');
  });
  it('maps CVSS 7-8.9 to high', () => {
    expect(Parser._osvSeverity({ severity: [{ type: 'CVSS_V3', score: '7.5' }] })).toBe('high');
  });
  it('maps CVSS 4-6.9 to medium', () => {
    expect(Parser._osvSeverity({ severity: [{ type: 'CVSS_V3', score: '5.0' }] })).toBe('medium');
  });
  it('maps CVSS <4 to low', () => {
    expect(Parser._osvSeverity({ severity: [{ type: 'CVSS_V3', score: '2.5' }] })).toBe('low');
  });
  it('falls back to database_specific.severity (GitHub Advisory)', () => {
    expect(Parser._osvSeverity({ database_specific: { severity: 'HIGH' } })).toBe('high');
  });
  it('parses CVSS vector when score is non-numeric', () => {
    expect(Parser._osvSeverity({ severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }] })).toBe('critical');
  });
  it('defaults to medium when nothing parseable', () => {
    expect(Parser._osvSeverity({})).toBe('medium');
  });
});

describe('Parser._osvFixedVersion', () => {
  it('returns the first fixed event for matching package', () => {
    const vuln = {
      affected: [{
        package: { ecosystem: 'npm', name: 'lodash' },
        ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
      }],
    };
    expect(Parser._osvFixedVersion(vuln, 'npm', 'lodash')).toBe('4.17.21');
  });
  it('returns null when no matching package', () => {
    const vuln = {
      affected: [{ package: { ecosystem: 'npm', name: 'other' }, ranges: [{ events: [{ fixed: '1.0.0' }] }] }],
    };
    expect(Parser._osvFixedVersion(vuln, 'npm', 'lodash')).toBe(null);
  });
});

describe('Parser.detectVulnerabilities (live OSV.dev — slow, network)', () => {
  jest.setTimeout(30000);
  it('returns empty report for repo with no manifests', async () => {
    const out = await Parser.detectVulnerabilities([{ name: 'foo.js', path: 'foo.js', content: 'console.log(1);' }]);
    expect(out.totalVulns).toBe(0);
    expect(out.packages).toEqual([]);
  });

  it('finds known CVE in old express version', async () => {
    if (process.env.SKIP_NETWORK) return;
    const out = await Parser.detectVulnerabilities([{
      name: 'package.json', path: 'package.json',
      content: JSON.stringify({ dependencies: { 'express': '4.16.0' } }),
    }]);
    // Express 4.16.0 has multiple known CVEs (e.g. GHSA-rv95-896h-c2vc Open Redirect)
    expect(out.packages.length).toBe(1);
    expect(out.totalVulns).toBeGreaterThan(0);
    expect(out.vulnerablePackages[0].name).toBe('express');
  });
});
