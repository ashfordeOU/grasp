export function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/[\0\n\r\t]/g, ' ');
}

export type WriteCypherFn = (cypher: string) => Promise<void>;
export type ReadCypherFn = (cypher: string) => Promise<Record<string, any>[]>;
