import crypto from 'crypto';
import { GitHubSource, parseGitHubUrl } from './sources/github.js';
import { LocalSource, isLocalPath, resolveLocalPath, getGitChurn, getGitOwnership } from './sources/local.js';
import type {
  AnalyzedFile,
  AnalysisResult,
  AnalysisSummary,
  Connection,
  FileEntry,
  FileMetrics,
  Issue,
  RepoSource,
} from './types.js';

// parser.js is excluded from tsc (too large for type inference) and copied to dist/ by the build script
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Parser, THRESHOLDS } = require('./parser.js') as {
  Parser: ParserInterface;
  THRESHOLDS: ThresholdsInterface;
};

interface ThresholdsInterface {
  complexityCritical: number;
  complexityHigh: number;
  complexityMedium: number;
  duplicateMinLength: number;
  duplicateSimilarity: number;
  fetchConcurrency: number;
  healthPassScore: number;
  lcsMaxCells: number;
  maxCouplingIn: number;
  maxFunctionsPerFile: number;
  maxSnapshotsStored: number;
}

interface FnDef {
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
}

interface ParserInterface {
  isCode(name: string): boolean;
  isText(name: string): boolean;
  isBinary(name: string): boolean;
  detectLayer(path: string): string;
  extract(content: string, filename: string): FnDef[];
  findCalls(
    content: string,
    fnNames: string[],
    definingFile: string,
    fnDefs: FnDef[],
    precompiledPatterns: unknown
  ): Record<string, number>;
  prepareCallPatterns(fnNames: string[]): unknown;
  detectPatterns(files: AnalyzedFile[]): unknown[];
  detectSecurity(files: AnalyzedFile[]): unknown[];
  detectDuplicates(files: AnalyzedFile[], allFns: FnDef[]): unknown[];
  detectLayerViolations(files: AnalyzedFile[], connections: Connection[]): unknown[];
  calcComplexity(content: string, filePath: string): number;
  calcNestingDepth(content: string): number;
}

const CALL_BATCH = 50;

