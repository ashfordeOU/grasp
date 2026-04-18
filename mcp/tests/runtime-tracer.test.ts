import { GraspTracer, parseTraceFile, mergeTraceWithStatic, hotFiles } from '../src/runtime-tracer';

// Suppress process.on exit handlers in tests
const processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);

afterAll(() => {
  processOnSpy.mockRestore();
});

function makeTracer() {
  return new GraspTracer({ autoFlush: false });
}

describe('GraspTracer.instrument + getSnapshot', () => {
  it('records a single synchronous call', () => {
    const tracer = makeTracer();
    const mod = { add: (a: number, b: number) => a + b };
    const wrapped = tracer.instrument(mod, 'src/math.ts', 'src/caller.ts');
    wrapped.add(1, 2);

    const snap = tracer.getSnapshot();
    expect(snap.calls).toHaveLength(1);
    expect(snap.calls[0].callee).toBe('src/math.ts:add');
    expect(snap.calls[0].caller).toBe('src/caller.ts');
    expect(snap.calls[0].count).toBe(1);
  });

  it('accumulates multiple calls to the same function', () => {
    const tracer = makeTracer();
    const mod = { greet: (name: string) => `Hello ${name}` };
    const wrapped = tracer.instrument(mod, 'src/greet.ts');
    wrapped.greet('Alice');
    wrapped.greet('Bob');
    wrapped.greet('Carol');

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].count).toBe(3);
    expect(snap.totalCallCount).toBe(3);
  });

  it('records errors and counts them separately', () => {
    const tracer = makeTracer();
    const mod = { fail: (): void => { throw new Error('boom'); } };
    const wrapped = tracer.instrument(mod, 'src/fail.ts');
    expect(() => wrapped.fail()).toThrow('boom');

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].errors).toBe(1);
    expect(snap.calls[0].count).toBe(1);
  });

  it('handles async functions and records after resolution', async () => {
    const tracer = makeTracer();
    const mod = { fetch: async () => 'data' };
    const wrapped = tracer.instrument(mod, 'src/async.ts');
    await wrapped.fetch();

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].count).toBe(1);
    expect(snap.calls[0].callee).toBe('src/async.ts:fetch');
  });

  it('records errors from async functions', async () => {
    const tracer = makeTracer();
    const mod = { bad: async (): Promise<void> => { throw new Error('async fail'); } };
    const wrapped = tracer.instrument(mod, 'src/bad.ts');
    await expect(wrapped.bad()).rejects.toThrow('async fail');

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].errors).toBe(1);
  });

  it('tracks traced module paths', () => {
    const tracer = makeTracer();
    tracer.instrument({ fn: () => {} }, 'src/a.ts');
    tracer.instrument({ fn: () => {} }, 'src/b.ts');

    const snap = tracer.getSnapshot();
    expect(snap.tracedModules).toContain('src/a.ts');
    expect(snap.tracedModules).toContain('src/b.ts');
  });

  it('does not add duplicate module names', () => {
    const tracer = makeTracer();
    tracer.instrument({ fn: () => {} }, 'src/a.ts');
    tracer.instrument({ fn: () => {} }, 'src/a.ts');

    const snap = tracer.getSnapshot();
    expect(snap.tracedModules.filter(m => m === 'src/a.ts')).toHaveLength(1);
  });

  it('sorts calls by count descending', () => {
    const tracer = makeTracer();
    const mod = { a: () => {}, b: () => {}, c: () => {} };
    const wrapped = tracer.instrument(mod, 'src/multi.ts');
    for (let i = 0; i < 5; i++) wrapped.c();
    for (let i = 0; i < 2; i++) wrapped.a();
    wrapped.b();

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].callee).toContain(':c');
    expect(snap.calls[0].count).toBe(5);
    expect(snap.calls[1].count).toBe(2);
  });

  it('passes minCallCount filter in getSnapshot', () => {
    const tracer = new GraspTracer({ autoFlush: false, minCallCount: 5 });
    const mod = { hot: () => {}, cold: () => {} };
    const wrapped = tracer.instrument(mod, 'src/mixed.ts');
    for (let i = 0; i < 10; i++) wrapped.hot();
    wrapped.cold();

    const snap = tracer.getSnapshot();
    expect(snap.calls.every(c => c.count >= 5)).toBe(true);
  });

  it('reset clears accumulated data', () => {
    const tracer = makeTracer();
    const mod = { fn: () => {} };
    const wrapped = tracer.instrument(mod, 'src/r.ts');
    wrapped.fn();
    tracer.reset();
    const snap = tracer.getSnapshot();
    expect(snap.calls).toHaveLength(0);
    expect(snap.totalCallCount).toBe(0);
  });

  it('wrapFunction preserves the original function name', () => {
    const tracer = makeTracer();
    function myFunc() {}
    const wrapped = tracer.wrapFunction(myFunc as () => void, 'src/x.ts:myFunc');
    expect(wrapped.name).toBe('myFunc');
  });

  it('records timing as non-negative numbers', () => {
    const tracer = makeTracer();
    const mod = { fn: () => {} };
    const wrapped = tracer.instrument(mod, 'src/timing.ts');
    wrapped.fn();

    const snap = tracer.getSnapshot();
    expect(snap.calls[0].avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(snap.calls[0].minDurationMs).toBeLessThanOrEqual(snap.calls[0].maxDurationMs);
  });
});

