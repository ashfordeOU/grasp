import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import crypto from 'crypto';
import { GraphStore } from '../src/graph.js';
import type { AnalysisResult } from '../src/types.js';

function repoId(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function makeResult(): AnalysisResult {
  return {
    sessionId: 'test-sess',
    source: 'owner/testrepo',
    sourceType: 'github',
    analyzedAt: new Date().toISOString(),
    files: [
      {
        path: 'src/auth.ts', name: 'auth.ts', folder: 'src',
        content: null, lines: 80, layer: 'services', churn: 2, isCode: true,
        functions: [
          { name: 'login', file: 'src/auth.ts', line: 10, returnType: 'Promise<User>' },
          { name: 'logout', file: 'src/auth.ts', line: 25, returnType: 'void' },
        ],
        imports: [], exports: [], language: 'TypeScript', size: 0, issues: [],
      } as any,
      {
        path: 'src/user.ts', name: 'user.ts', folder: 'src',
        content: null, lines: 60, layer: 'models', churn: 1, isCode: true,
        functions: [
          { name: 'getUser', file: 'src/user.ts', line: 5, returnType: 'Promise<User>' },
        ],
        imports: [], exports: [], language: 'TypeScript', size: 0, issues: [],
      } as any,
    ],
    connections: [
      { source: 'src/user.ts', target: 'src/auth.ts', fn: 'getUser', count: 3 },
    ],
    issues: [], patterns: [], security: [], duplicates: [], layerViolations: [],
    folders: ['src'], layers: ['services', 'models'],
    summary: {
      fileCount: 2, codeFileCount: 2, functionCount: 3, connectionCount: 1,
      issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0,
      healthScore: 90, healthGrade: 'A', layers: ['services', 'models'],
      topFolders: [], languages: [],
    },
  };
}

let tmpDir: string;
let graph: GraphStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-graph-test-'));
  graph = new GraphStore(tmpDir);
});

afterEach(async () => {
  await graph.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('creates graph directory on init', () => {
  expect(fs.existsSync(path.join(tmpDir, 'graph'))).toBe(true);
});

test('query returns empty array for empty graph', async () => {
  const rows = await graph.query('MATCH (f:Function) RETURN f.name');
  expect(Array.isArray(rows)).toBe(true);
  expect(rows).toHaveLength(0);
});

test('query rejects write operations', async () => {
  await expect(graph.query("CREATE (:Test {x: '1'})")).rejects.toThrow('read-only');
  await expect(graph.query('MATCH (n) DELETE n')).rejects.toThrow('read-only');
});

test('query allows read operations', async () => {
  const rows = await graph.query('MATCH (f:Function) RETURN f.name');
  expect(Array.isArray(rows)).toBe(true);
});

test('indexResult creates Function nodes', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(`MATCH (f:Function {repoId: '${repoId('owner/testrepo')}'}) RETURN f.name ORDER BY f.name`);
  const names = rows.map((r: any) => Object.values(r)[0]);
  expect(names).toContain('login');
  expect(names).toContain('logout');
  expect(names).toContain('getUser');
});

test('indexResult stores returnType on Function nodes', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(`MATCH (f:Function {name: 'login', repoId: '${repoId('owner/testrepo')}'}) RETURN f.returnType`);
  expect(rows[0]).toBeDefined();
  const val = Object.values(rows[0])[0];
  expect(val).toBe('Promise<User>');
});

test('indexResult creates CALLS edges', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(
    `MATCH (a:Function {name: 'login'})-[c:CALLS]->(b:Function {name: 'getUser'}) RETURN c.count`
  );
  expect(rows.length).toBeGreaterThan(0);
});

test('indexResult creates SAME_RETURN_TYPE edges for shared return types', async () => {
  await graph.indexResult(makeResult());
  const rows = await graph.query(
    `MATCH (a:Function)-[r:SAME_RETURN_TYPE]->(b:Function) WHERE a.repoId = '${repoId('owner/testrepo')}' RETURN a.name, b.name, r.typeName`
  );
  const pairs = rows.map((r: any) => {
    const vals = Object.values(r);
    return [vals[0], vals[1]];
  });
  const names = pairs.flat();
  expect(names).toContain('login');
  expect(names).toContain('getUser');
});

