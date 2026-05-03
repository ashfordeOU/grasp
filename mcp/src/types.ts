// =====================================================================
// GRASP MCP SERVER — Core Type Definitions
// =====================================================================

export interface FunctionDef {
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
  returnType?: string;
}

export interface ClassDef {
  name: string;
  file: string;
  line: number;
  isAbstract: boolean;
  isExported: boolean;
  superClass?: string;
  interfaces: string[];
  methods: string[];      // method names defined in this class
}

export interface AnalyzedFile {
  path: string;
  name: string;
  folder: string;
  content: string | null;
  functions: FunctionDef[];
  lines: number;
  layer: string;
  churn: number;
  isCode: boolean;
  complexity?: number;
  nestingDepth?: number;
  topContributor?: string;   // git log: email of top committer for this file
  contributorCount?: number; // total unique contributors
  workspace?: string;        // monorepo sub-package name (e.g. "packages/api")
  notebookIssues?: string[]; // reproducibility issues for .ipynb files
  imports?: string[];        // import paths referenced by this file
  classes?: ClassDef[];   // class/interface definitions extracted from file
}

export interface Connection {
  source: string;  // file that defines the function
  target: string;  // file that calls the function
  fn: string;
  count: number;
}

export interface Issue {
  type: 'critical' | 'warning' | 'info';
  title: string;
  desc: string;
  items: IssueItem[];
}

export interface IssueItem {
  name: string;
  file?: string;
  files?: string[];
  line?: number;
  fns?: number;
  lines?: number;
  imports?: number;
}

export interface PatternResult {
  name: string;
  icon: string;
  desc: string;
  severity: 'info' | 'warning' | 'critical';
  isAnti?: boolean;
  files: Array<{ name: string; path: string; fns?: number }>;
  metrics: Record<string, number>;
}

export interface SecurityIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  desc: string;
  match?: string;
}

export interface LayerViolation {
  from: string;
  to: string;
  fromLayer: string;
  toLayer: string;
  fn: string;
}

export interface DuplicateResult {
  type: 'name' | 'code';
  name: string;
  count: number;
  files: Array<{ file: string; name?: string; line?: number }>;
  similarity: number;
  suggestion: string;
}

export interface TsconfigInfo {
  configDir: string;          // repo-relative dir containing the tsconfig.json
  baseUrl: string;            // resolved (repo-relative) baseUrl
  paths: Record<string, string[]>;
}

export interface AnalysisResult {
  sessionId: string;
  source: string;        // "owner/repo" or "/local/path"
  sourceType: 'github' | 'gitlab' | 'local' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
  analyzedAt: string;    // ISO timestamp
  files: AnalyzedFile[];
  connections: Connection[];
  issues: Issue[];
  patterns: PatternResult[];
  security: SecurityIssue[];
  duplicates: DuplicateResult[];
  layerViolations: LayerViolation[];
  folders: string[];
  layers: string[];
  summary: AnalysisSummary;
  workspaces?: string[];  // detected monorepo sub-package roots
  deadPackages?: DeadPackage[];  // npm deps declared but never imported
  ciStatus?: string;  // latest CI pipeline status (gitlab: success/failed/running/pending/canceled/unknown)
  tsconfigs?: TsconfigInfo[]; // discovered tsconfig.json path-alias maps
}

export interface AnalysisSummary {
  fileCount: number;
  codeFileCount: number;
  functionCount: number;
  connectionCount: number;
  issueCount: number;
  criticalIssueCount: number;
  circularDepCount: number;
  securityIssueCount: number;
  healthScore: number;
  healthGrade: string;
  layers: string[];
  topFolders: Array<{ name: string; count: number }>;
  languages: Array<{ ext: string; count: number }>;
}

export interface FileMetrics {
  path: string;
  name: string;
  layer: string;
  lines: number;
  functionCount: number;
  complexity: number;
  nestingDepth: number;
  fanIn: number;   // how many files call into this file
  fanOut: number;  // how many files this file calls into
  churn: number;
}

export interface RepoSource {
  type: 'github' | 'gitlab' | 'local' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
  // GitHub / GitHub Enterprise / Gitea (shared fields)
  owner?: string;
  repo?: string;
  token?: string;
  // Local
  path?: string;
  // host is shared by GitLab / GHE / Gitea; namespace + project are GitLab-only
  host?: string;
  namespace?: string;
  project?: string;
  // Bitbucket
  workspace?: string;
  bitbucketUsername?: string;
  bitbucketPassword?: string;
  // Azure DevOps
  azureOrg?: string;
  azurePat?: string;
}

export interface DeadPackage {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
  packageJsonPath: string;
}

export interface RuntimeCallEdge {
  source: string;
  target: string;
  fn: string;
  runtimeCount: number;
  avgDurationMs: number;
}

export interface RuntimeHotFile {
  file: string;
  callCount: number;
  avgDurationMs: number;
}

export interface FileEntry {
  path: string;
  name: string;
  folder: string;
  size?: number;
}
