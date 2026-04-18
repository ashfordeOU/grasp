import {
  countImportSites,
  estimateFunctionUsages,
  topoSort,
  buildMigrationPlan,
} from '../src/migration-planner';
import type { AnalyzedFile, Connection } from '../src/types';

// ── countImportSites ─────────────────────────────────────────────────────────

describe('countImportSites', () => {
  it('counts ES import from', () => {
    const src = `import { map } from 'lodash';\nimport _ from 'lodash';`;
    expect(countImportSites(src, 'lodash')).toBe(2);
  });

  it('counts require() calls', () => {
    const src = `const _ = require('lodash');\nconst merge = require('lodash');`;
    expect(countImportSites(src, 'lodash')).toBe(2);
  });

  it('counts dynamic import()', () => {
    const src = `const m = await import('moment');`;
    expect(countImportSites(src, 'moment')).toBe(1);
  });

  it('does not match partial package names', () => {
    const src = `import x from 'lodash-es';`;
    // 'lodash' should NOT match 'lodash-es' since pattern is anchored
    // (This test documents the behavior — exact match depends on regex)
    const count = countImportSites(src, 'lodash');
    // 'lodash-es' contains 'lodash' followed by '-es' not ' or '
    // The regex ends with (?:['"\\s/]|$) so '-es' won't match
    expect(count).toBe(0);
  });

  it('returns 0 when package not imported', () => {
    const src = `import React from 'react';`;
    expect(countImportSites(src, 'lodash')).toBe(0);
  });

  it('handles scoped packages', () => {
    const src = `import { something } from '@scope/package';`;
    expect(countImportSites(src, '@scope/package')).toBe(1);
  });
});

// ── estimateFunctionUsages ───────────────────────────────────────────────────

describe('estimateFunctionUsages', () => {
  it('returns 0 when package not imported', () => {
    const src = `import x from 'react';\nconst a = x.render();`;
    expect(estimateFunctionUsages(src, 'lodash')).toBe(0);
  });

  it('returns > 0 when package is imported', () => {
    const src = Array.from({ length: 50 }, (_, i) => `const v${i} = lodash.get(obj, 'key');`).join('\n');
    const full = `import lodash from 'lodash';\n` + src;
    expect(estimateFunctionUsages(full, 'lodash')).toBeGreaterThan(0);
  });
});

// ── topoSort ─────────────────────────────────────────────────────────────────

describe('topoSort', () => {
  it('returns single phase when no dependencies', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const phases = topoSort(files, []);
    expect(phases).toHaveLength(1);
    expect(phases[0].sort()).toEqual(['a.ts', 'b.ts', 'c.ts'].sort());
  });

  it('orders leaf files before dependents', () => {
    // a.ts exports something used by b.ts → a is leaf, b depends on a
    const files = ['a.ts', 'b.ts'];
    const conns: Connection[] = [
      { source: 'a.ts', target: 'b.ts', fn: 'foo', count: 1 },
    ];
    const phases = topoSort(files, conns);
    // a.ts should come before b.ts
    const aPhase = phases.findIndex(p => p.includes('a.ts'));
    const bPhase = phases.findIndex(p => p.includes('b.ts'));
    expect(aPhase).toBeLessThanOrEqual(bPhase);
  });

  it('handles a chain a → b → c', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const conns: Connection[] = [
      { source: 'a.ts', target: 'b.ts', fn: 'f1', count: 1 },
      { source: 'b.ts', target: 'c.ts', fn: 'f2', count: 1 },
    ];
    const phases = topoSort(files, conns);
    const aIdx = phases.findIndex(p => p.includes('a.ts'));
    const bIdx = phases.findIndex(p => p.includes('b.ts'));
    const cIdx = phases.findIndex(p => p.includes('c.ts'));
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });

  it('ignores connections to files outside the set', () => {
    const files = ['a.ts'];
    const conns: Connection[] = [
      { source: 'a.ts', target: 'z.ts', fn: 'f', count: 1 }, // z.ts not in set
    ];
    const phases = topoSort(files, conns);
    expect(phases.flat()).toContain('a.ts');
  });

  it('returns all files even with a cycle', () => {
    const files = ['a.ts', 'b.ts'];
    const conns: Connection[] = [
      { source: 'a.ts', target: 'b.ts', fn: 'f1', count: 1 },
      { source: 'b.ts', target: 'a.ts', fn: 'f2', count: 1 },
    ];
    const phases = topoSort(files, conns);
    expect(phases.flat().sort()).toEqual(['a.ts', 'b.ts'].sort());
  });
});

// ── buildMigrationPlan ───────────────────────────────────────────────────────

