import type { AnalysisResult } from './types.js';
import { detectOrmQueries, type OrmQuery } from './orm-tracker.js';
import { propagateTypes, type PropagatedType } from './type-propagator.js';
import { buildScopeIndex, type ScopeIndex } from './scope-resolver.js';

export interface PipelineEnrichment {
  ormQueries: OrmQuery[];
  propagatedTypes: PropagatedType[];
  scopeIndex: ScopeIndex;
  phaseTimings: Record<string, number>;
}

export interface PipelinePhase {
  name: string;
  run(result: AnalysisResult, enrichment: Partial<PipelineEnrichment>): Promise<Partial<PipelineEnrichment>>;
}

const PHASES: PipelinePhase[] = [
  {
    name: 'scope',
    async run(result) {
      const fnIds = new Map<string, string>();
      for (const f of result.files) {
        for (const fn of f.functions) {
          fnIds.set(`${f.path}::${fn.name}`, `${f.path}:${fn.name}:${fn.line}`);
        }
      }
      return { scopeIndex: buildScopeIndex(result.files, fnIds) };
    },
  },
  {
    name: 'type-propagation',
    async run(result) {
      return { propagatedTypes: propagateTypes(result.files, result.connections) };
    },
  },
  {
    name: 'orm',
    async run(result) {
      const ormQueries: OrmQuery[] = [];
      for (const f of result.files) {
        if (f.content) {
          ormQueries.push(...detectOrmQueries(f.path, f.content));
        }
      }
      return { ormQueries };
    },
  },
];

export async function enrichAnalysis(result: AnalysisResult): Promise<PipelineEnrichment> {
  const enrichment: Partial<PipelineEnrichment> = { phaseTimings: {} };

  for (const phase of PHASES) {
    const t0 = Date.now();
    try {
      const partial = await phase.run(result, enrichment);
      Object.assign(enrichment, partial);
    } catch (e) {
      process.stderr.write(`[pipeline] phase ${phase.name} failed: ${(e as Error).message}\n`);
    }
    enrichment.phaseTimings![phase.name] = Date.now() - t0;
  }

  return enrichment as PipelineEnrichment;
}

export { PHASES };