describe('parseTraceFile', () => {
  it('parses a valid trace file', () => {
    const input = JSON.stringify({
      calls: [{ caller: 'a', callee: 'b', count: 3, totalDurationMs: 9, avgDurationMs: 3, minDurationMs: 2, maxDurationMs: 5, errors: 0 }],
      recordedAt: '2024-01-01T00:00:00Z',
      durationMs: 1000,
      totalCallCount: 3,
      tracedModules: ['src/a.ts'],
    });
    const trace = parseTraceFile(input);
    expect(trace.calls).toHaveLength(1);
    expect(trace.totalCallCount).toBe(3);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseTraceFile('{bad json')).toThrow();
  });

  it('throws when calls array is missing', () => {
    expect(() => parseTraceFile('{"other":"stuff"}')).toThrow(/missing.*calls/i);
  });
});

describe('mergeTraceWithStatic', () => {
  it('returns runtime count 0 for unmatched static edges', () => {
    const trace = { calls: [], recordedAt: '', durationMs: 0, totalCallCount: 0, tracedModules: [] };
    const merged = mergeTraceWithStatic(trace, [
      { source: 'src/a.ts', target: 'src/b.ts', fn: 'doThing' },
    ]);
    expect(merged[0].runtimeCount).toBe(0);
    expect(merged[0].avgDurationMs).toBe(0);
  });

  it('matches callee by file:fn pattern', () => {
    const trace = {
      calls: [{
        caller: '__root__',
        callee: 'src/a.ts:doThing',
        count: 42,
        totalDurationMs: 210,
        avgDurationMs: 5,
        minDurationMs: 4,
        maxDurationMs: 8,
        errors: 0,
      }],
      recordedAt: '',
      durationMs: 1000,
      totalCallCount: 42,
      tracedModules: ['src/a.ts'],
    };
    const merged = mergeTraceWithStatic(trace, [
      { source: 'src/a.ts', target: 'src/b.ts', fn: 'doThing' },
    ]);
    expect(merged[0].runtimeCount).toBe(42);
    expect(merged[0].avgDurationMs).toBe(5);
  });

  it('preserves all static edges in output', () => {
    const trace = { calls: [], recordedAt: '', durationMs: 0, totalCallCount: 0, tracedModules: [] };
    const staticEdges = [
      { source: 'a.ts', target: 'b.ts', fn: 'foo' },
      { source: 'c.ts', target: 'd.ts', fn: 'bar' },
    ];
    const merged = mergeTraceWithStatic(trace, staticEdges);
    expect(merged).toHaveLength(2);
  });
});

describe('hotFiles', () => {
  it('returns top N files by call volume', () => {
    const trace = {
      calls: [
        { caller: 'a', callee: 'src/hot.ts:fn1', count: 100, totalDurationMs: 500, avgDurationMs: 5, minDurationMs: 3, maxDurationMs: 10, errors: 0 },
        { caller: 'a', callee: 'src/hot.ts:fn2', count: 50, totalDurationMs: 100, avgDurationMs: 2, minDurationMs: 1, maxDurationMs: 5, errors: 0 },
        { caller: 'a', callee: 'src/cold.ts:fn1', count: 5, totalDurationMs: 50, avgDurationMs: 10, minDurationMs: 8, maxDurationMs: 15, errors: 0 },
      ],
      recordedAt: '',
      durationMs: 5000,
      totalCallCount: 155,
      tracedModules: [],
    };
    const hot = hotFiles(trace, 2);
    expect(hot).toHaveLength(2);
    expect(hot[0].file).toBe('src/hot.ts');
    expect(hot[0].callCount).toBe(150); // 100 + 50 merged
    expect(hot[1].file).toBe('src/cold.ts');
  });

  it('returns empty array for empty calls', () => {
    const trace = { calls: [], recordedAt: '', durationMs: 0, totalCallCount: 0, tracedModules: [] };
    expect(hotFiles(trace, 10)).toHaveLength(0);
  });

  it('respects topN limit', () => {
    const calls = Array.from({ length: 20 }, (_, i) => ({
      caller: 'root', callee: `src/file${i}.ts:fn`, count: 20 - i,
      totalDurationMs: 10, avgDurationMs: 1, minDurationMs: 1, maxDurationMs: 2, errors: 0,
    }));
    const trace = { calls, recordedAt: '', durationMs: 1000, totalCallCount: 200, tracedModules: [] };
    expect(hotFiles(trace, 5)).toHaveLength(5);
  });

  it('aggregates calls from multiple functions in the same file', () => {
    const trace = {
      calls: [
        { caller: 'x', callee: 'src/lib.ts:funcA', count: 30, totalDurationMs: 90, avgDurationMs: 3, minDurationMs: 2, maxDurationMs: 5, errors: 0 },
        { caller: 'x', callee: 'src/lib.ts:funcB', count: 20, totalDurationMs: 60, avgDurationMs: 3, minDurationMs: 2, maxDurationMs: 5, errors: 0 },
      ],
      recordedAt: '',
      durationMs: 500,
      totalCallCount: 50,
      tracedModules: [],
    };
    const hot = hotFiles(trace, 5);
    expect(hot[0].file).toBe('src/lib.ts');
    expect(hot[0].callCount).toBe(50);
  });
});