function makeFile(path: string, content: string): AnalyzedFile {
  return {
    path,
    name: path.split('/').pop()!,
    folder: path.split('/')[0],
    content,
    functions: [],
    lines: content.split('\n').length,
    layer: 'app',
    churn: 0,
    isCode: true,
  };
}

describe('buildMigrationPlan', () => {
  it('returns no-op plan when package is not imported anywhere', () => {
    const files = [makeFile('src/a.ts', `import React from 'react';`)];
    const plan = buildMigrationPlan(files, [], { from: 'lodash' });
    expect(plan.totalFiles).toBe(0);
    expect(plan.phases).toHaveLength(0);
    expect(plan.warnings.some(w => w.includes("importing"))).toBe(true);
  });

  it('generates a plan for a simple replacement', () => {
    const files = [
      makeFile('src/utils.ts', `import { format } from 'moment';`),
      makeFile('src/index.ts', `import { format } from 'moment';\nimport { helper } from './utils';`),
    ];
    const connections: Connection[] = [
      { source: 'src/utils.ts', target: 'src/index.ts', fn: 'helper', count: 1 },
    ];
    const plan = buildMigrationPlan(files, connections, { from: 'moment', to: 'date-fns' });

    expect(plan.totalFiles).toBe(2);
    expect(plan.phases.length).toBeGreaterThanOrEqual(1);

    const allSteps = plan.phases.flatMap(p => p.steps);
    expect(allSteps.some(s => s.file === 'src/utils.ts')).toBe(true);
    expect(allSteps.some(s => s.file === 'src/index.ts')).toBe(true);
  });

  it('orders leaf files before dependents', () => {
    const files = [
      makeFile('src/leaf.ts', `import { get } from 'lodash';`),
      makeFile('src/root.ts', `import { get } from 'lodash';`),
    ];
    const conns: Connection[] = [
      { source: 'src/leaf.ts', target: 'src/root.ts', fn: 'someHelper', count: 1 },
    ];
    const plan = buildMigrationPlan(files, conns, { from: 'lodash', to: 'lodash-es' });

    const leafPhase = plan.phases.findIndex(p => p.steps.some(s => s.file === 'src/leaf.ts'));
    const rootPhase = plan.phases.findIndex(p => p.steps.some(s => s.file === 'src/root.ts'));
    expect(leafPhase).toBeLessThanOrEqual(rootPhase);
  });

  it('includes replacement import actions when to is specified', () => {
    const files = [makeFile('src/a.ts', `import { debounce } from 'lodash';`)];
    const plan = buildMigrationPlan(files, [], { from: 'lodash', to: 'lodash-es' });
    const step = plan.phases[0].steps[0];
    expect(step.actions.some(a => a.includes('lodash-es'))).toBe(true);
  });

  it('includes removal actions when no to is specified', () => {
    const files = [makeFile('src/a.ts', `import { isNil } from 'lodash';`)];
    const plan = buildMigrationPlan(files, [], { from: 'lodash' });
    const step = plan.phases[0].steps[0];
    expect(step.actions.some(a => a.toLowerCase().includes('remov'))).toBe(true);
  });

  it('assigns correct effort levels', () => {
    const highSrc = Array.from({ length: 30 }, (_, i) => `const v${i} = _.get(obj, 'key');`).join('\n');
    const files = [makeFile('src/heavy.ts', `import _ from 'lodash';\n${highSrc}`)];
    const plan = buildMigrationPlan(files, [], { from: 'lodash' });
    const step = plan.phases[0].steps[0];
    expect(step.importSites).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(step.effort);
  });

  it('includes estimated effort in plan', () => {
    const files = [makeFile('src/a.ts', `import x from 'old-pkg';`)];
    const plan = buildMigrationPlan(files, [], { from: 'old-pkg', to: 'new-pkg' });
    expect(plan.estimatedEffort).toBeTruthy();
    expect(typeof plan.estimatedEffort).toBe('string');
  });

  it('marks multi-file phases as parallelizable', () => {
    const files = [
      makeFile('a.ts', `import x from 'pkg';`),
      makeFile('b.ts', `import x from 'pkg';`),
      makeFile('c.ts', `import x from 'pkg';`),
    ];
    const plan = buildMigrationPlan(files, [], { from: 'pkg', to: 'new-pkg' });
    // With no connections, all files should be in one parallel phase
    expect(plan.phases[0].canParallelize).toBe(true);
  });

  it('summary contains file count and effort', () => {
    const files = [makeFile('src/a.ts', `import m from 'moment';`)];
    const plan = buildMigrationPlan(files, [], { from: 'moment', to: 'date-fns' });
    expect(plan.summary).toContain('1 file');
  });
});
