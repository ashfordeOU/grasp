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
  extractDefinitions(tree: import('tree-sitter').Tree, source: string, filename: string): FnDef[];
  countCalls(tree: import('tree-sitter').Tree, fnNames: Set<string>): Record<string, number>;
}
