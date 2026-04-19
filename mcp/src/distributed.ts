export interface ServiceCall  { to: string; count: number }
export interface ServiceTrace { service: string; calls: ServiceCall[] }
export interface ServiceEdge  { from: string; to: string; weight: number }
export interface ServiceGraph { services: string[]; edges: ServiceEdge[] }

export function buildServiceGraph(traces: ServiceTrace[]): ServiceGraph {
  const services = [...new Set(traces.map(t => t.service))];
  const edges: ServiceEdge[] = [];
  for (const trace of traces) {
    for (const call of trace.calls) {
      edges.push({ from: trace.service, to: call.to, weight: call.count });
    }
  }
  return { services, edges };
}
