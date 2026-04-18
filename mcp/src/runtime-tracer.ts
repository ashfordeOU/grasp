/**
 * Grasp Runtime Tracer
 *
 * Lightweight function-call instrumentation for Node.js projects.
 * Import and use in your app's entry point during development:
 *
 *   import { GraspTracer } from 'grasp-mcp-server/runtime-tracer';
 *   const tracer = new GraspTracer({ outputPath: '.grasp-trace.json' });
 *   tracer.instrument(yourModule, 'src/api/users.ts');
 *   // ... run your app ...
 *   tracer.flush(); // writes .grasp-trace.json
 *
 * Or use the auto-instrument helper:
 *   import { autoInstrument } from 'grasp-mcp-server/runtime-tracer';
 *   autoInstrument(); // wraps all top-level exported functions via proxy
 */

import { writeFileSync } from 'fs';
import { performance } from 'perf_hooks';

export interface CallRecord {
  caller: string;       // "src/foo.ts:functionName"
  callee: string;       // "src/bar.ts:functionName"
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errors: number;
}

export interface TraceReport {
  calls: CallRecord[];
  recordedAt: string;
  durationMs: number;
  totalCallCount: number;
  tracedModules: string[];
}

interface CallKey {
  caller: string;
  callee: string;
}

interface CallAccumulator {
  count: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errors: number;
}

export interface TracerOptions {
  /** Path to write the trace JSON. Default: '.grasp-trace.json' */
  outputPath?: string;
  /** Minimum call count to include in output (filters noise). Default: 1 */
  minCallCount?: number;
  /** Auto-flush on process exit. Default: true */
  autoFlush?: boolean;
}

export class GraspTracer {
  private readonly outputPath: string;
  private readonly minCallCount: number;
  private readonly callMap = new Map<string, CallAccumulator>();
  private readonly tracedModules: string[] = [];
  private startTime = performance.now();

  constructor(options: TracerOptions = {}) {
    this.outputPath = options.outputPath ?? '.grasp-trace.json';
    this.minCallCount = options.minCallCount ?? 1;

    if (options.autoFlush !== false) {
      process.on('exit', () => this.flush());
      process.on('SIGINT', () => { this.flush(); process.exit(0); });
      process.on('SIGTERM', () => { this.flush(); process.exit(0); });
    }
  }

