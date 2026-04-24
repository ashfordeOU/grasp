import { askArchitecture } from '../src/ask-architecture.js';
import { BrainStore } from '../src/brain.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let tmpDir: string;
let brain: BrainStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-ask-tool-'));
  brain = new BrainStore(tmpDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('grasp_ask: empty question falls back to complexity intent', async () => {
  // Index something
  const result: any = {
    sessionId: 'sess1', source: '/tmp/r', sourceType: 'local', analyzedAt: new Date().toISOString(),
    files: [{ path: 'src/a.ts', name: 'a.ts', folder: 'src', content: null, functions: [], lines: 80, layer: 'services', churn: 1, isCode: true, complexity: 20, nestingDepth: 3 }],
    connections: [], issues: [], patterns: [], security: [], duplicates: [], layerViolations: [], folders: ['src'], layers: ['services'],
    summary: { fileCount: 1, codeFileCount: 1, functionCount: 0, connectionCount: 0, issueCount: 0, criticalIssueCount: 0, circularDepCount: 0, securityIssueCount: 0, healthScore: 70, healthGrade: 'C', layers: ['services'], topFolders: [], languages: [] },
  };
  brain.indexResult(result);
  const answer = await askArchitecture(brain, '/tmp/r', 'complexity');
  expect(answer).toContain('src/a.ts');
});

test('grasp_ask: not indexed returns helpful message', async () => {
  const answer = await askArchitecture(brain, '/tmp/notexist', 'what layers exist?');
  expect(answer).toContain('not indexed');
});