test('indexResult is idempotent — re-index replaces data', async () => {
  await graph.indexResult(makeResult());
  await graph.indexResult(makeResult());
  const rows = await graph.query(`MATCH (f:Function {repoId: '${repoId('owner/testrepo')}'}) RETURN f.name`);
  expect(rows).toHaveLength(3); // not 6
});

describe('query methods (require indexed data)', () => {
  beforeEach(async () => {
    await graph.indexResult(makeResult());
  });

  it('indexes COVERS edges for a test file that imports a source file', async () => {
    const store = new GraphStore(tmpDir);
    const mockResult = {
      source: 'cover-test-repo',
      files: [
        {
          path: 'src/utils.ts',
          language: 'TypeScript',
          functions: [{ name: 'formatDate', file: 'src/utils.ts', line: 5, type: 'function', isExported: true }],
          imports: [],
          classes: [],
        },
        {
          path: 'src/utils.test.ts',
          language: 'TypeScript',
          functions: [{ name: 'describe_formatDate', file: 'src/utils.test.ts', line: 3, type: 'function', isExported: false, code: 'describe("formatDate", () => { it("works", () => { formatDate(new Date()); }) })' }],
          imports: [{ source: './utils' }],
          classes: [],
        },
      ],
      connections: [],
      summary: { healthScore: 80, healthGrade: 'B', fileCount: 2, issueCount: 0, functionCount: 2 },
      security: [],
      issues: [],
    };
    await store.indexResult(mockResult as any);
    const coversRows = await store.query(
      `MATCH (t:TestFile)-[:COVERS]->(fn:Function {repoId: 'cover-test-repo'}) RETURN fn.name AS name`
    );
    expect(coversRows.length).toBeGreaterThan(0);
    expect(coversRows[0]['name']).toBe('formatDate');
    await store.close();
  });

  it('schema v3 creates TestFile, TESTS, COVERS tables without error', async () => {
    const store = new GraphStore(tmpDir);
    // Query an empty TestFile table — should not throw
    const rows = await store.query(
      "MATCH (t:TestFile {repoId: '__nonexistent__'}) RETURN t.id LIMIT 1"
    );
    expect(Array.isArray(rows)).toBe(true);
    await store.close();
  });

  test('getCallChain callees returns direct callees', async () => {
    const chain = await graph.getCallChain('owner/testrepo', 'login', 'callees', 2);
    expect(chain).toBeDefined();
    expect(Array.isArray(chain.nodes)).toBe(true);
    const names = chain.nodes.flatMap((n: any) => Object.values(n) as string[]).filter((v): v is string => typeof v === 'string');
    expect(names).toContain('login');
    expect(names).toContain('getUser');
  });

  test('getCallChain callers returns result', async () => {
    const chain = await graph.getCallChain('owner/testrepo', 'login', 'callers', 2);
    expect(chain).toBeDefined();
    expect(Array.isArray(chain.nodes)).toBe(true);
  });

  test('getTypeChain finds functions with matching returnType', async () => {
    const result = await graph.getTypeChain('owner/testrepo', 'Promise<User>', 2);
    expect(result).toBeDefined();
    expect(Array.isArray(result.producers)).toBe(true);
    const producerNames = result.producers.map((p: any) => Object.values(p)[0]);
    expect(producerNames).toContain('login');
    expect(producerNames).toContain('getUser');
    expect(Array.isArray(result.peers)).toBe(true);
    const peerNames = result.peers.map((p: any) => Object.values(p)[0]);
    expect(peerNames).toContain('login');
    expect(peerNames).toContain('getUser');
  });

  test('clear removes all data for a repo', async () => {
    await graph.clear('owner/testrepo');
    const rows = await graph.query(`MATCH (f:Function) WHERE f.repoId = '${repoId('owner/testrepo')}' RETURN f.name`);
    expect(rows).toHaveLength(0);
  });
});