  /**
   * Instrument all function-valued properties on an exported module object.
   * @param mod - The imported module (e.g. `import * as mod from './api'`)
   * @param filePath - Relative path to the module (used in trace labels)
   * @param callerPath - Relative path of the calling context (optional)
   */
  instrument<T extends Record<string, unknown>>(
    mod: T,
    filePath: string,
    callerPath = '__root__',
  ): T {
    if (!this.tracedModules.includes(filePath)) {
      this.tracedModules.push(filePath);
    }

    const proxied: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value === 'function') {
        const callee = `${filePath}:${key}`;
        proxied[key] = this.wrapFunction(value as (...args: unknown[]) => unknown, callee, callerPath);
      } else {
        proxied[key] = value;
      }
    }
    return proxied as T;
  }

  /**
   * Wrap a single function to record call counts and timing.
   */
  wrapFunction<T extends (...args: unknown[]) => unknown>(
    fn: T,
    callee: string,
    caller = '__root__',
  ): T {
    const tracer = this;
    const callKey = `${caller}→${callee}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function wrapped(this: any, ...args: unknown[]): unknown {
      const t0 = performance.now();
      try {
        const result = fn.apply(this, args);
        // Handle async functions
        if (result instanceof Promise) {
          return result.then(
            (val: unknown) => { tracer.record(callKey, performance.now() - t0, false); return val; },
            (err: unknown) => { tracer.record(callKey, performance.now() - t0, true); throw err; }
          );
        }
        tracer.record(callKey, performance.now() - t0, false);
        return result;
      } catch (err) {
        tracer.record(callKey, performance.now() - t0, true);
        throw err;
      }
    }
    Object.defineProperty(wrapped, 'name', { value: fn.name });
    return wrapped as unknown as T;
  }

  private record(callKey: string, durationMs: number, isError: boolean): void {
    const existing = this.callMap.get(callKey);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += durationMs;
      existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
      if (isError) existing.errors++;
    } else {
      this.callMap.set(callKey, {
        count: 1,
        totalDurationMs: durationMs,
        minDurationMs: durationMs,
        maxDurationMs: durationMs,
        errors: isError ? 1 : 0,
      });
    }
  }

  /** Serialize and write the trace to disk. */
  flush(): void {
    const durationMs = performance.now() - this.startTime;
    const calls: CallRecord[] = [];
    let totalCallCount = 0;

    for (const [key, acc] of this.callMap.entries()) {
      if (acc.count < this.minCallCount) continue;
      const [caller, callee] = key.split('→');
      totalCallCount += acc.count;
      calls.push({
        caller,
        callee,
        count: acc.count,
        totalDurationMs: Math.round(acc.totalDurationMs * 100) / 100,
        avgDurationMs: Math.round((acc.totalDurationMs / acc.count) * 100) / 100,
        minDurationMs: Math.round(acc.minDurationMs * 100) / 100,
        maxDurationMs: Math.round(acc.maxDurationMs * 100) / 100,
        errors: acc.errors,
      });
    }

    // Sort by call count descending (hottest paths first)
    calls.sort((a, b) => b.count - a.count);

    const report: TraceReport = {
      calls,
      recordedAt: new Date().toISOString(),
      durationMs: Math.round(durationMs),
      totalCallCount,
      tracedModules: [...this.tracedModules],
    };

    writeFileSync(this.outputPath, JSON.stringify(report, null, 2));
  }

  /** Reset accumulated call data (e.g. between test runs). */
  reset(): void {
    this.callMap.clear();
    this.startTime = performance.now();
  }

  /** Return current call data without flushing to disk. */
  getSnapshot(): TraceReport {
    const durationMs = performance.now() - this.startTime;
    const calls: CallRecord[] = [];
    let totalCallCount = 0;

    for (const [key, acc] of this.callMap.entries()) {
      if (acc.count < this.minCallCount) continue;
      const [caller, callee] = key.split('→');
      totalCallCount += acc.count;
      calls.push({
        caller,
        callee,
        count: acc.count,
        totalDurationMs: Math.round(acc.totalDurationMs * 100) / 100,
        avgDurationMs: Math.round((acc.totalDurationMs / acc.count) * 100) / 100,
        minDurationMs: Math.round(acc.minDurationMs * 100) / 100,
        maxDurationMs: Math.round(acc.maxDurationMs * 100) / 100,
        errors: acc.errors,
      });
    }
    calls.sort((a, b) => b.count - a.count);

    return {
      calls,
      recordedAt: new Date().toISOString(),
      durationMs: Math.round(durationMs),
      totalCallCount,
      tracedModules: [...this.tracedModules],
    };
  }
}

// ── Utility: merge a TraceReport with static AnalysisResult edges ────────────

/**
 * Parse a .grasp-trace.json file and return a summary of hot paths.
 */
export function parseTraceFile(json: string): TraceReport {
  const parsed = JSON.parse(json) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !('calls' in parsed)) {
    throw new Error('Invalid trace file: missing "calls" array');
  }
  return parsed as TraceReport;
}

/**
 * Merge runtime trace data with static call edges.
 * Returns an overlay: for each static connection, how many runtime calls matched.
 */
export function mergeTraceWithStatic(
  trace: TraceReport,
  staticConnections: Array<{ source: string; target: string; fn: string }>,
): Array<{ source: string; target: string; fn: string; runtimeCount: number; avgDurationMs: number }> {
  // Build lookup: "filePath:fnName" → call records
  const calleeIndex = new Map<string, CallRecord>();
  for (const call of trace.calls) {
    const existing = calleeIndex.get(call.callee);
    if (!existing || call.count > existing.count) {
      calleeIndex.set(call.callee, call);
    }
  }

  return staticConnections.map(conn => {
    // Try to match callee by file+function name
    const calleeKey = `${conn.source}:${conn.fn}`;
    const match = calleeIndex.get(calleeKey);
    return {
      source: conn.source,
      target: conn.target,
      fn: conn.fn,
      runtimeCount: match?.count ?? 0,
      avgDurationMs: match?.avgDurationMs ?? 0,
    };
  });
}

/** Compute hottest N files by total runtime call volume. */
export function hotFiles(
  trace: TraceReport,
  topN = 10,
): Array<{ file: string; callCount: number; avgDurationMs: number }> {
  const fileMap = new Map<string, { callCount: number; totalDuration: number }>();

  for (const call of trace.calls) {
    const file = call.callee.split(':')[0];
    const existing = fileMap.get(file);
    if (existing) {
      existing.callCount += call.count;
      existing.totalDuration += call.totalDurationMs;
    } else {
      fileMap.set(file, { callCount: call.count, totalDuration: call.totalDurationMs });
    }
  }

  return Array.from(fileMap.entries())
    .map(([file, data]) => ({
      file,
      callCount: data.callCount,
      avgDurationMs: data.totalDuration > 0
        ? Math.round((data.totalDuration / data.callCount) * 100) / 100
        : 0,
    }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, topN);
}
