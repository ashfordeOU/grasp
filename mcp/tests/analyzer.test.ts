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
});
