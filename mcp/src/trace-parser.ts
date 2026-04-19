export interface TraceEdge { file: string; calls: number }

export function parseGraspTrace(json: string): TraceEdge[] {
  const data = JSON.parse(json);
  if (Array.isArray(data)) return data.map((e: any) => ({ file: e.file, calls: e.count ?? 1 }));
  return [];
}

export function parseOtelTrace(json: string): TraceEdge[] {
  const data = JSON.parse(json);
  const edgeMap = new Map<string, number>();
  for (const rs of data.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const filepath = span.attributes?.find((a: any) => a.key === 'code.filepath')?.value?.stringValue;
        if (filepath) edgeMap.set(filepath, (edgeMap.get(filepath) ?? 0) + 1);
      }
    }
  }
  return Array.from(edgeMap.entries()).map(([file, calls]) => ({ file, calls }));
}

export function parseAnyTrace(json: string): TraceEdge[] {
  try {
    const data = JSON.parse(json);
    if (data.resourceSpans) return parseOtelTrace(json);
    return parseGraspTrace(json);
  } catch { return []; }
}
