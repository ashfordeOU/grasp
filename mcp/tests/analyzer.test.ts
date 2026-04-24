import * as path from 'path';
import { analyzeSource, parseSource } from '../src/analyzer';

const FIXTURE = path.join(__dirname, 'fixtures', 'simple-project');

describe('analyzeSource — simple fixture', () => {
  let result: Awaited<ReturnType<typeof analyzeSource>>;

  beforeAll(async () => {
    const source = parseSource(FIXTURE, undefined);
    expect(source).not.toBeNull();
    result = await analyzeSource(source!, () => {});
  }, 30_000);

  test('returns a session id', () => {
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId.length).toBeGreaterThan(0);
  });

  test('detects files', () => {
    expect(result.summary.fileCount).toBeGreaterThan(0);
    expect(result.summary.codeFileCount).toBeGreaterThan(0);
  });

  test('detects TypeScript files', () => {
    const tsFiles = result.files.filter(f => f.path.endsWith('.ts'));
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  test('detects connections between files', () => {
    expect(result.connections.length).toBeGreaterThan(0);
  });

  test('health score is 0–100', () => {
    expect(result.summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.healthScore).toBeLessThanOrEqual(100);
  });

  test('health grade is A–F', () => {
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.summary.healthGrade);
  });

  test('detects index.ts as entry file', () => {
    const idx = result.files.find(f => f.path.includes('index'));
    expect(idx).toBeDefined();
  });

  test('detects that utils.ts is imported by index.ts', () => {
    // source = the file being imported, target = the file doing the importing
    const conn = result.connections.find(
      c => c.source.includes('utils') && c.target.includes('index')
    );
    expect(conn).toBeDefined();
  });

  test('detects that utils.ts is imported by UserService', () => {
    const conn = result.connections.find(
      c => c.source.includes('utils') && c.target.includes('user')
    );
    expect(conn).toBeDefined();
  });
});

describe('parseSource', () => {
  test('returns null for invalid source', () => {
    expect(parseSource('', undefined)).toBeNull();
  });

  test('handles local path', () => {
    const src = parseSource(FIXTURE, undefined);
    expect(src).not.toBeNull();
    expect(src!.type).toBe('local');
  });

  test('handles owner/repo format', () => {
    const src = parseSource('facebook/react', undefined);
    expect(src).not.toBeNull();
    expect(src!.type).toBe('github');
  });

  test('handles full github URL', () => {
    const src = parseSource('https://github.com/facebook/react', undefined);
    expect(src).not.toBeNull();
    expect(src!.type).toBe('github');
  });

  test('parseSource: passes gitlabToken to gitlab source', () => {
    const src = parseSource('https://gitlab.com/myns/myrepo', undefined, 'glpat-abc');
    expect(src?.type).toBe('gitlab');
    expect((src as any).token).toBe('glpat-abc');
  });

  test('parseSource: gitlabHost overrides URL-parsed host', () => {
    const src = parseSource('https://gitlab.com/myns/myrepo', undefined, undefined, 'gitlab.internal.company.com');
    expect(src?.type).toBe('gitlab');
    expect((src as any).host).toBe('gitlab.internal.company.com');
  });

  test('parseSource: URL-parsed host used when gitlabHost not provided', () => {
    const src = parseSource('https://gitlab.com/myns/myrepo', undefined, undefined, undefined);
    expect(src?.type).toBe('gitlab');
    expect((src as any).host).toBe('gitlab.com');
  });

  // --- Bitbucket ---

  test('parseSource: detects Bitbucket URL', () => {
    const src = parseSource('https://bitbucket.org/atlassian/python-bitbucket');
    expect(src).not.toBeNull();
    expect(src!.type).toBe('bitbucket');
    expect((src as any).workspace).toBe('atlassian');
    expect((src as any).repo).toBe('python-bitbucket');
  });

  test('parseSource: passes Bitbucket credentials through extra', () => {
    const src = parseSource(
      'bitbucket.org/myteam/myrepo',
      undefined,
      undefined,
      undefined,
      { bbUsername: 'user1', bbPassword: 'app-pass' }
    );
    expect(src).not.toBeNull();
    expect(src!.type).toBe('bitbucket');
    expect((src as any).bitbucketUsername).toBe('user1');
    expect((src as any).bitbucketPassword).toBe('app-pass');
  });

  // --- Azure DevOps ---

  test('parseSource: detects Azure DevOps URL', () => {
    const src = parseSource('https://dev.azure.com/myorg/myproject/_git/myrepo');
    expect(src).not.toBeNull();
    expect(src!.type).toBe('azure');
    expect((src as any).azureOrg).toBe('myorg');
    expect((src as any).repo).toBe('myrepo');
  });

  test('parseSource: passes Azure PAT through extra', () => {
    const src = parseSource(
      'dev.azure.com/myorg/myproject/_git/myrepo',
      undefined,
      undefined,
      undefined,
      { azurePat: 'azure-token-xyz' }
    );
    expect(src).not.toBeNull();
    expect(src!.type).toBe('azure');
    expect((src as any).azurePat).toBe('azure-token-xyz');
  });

  // --- GitHub Enterprise ---

  test('parseSource: detects GitHub Enterprise URL', () => {
    const src = parseSource(
      'https://github.mycompany.com/myorg/myrepo',
      undefined,
      undefined,
      undefined,
      { gheToken: 'ghe-tok', gheHost: 'github.mycompany.com' }
    );
    expect(src).not.toBeNull();
    expect(src!.type).toBe('github-enterprise');
    expect((src as any).host).toBe('github.mycompany.com');
    expect((src as any).owner).toBe('myorg');
    expect((src as any).repo).toBe('myrepo');
    expect((src as any).token).toBe('ghe-tok');
  });

  test('parseSource: github.com URL is not detected as GitHub Enterprise', () => {
    const src = parseSource('https://github.com/owner/repo');
    expect(src).not.toBeNull();
    expect(src!.type).toBe('github');
  });

  // --- Gitea ---

  test('parseSource: detects Gitea URL when giteaHost hint is provided', () => {
    const src = parseSource(
      'https://gitea.example.com/myorg/myrepo',
      undefined,
      undefined,
      undefined,
      { giteaToken: 'gitea-tok', giteaHost: 'gitea.example.com' }
    );
    expect(src).not.toBeNull();
    expect(src!.type).toBe('gitea');
    expect((src as any).host).toBe('gitea.example.com');
    expect((src as any).owner).toBe('myorg');
    expect((src as any).repo).toBe('myrepo');
    expect((src as any).token).toBe('gitea-tok');
  });

  test('parseSource: unknown host without giteaHost hint resolves via URL parser', () => {
    // parseGiteaUrl matches any non-known-platform host, so this returns type=gitea
    // (it does NOT fall back to github or null)
    const src = parseSource('https://unknownhost.example.com/owner/repo');
    expect(src).not.toBeNull();
    expect(src!.type).toBe('gitea');
  });
});
