declare module 'grasp-mcp-server/dist/analyzer.js' {
  export interface RepoSource {
    type: 'github' | 'local';
    owner?: string;
    repo?: string;
    path?: string;
    token?: string;
  }

  export interface AnalysisResult {
    files: any[];
    dependencies: any[];
    health: number;
    grade: string;
    issues: any[];
    [key: string]: any;
  }

  export function analyzeSource(
    source: RepoSource,
    onProgress?: (msg: string) => void
  ): Promise<AnalysisResult>;

  export function parseSource(target: string, token?: string): Promise<RepoSource>;

  export function buildFileMetrics(result: AnalysisResult): any[];
}
