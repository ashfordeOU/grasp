export function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/[\0\n\r\t]/g, ' ');
}

export type ExecFn = (cypher: string) => Promise<void>;
export type QueryFn = (cypher: string) => Promise<Record<string, any>[]>;
