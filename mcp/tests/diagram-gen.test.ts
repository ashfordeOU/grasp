import { generateMermaid, generateC4Context } from '../src/diagram-gen';

const mockData: any = {
  source: 'test/repo',
  files: [
    { path: 'src/auth.ts', layer: 'services', functions: [], issues: [] },
    { path: 'src/db.ts', layer: 'db', functions: [], issues: [] },
    { path: 'src/config.ts', layer: 'config', functions: [], issues: [] },
    { path: 'src/App.tsx', layer: 'ui', functions: [], issues: [] },
  ],
  connections: [
    { from: 'src/auth.ts', to: 'src/db.ts', type: 'import' },
    { from: 'src/auth.ts', to: 'src/config.ts', type: 'import' },
    { from: 'src/App.tsx', to: 'src/auth.ts', type: 'import' },
  ],
  issues: [], security: [], patterns: [],
};

test('generateMermaid produces graph LR with arrows', () => {
  const result = generateMermaid(mockData, 50);
  expect(result).toContain('graph LR');
  expect(result).toContain('-->');
});

test('generateC4Context produces C4 context diagram', () => {
  const result = generateC4Context(mockData);
  expect(result).toContain('C4Context');
  expect(result).toContain('System(');
});
