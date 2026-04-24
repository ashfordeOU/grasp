export interface FnDef {
  name: string;
  file: string;
  line: number;
  code?: string;
  isTopLevel?: boolean;
  isExported?: boolean;
  isClassMethod?: boolean;
  type?: string;
  decorators?: string[] | null;
  className?: string | null;
  folder?: string;
  layer?: string;
  astBacked?: boolean;
}

export interface Extractor {
  /** Caller must call tree.delete() after this returns. */
  extractDefinitions(tree: import('tree-sitter').Tree, source: string, filename: string): FnDef[];
  /** Caller must call tree.delete() after this returns. */
  countCalls(tree: import('tree-sitter').Tree, fnNames: Set<string>): Record<string, number>;
}