export async function analyzeSource(
  source: RepoSource,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> {
  const progress = onProgress ?? (() => undefined);
  const sessionId = crypto.randomBytes(8).toString('hex');

  progress('Fetching file tree...');

  // --- Step 1: Get file list ---
  let fileEntries: FileEntry[];
  let fetchContent: (f: FileEntry) => Promise<string | null>;
  let fetchChurn: (f: FileEntry) => Promise<number>;
  let sourceLabel: string;
  let sourceType: 'github' | 'local';
  let localChurnMap: Map<string, number> = new Map();
  let localOwnerMap: Map<string, { topAuthor: string; authorCount: number }> = new Map();

  if (source.type === 'github') {
    const gh = new GitHubSource(source.owner!, source.repo!, source.token);
    sourceLabel = `${source.owner}/${source.repo}`;
    sourceType = 'github';
    fileEntries = await gh.getFileTree();
    fetchContent = (f) => gh.getFileContent(f.path);
    fetchChurn = (f) => gh.getFileCommitCount(f.path, 10);
  } else {
    const local = new LocalSource(source.path!);
    sourceLabel = source.path!;
    sourceType = 'local';
    fileEntries = local.getFileTree();
    fetchContent = async (f) => local.getFileContent(f.path);
    fetchChurn = async () => 0;
    localChurnMap = getGitChurn(source.path!);
    localOwnerMap = getGitOwnership(source.path!);
  }

  // --- Step 2: Filter to code files ---
  const codeFiles = fileEntries.filter((f) => Parser.isCode(f.name));
  const max = codeFiles.length;
  progress(`Found ${fileEntries.length} files (${max} code files). Fetching content...`);

  // --- Step 3: Fetch file contents (parallel) ---
  const analyzed: AnalyzedFile[] = new Array(max);
  const allFns: FnDef[] = [];
  let cursor = 0;
  let completed = 0;
  const CONCURRENCY = source.type === 'local' ? 1 : 20;

  const worker = async () => {
    while (cursor < max) {
      const i = cursor++;
      const f = codeFiles[i];
      try {
        const [content, churn] = await Promise.all([
          fetchContent(f),
          fetchChurn(f).catch(() => 0),
        ]);
        if (content) {
          const fns = Parser.extract(content, f.path);
          const layer = Parser.detectLayer(f.path);
          fns.forEach((fn: FnDef) => {
            allFns.push(Object.assign({}, fn, { folder: f.folder, layer }));
          });
          analyzed[i] = {
            path: f.path,
            name: f.name,
            folder: f.folder,
            content,
            functions: fns,
            lines: content.split('\n').length,
            layer,
            churn,
            isCode: true,
          };
        } else {
          analyzed[i] = {
            path: f.path,
            name: f.name,
            folder: f.folder,
            content: null,
            functions: [],
            lines: 0,
            layer: Parser.detectLayer(f.path),
            churn: 0,
            isCode: false,
          };
        }
      } catch {
        analyzed[i] = {
          path: f.path,
          name: f.name,
          folder: f.folder,
          content: null,
          functions: [],
          lines: 0,
          layer: Parser.detectLayer(f.path),
          churn: 0,
          isCode: false,
        };
      }
      completed++;
      if (completed % 20 === 0 || completed === max) {
        progress(`Fetching files... ${completed}/${max}`);
      }
    }
  };

  if (source.type === 'local') {
    // Synchronous for local
    for (let i = 0; i < max; i++) {
      const f = codeFiles[i];
      const content = await fetchContent(f);
      const churn = localChurnMap.get(f.path) ?? localChurnMap.get(f.name) ?? 0;
      const ownerInfo = localOwnerMap.get(f.path) ?? localOwnerMap.get(f.name);
      if (content) {
        const fns = Parser.extract(content, f.path);
        const layer = Parser.detectLayer(f.path);
        fns.forEach((fn: FnDef) => allFns.push(Object.assign({}, fn, { folder: f.folder, layer })));
        analyzed[i] = { path: f.path, name: f.name, folder: f.folder, content, functions: fns, lines: content.split('\n').length, layer, churn, isCode: true, topContributor: ownerInfo?.topAuthor, contributorCount: ownerInfo?.authorCount };
      } else {
        analyzed[i] = { path: f.path, name: f.name, folder: f.folder, content: null, functions: [], lines: 0, layer: Parser.detectLayer(f.path), churn: 0, isCode: false, topContributor: ownerInfo?.topAuthor, contributorCount: ownerInfo?.authorCount };
      }
      if ((i + 1) % 20 === 0 || i + 1 === max) progress(`Fetching files... ${i + 1}/${max}`);
    }
  } else {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const validFiles = analyzed.filter(Boolean);

  // --- Step 4: Build dependency graph ---
  progress('Building dependency graph (1/4)...');
  const fnNames = [...new Set(allFns.map((f) => f.name))];
  const connections: Connection[] = [];
  const fnStats: Record<string, {
    internal: number; external: number;
    callers: Map<string, { file: string; name: string; count: number }>;
    file: string; folder: string; line: number; code?: string;
    isTopLevel: boolean; isExported: boolean; isClassMethod: boolean;
    type: string; decorators: string[] | null; className: string | null;
  }> = {};

  allFns.forEach((fn) => {
    if (!fnStats[fn.name]) {
      fnStats[fn.name] = {
        internal: 0, external: 0,
        callers: new Map(),
        file: fn.file, folder: fn.folder ?? '', line: fn.line, code: fn.code,
        isTopLevel: fn.isTopLevel !== false,
        isExported: fn.isExported ?? false,
        isClassMethod: fn.isClassMethod ?? false,
        type: fn.type ?? 'function',
        decorators: fn.decorators ?? null,
        className: fn.className ?? null,
      };
    }
  });

  const precompiledCallPatterns = Parser.prepareCallPatterns(fnNames);

  for (let bi = 0; bi < validFiles.length; bi += CALL_BATCH) {
    const batchEnd = Math.min(bi + CALL_BATCH, validFiles.length);
    progress(`Analyzing calls (2/4)... ${batchEnd}/${validFiles.length} files`);
    for (let fi = bi; fi < batchEnd; fi++) {
      const file = validFiles[fi];
      if (!file.content) continue;
      const calls = Parser.findCalls(file.content, fnNames, file.path, allFns, precompiledCallPatterns);
      Object.entries(calls).forEach(([fn, cnt]) => {
        if ((cnt as number) <= 0) return;
        const def = fnStats[fn]?.file ?? null;
        if (def) {
          if (def === file.path) {
            fnStats[fn].internal += cnt as number;
          } else {
            connections.push({ source: def, target: file.path, fn, count: cnt as number });
            const ex = fnStats[fn].callers.get(file.path);
            if (ex) ex.count += cnt as number;
            else fnStats[fn].callers.set(file.path, { file: file.path, name: file.name, count: cnt as number });
            fnStats[fn].external += cnt as number;
          }
        }
      });
    }
  }

  // --- Step 5: Build issues ---
  progress('Detecting issues (3/4)...');
  const issues: Issue[] = [];

  // Dead code
  const deadFns = Object.entries(fnStats).filter(([name, stats]) => {
    if (stats.internal > 0 || stats.external > 0) return false;
    if (stats.isClassMethod) return false;
    if (!stats.isTopLevel) return false;
    if (stats.decorators && stats.decorators.length > 0) return false;
    if (stats.type === 'class' || stats.type === 'dataclass' || stats.type === 'abstract_class') return false;
    const baseName = name.includes('.') ? name.split('.').pop()! : name;
    if (baseName.startsWith('__') && baseName.endsWith('__')) return false;
    if (baseName.startsWith('test_') || ['setUp', 'tearDown', 'setUpClass', 'tearDownClass'].includes(baseName)) return false;
    if (stats.file && (stats.file.includes('test_') || stats.file.includes('_test.') || stats.file.includes('/tests/'))) return false;
    if ((baseName === 'upgrade' || baseName === 'downgrade') && stats.file && (stats.file.includes('migration') || stats.file.includes('alembic'))) return false;
    if (['main', 'create_app', 'make_app', 'get_app', 'setup', 'configure', 'register', 'on_startup', 'on_shutdown', 'lifespan'].includes(baseName)) return false;
    if (stats.isExported && stats.file && /\.[jt]sx?$/.test(stats.file)) return false;
    if (stats.file && (/\.(?:spec|test)\.[jt]sx?$/.test(stats.file) || stats.file.includes('__tests__'))) return false;
    return true;
  });
  if (deadFns.length) {
    issues.push({ type: 'warning', title: `${deadFns.length} Unused Functions`, desc: 'Functions not called from other files', items: deadFns.map(([name, s]) => ({ name, file: s.file, line: s.line })) });
  }

  // God files
  const godFiles = validFiles.filter((f) => f.functions.length > THRESHOLDS.maxFunctionsPerFile);
  if (godFiles.length) {
    issues.push({ type: 'critical', title: `${godFiles.length} Large Files`, desc: `Files with ${THRESHOLDS.maxFunctionsPerFile}+ functions`, items: godFiles.map((f) => ({ name: `${f.name} (${f.functions.length} fns)`, file: f.path, fns: f.functions.length, lines: f.lines })) });
  }

  // High coupling
  const couplingMap: Record<string, number> = {};
  connections.forEach((c) => { couplingMap[c.target] = (couplingMap[c.target] ?? 0) + 1; });
  const highCoupling = Object.entries(couplingMap).filter(([, v]) => v > THRESHOLDS.maxCouplingIn).sort((a, b) => b[1] - a[1]);
  if (highCoupling.length) {
    issues.push({ type: 'warning', title: `${highCoupling.length} Highly Coupled`, desc: `Files imported by ${THRESHOLDS.maxCouplingIn}+ others`, items: highCoupling.map(([file, imports]) => ({ name: `${file.split('/').pop()} (${imports} imports)`, file, imports })) });
  }

  // Circular dependencies (DFS)
  const adjMap: Record<string, string[]> = {};
  connections.forEach((c) => { if (!adjMap[c.source]) adjMap[c.source] = []; adjMap[c.source].push(c.target); });
  const allNodes = Object.keys(adjMap);
  const visited = new Set<string>();
  const circular: string[][] = [];
  const seenCycleKeys = new Set<string>();
  allNodes.forEach((start) => {
    if (visited.has(start)) return;
    const stack = [start];
    const stackSet = new Set([start]);
    const stackPath: Record<string, string | null> = { [start]: null };
    while (stack.length) {
      const node = stack[stack.length - 1];
      const neighbors = adjMap[node] ?? [];
      let pushed = false;
      for (const nb of neighbors) {
        if (stackSet.has(nb)) {
          const cycle: string[] = [];
          let cur: string = node;
          while (cur !== nb) { cycle.unshift(cur); cur = stackPath[cur]!; }
          cycle.unshift(nb);
          const canonical = [...cycle].sort().join('|');
          if (!seenCycleKeys.has(canonical)) { seenCycleKeys.add(canonical); circular.push(cycle); }
        } else if (!visited.has(nb)) {
          stack.push(nb); stackSet.add(nb); stackPath[nb] = node; pushed = true; break;
        }
      }
      if (!pushed) { visited.add(node); stack.pop(); stackSet.delete(node); }
    }
  });
  if (circular.length) {
    issues.push({ type: 'critical', title: `${circular.length} Circular Dependencies`, desc: 'Files in import cycles (including multi-hop)', items: circular.map((cycle) => ({ name: cycle.map((x) => x.split('/').pop()!).join(' → ') + ' → ' + cycle[0].split('/').pop()!, files: cycle })) });
  }

  // --- Step 6: Quality analysis ---
  progress('Running quality analysis (4/4)...');
  const patterns = Parser.detectPatterns(validFiles);
  const security = Parser.detectSecurity(validFiles);
  const duplicates = Parser.detectDuplicates(validFiles, allFns);

  // Complexity
  validFiles.forEach((f) => {
    if (f.content) {
      f.complexity = Parser.calcComplexity(f.content, f.path);
      f.nestingDepth = Parser.calcNestingDepth(f.content);
    }
    // Free content from memory
    f.content = null;
  });

  const layerViolations = Parser.detectLayerViolations(validFiles, connections);

  // --- Step 7: Build summary ---
  const layers = [...new Set(validFiles.map((f) => f.layer))].sort();
  const folders = [...new Set(validFiles.map((f) => f.folder))].sort();

  const folderCounts: Record<string, number> = {};
  validFiles.forEach((f) => { folderCounts[f.folder] = (folderCounts[f.folder] ?? 0) + 1; });
  const topFolders = Object.entries(folderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const langCounts: Record<string, number> = {};
  validFiles.forEach((f) => {
    const ext = f.name.includes('.') ? '.' + f.name.split('.').pop()! : 'unknown';
    langCounts[ext] = (langCounts[ext] ?? 0) + 1;
  });
  const languages = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).map(([ext, count]) => ({ ext, count }));

  const criticalIssueCount = issues.filter((i) => i.type === 'critical').reduce((s, i) => s + i.items.length, 0);
  const circularDepCount = circular.length;
  const securityIssueCount = (security as unknown[]).length;

  const healthScore = computeHealthScore(validFiles, issues, security as unknown[], circular);

  const summary: AnalysisSummary = {
    fileCount: fileEntries.length,
    codeFileCount: validFiles.length,
    functionCount: allFns.length,
    connectionCount: connections.length,
    issueCount: issues.reduce((s, i) => s + i.items.length, 0),
    criticalIssueCount,
    circularDepCount,
    securityIssueCount,
    healthScore,
    healthGrade: scoreToGrade(healthScore),
    layers,
    topFolders,
    languages,
  };

  return {
    sessionId,
    source: sourceLabel,
    sourceType,
    analyzedAt: new Date().toISOString(),
    files: validFiles,
    connections,
    issues,
    patterns: patterns as AnalysisResult['patterns'],
    security: security as AnalysisResult['security'],
    duplicates: duplicates as AnalysisResult['duplicates'],
    layerViolations: layerViolations as AnalysisResult['layerViolations'],
    folders,
    layers,
    summary,
  };
}

function computeHealthScore(
  files: AnalyzedFile[],
  issues: Issue[],
  security: unknown[],
  circular: string[][]
): number {
  let score = 100;
  const codeFiles = files.filter((f) => f.isCode && f.lines > 0);
  if (!codeFiles.length) return 100;

  // Deduct for circular deps
  score -= Math.min(30, circular.length * 5);

  // Deduct for security issues
  score -= Math.min(20, security.length * 4);

  // Deduct for god files
  const godFiles = issues.find((i) => i.title.includes('Large Files'));
  if (godFiles) score -= Math.min(15, godFiles.items.length * 3);

  // Deduct for high coupling
  const coupling = issues.find((i) => i.title.includes('Coupled'));
  if (coupling) score -= Math.min(10, coupling.items.length * 2);

  // Deduct for dead code
  const dead = issues.find((i) => i.title.includes('Unused'));
  if (dead) {
    const pct = dead.items.length / Math.max(1, files.reduce((s, f) => s + f.functions.length, 0));
    score -= Math.min(10, Math.round(pct * 30));
  }

  return Math.max(0, Math.round(score));
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function parseSource(input: string, token?: string): RepoSource | null {
  if (isLocalPath(input)) {
    return { type: 'local', path: resolveLocalPath(input) };
  }
  const gh = parseGitHubUrl(input);
  if (gh) {
    return { type: 'github', owner: gh.owner, repo: gh.repo, token };
  }
  return null;
}

export function buildFileMetrics(result: AnalysisResult): FileMetrics[] {
  const fanIn: Record<string, number> = {};
  const fanOut: Record<string, number> = {};

  result.connections.forEach((c) => {
    // source file "exports" to target — source has fan-out, target has fan-in
    fanOut[c.source] = (fanOut[c.source] ?? 0) + 1;
    fanIn[c.target] = (fanIn[c.target] ?? 0) + 1;
  });

  return result.files.map((f) => ({
    path: f.path,
    name: f.name,
    layer: f.layer,
    lines: f.lines,
    functionCount: f.functions.length,
    complexity: f.complexity ?? 0,
    nestingDepth: f.nestingDepth ?? 0,
    fanIn: fanIn[f.path] ?? 0,
    fanOut: fanOut[f.path] ?? 0,
    churn: f.churn,
  }));
}

export function findDependencyPath(
  from: string,
  to: string,
  connections: Connection[]
): string[] | null {
  // BFS through the connection graph
  const adj: Record<string, string[]> = {};
  connections.forEach((c) => {
    if (!adj[c.source]) adj[c.source] = [];
    if (!adj[c.source].includes(c.target)) adj[c.source].push(c.target);
  });

  if (!adj[from]) return null;

  const queue: string[][] = [[from]];
  const visited = new Set<string>([from]);

  while (queue.length) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    for (const neighbor of adj[node] ?? []) {
      if (neighbor === to) return [...path, neighbor];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
}
