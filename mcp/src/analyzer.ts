import crypto from 'crypto';
import path from 'path';
import { GitHubSource, parseGitHubUrl, parseGitHubEnterpriseUrl } from './sources/github.js';
import { BitbucketSource } from './sources/bitbucket.js';
import { AzureSource } from './sources/azure.js';
import { GiteaSource } from './sources/gitea.js';
import { LocalSource, isLocalPath, resolveLocalPath, getGitChurn, getGitOwnership, detectWorkspaces, fileWorkspace } from './sources/local.js';
import { isGitLabSource, normalizeGitLabUrl, fetchGitLabTree, fetchGitLabChurn, fetchGitLabCiStatus } from './sources/gitlab.js';
import { findDeadPackages } from './dead-packages.js';
import { parseGoImports } from './parsers/go.js';
import { parseRustImports } from './parsers/rust.js';
import { parseJavaImports } from './parsers/java.js';
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

export type ProgressCallback = (done: number, total: number, file: string) => void;
export type SourceSpec = RepoSource;

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
  returnType?: string;
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
  parseNotebook(content: string): { content: string; issues: string[]; codeCellCount: number } | null;
  preloadGrammars(filePaths: string[]): Promise<void>;
}

// Per-extension regex for class/struct heritage extraction
const HERITAGE_RE: Record<string, RegExp> = {
  '.ts':  /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s<>]+))?\s*\{/g,
  '.tsx': /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s<>]+))?\s*\{/g,
  '.js':  /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g,
  '.jsx': /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g,
  '.py':  /class\s+(\w+)(?:\(([^)]*)\))?\s*:/g,
  '.java':/(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g,
  '.kt':  /(?:open\s+|abstract\s+|data\s+|sealed\s+)?class\s+(\w+)(?:\s*:\s*([\w,\s<>()]+))?\s*[({]/g,
  '.cs':  /(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s*:\s*([\w,\s]+))?\s*\{/g,
  '.rb':  /class\s+(\w+)(?:\s*<\s*(\w+))?\s*$/gm,
  '.go':  /type\s+(\w+)\s+struct\s*\{/g,
  '.rs':  /(?:pub\s+)?struct\s+(\w+)\s*[{(;]/g,
};

function extractClassDefs(
  filePath: string,
  content: string,
  fns: Array<{ name: string; isClassMethod?: boolean; className?: string | null }>,
): import('./types.js').ClassDef[] {
  const ext = path.extname(filePath).toLowerCase();
  const re = HERITAGE_RE[ext];
  if (!re || !content) return [];

  const methodsForClass = new Map<string, string[]>();
  for (const fn of fns) {
    if (fn.isClassMethod && fn.className) {
      if (!methodsForClass.has(fn.className)) methodsForClass.set(fn.className, []);
      methodsForClass.get(fn.className)!.push(fn.name);
    }
  }

  const classes: import('./types.js').ClassDef[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    if (!name) continue;
    const lineNum = content.slice(0, m.index).split('\n').length;
    const fragment = m[0];
    const isAbstract = /\babstract\b/.test(fragment);
    const isExported = /\bexport\b/.test(fragment) || ['.java', '.kt', '.cs'].includes(ext);

    let superClass: string | undefined;
    let interfaces: string[] = [];

    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      superClass = m[2]?.trim() || undefined;
      interfaces = (m[3] ?? '').split(',').map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    } else if (ext === '.py') {
      const bases = (m[2] ?? '').split(',').map(s => s.trim()).filter(s => s && s !== 'object');
      superClass = bases[0] || undefined;
      interfaces = bases.slice(1);
    } else if (ext === '.java' || ext === '.cs') {
      superClass = m[2]?.trim() || undefined;
      interfaces = (m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    } else if (ext === '.rb') {
      superClass = m[2]?.trim() || undefined;
    } else if (ext === '.kt') {
      const bases = (m[2] ?? '').split(',').map(s => s.trim().replace(/\(.*\)/, '').trim()).filter(Boolean);
      superClass = bases[0] || undefined;
      interfaces = bases.slice(1);
    }
    // go/rs: struct has no heritage in the simple sense, just record the name

    classes.push({
      name,
      file: filePath,
      line: lineNum,
      isAbstract,
      isExported,
      superClass,
      interfaces,
      methods: methodsForClass.get(name) ?? [],
    });
  }
  return classes;
}

const CALL_BATCH = 50;

export async function analyzeSource(
  source: SourceSpec,
  token?: string | ((msg: string) => void),
  onProgress?: ProgressCallback,
): Promise<AnalysisResult> {
  // Back-compat: if second arg is a function it's the old single-arg progress callback
  let legacyProgress: ((msg: string) => void) | undefined;
  if (typeof token === 'function') {
    legacyProgress = token;
  } else if (typeof token === 'string' && source.type === 'github' && !source.token) {
    (source as RepoSource).token = token;
  }
  const fileProgressCb = onProgress;
  const progress = legacyProgress ?? (() => undefined);
  const sessionId = crypto.randomBytes(8).toString('hex');

  progress('Fetching file tree...');

  // --- Step 1: Get file list ---
  let fileEntries: FileEntry[];
  let fetchContent: (f: FileEntry) => Promise<string | null>;
  let fetchChurn: (f: FileEntry) => Promise<number>;
  let sourceLabel: string;
  let sourceType: 'github' | 'gitlab' | 'local' | 'bitbucket' | 'azure' | 'gitea' | 'github-enterprise';
  let localChurnMap: Map<string, number> = new Map();
  let localOwnerMap: Map<string, { topAuthor: string; authorCount: number }> = new Map();
  let localWorkspaces: string[] = [];
  let glSrcRef: { host: string; namespace: string; project: string; token?: string } | undefined;

  if (source.type === 'gitlab') {
    const glSrc = { host: source.host!, namespace: source.namespace!, project: source.project!, token: source.token };
    glSrcRef = glSrc;
    sourceLabel = `${source.namespace}/${source.project}`;
    sourceType = 'gitlab';
    const glFiles = await fetchGitLabTree(glSrc);
    const glMap = new Map(glFiles.map(f => [f.path, f.content]));
    fileEntries = glFiles.map(f => ({ path: f.path, name: f.path.split('/').pop()!, folder: f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '' }));
    fetchContent = async (f) => glMap.get(f.path) ?? null;
    fetchChurn = (f) => fetchGitLabChurn(glSrc, f.path, 10);
  } else if (source.type === 'github') {
    const gh = new GitHubSource(source.owner!, source.repo!, source.token);
    sourceLabel = `${source.owner}/${source.repo}`;
    sourceType = 'github';
    fileEntries = await gh.getFileTree();
    fetchContent = (f) => gh.getFileContent(f.path);
    fetchChurn = (f) => gh.getFileCommitCount(f.path, 10);
  } else if (source.type === 'bitbucket') {
    const bb = new BitbucketSource(
      source.workspace!, source.repo!,
      source.bitbucketUsername!, source.bitbucketPassword!
    );
    sourceLabel = `${source.workspace}/${source.repo}`;
    sourceType = 'bitbucket';
    fileEntries = await bb.getFileTree();
    fetchContent = (f) => bb.getFileContent(f.path).then(c => c).catch(() => null);
    fetchChurn = async () => 0;
  } else if (source.type === 'azure') {
    const az = new AzureSource(
      source.azureOrg!, source.project!, source.repo!, source.azurePat!
    );
    sourceLabel = `${source.azureOrg}/${source.project}/${source.repo}`;
    sourceType = 'azure';
    fileEntries = await az.getFileTree();
    fetchContent = (f) => az.getFileContent(f.path).then(c => c).catch(() => null);
    fetchChurn = async () => 0;
  } else if (source.type === 'gitea') {
    const gt = new GiteaSource(
      source.host!, source.owner!, source.repo!, source.token
    );
    sourceLabel = `${source.owner}/${source.repo}`;
    sourceType = 'gitea';
    fileEntries = await gt.getFileTree();
    fetchContent = (f) => gt.getFileContent(f.path).then(c => c).catch(() => null);
    fetchChurn = async () => 0;
  } else if (source.type === 'github-enterprise') {
    const gh = new GitHubSource(
      source.owner!, source.repo!, source.token,
      `https://${source.host}/api/v3`
    );
    sourceLabel = `${source.owner}/${source.repo}`;
    sourceType = 'github-enterprise';
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
    localWorkspaces = detectWorkspaces(source.path!);
  }

  // --- Step 2: Filter to code files ---
  const codeFiles = fileEntries.filter((f) => Parser.isCode(f.name));
  await Parser.preloadGrammars(codeFiles.map((f) => f.path));
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
          let processedContent = content;
          let notebookIssues: string[] | undefined;
          if (f.path.endsWith('.ipynb')) {
            const nb = Parser.parseNotebook(content);
            if (nb) { processedContent = nb.content; notebookIssues = nb.issues; }
          }
          const fns = Parser.extract(processedContent, f.path);
          const layer = Parser.detectLayer(f.path);
          fns.forEach((fn: FnDef) => {
            allFns.push(Object.assign({}, fn, { folder: f.folder, layer }));
          });
          const classes = extractClassDefs(f.path, processedContent, fns);
          analyzed[i] = {
            path: f.path,
            name: f.name,
            folder: f.folder,
            content: processedContent,
            functions: fns,
            lines: processedContent.split('\n').length,
            layer,
            churn,
            isCode: true,
            notebookIssues,
            classes: classes.length > 0 ? classes : undefined,
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
      fileProgressCb?.(completed, max, codeFiles[i].path);
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
        let processedContent = content;
        let notebookIssues: string[] | undefined;
        if (f.path.endsWith('.ipynb')) {
          const nb = Parser.parseNotebook(content);
          if (nb) { processedContent = nb.content; notebookIssues = nb.issues; }
        }
        const fns = Parser.extract(processedContent, f.path);
        const layer = Parser.detectLayer(f.path);
        fns.forEach((fn: FnDef) => allFns.push(Object.assign({}, fn, { folder: f.folder, layer })));
        const ws = localWorkspaces.length > 0 ? fileWorkspace(f.path, localWorkspaces) : undefined;
        const localClasses = extractClassDefs(f.path, processedContent, fns);
        analyzed[i] = { path: f.path, name: f.name, folder: f.folder, content: processedContent, functions: fns, lines: processedContent.split('\n').length, layer, churn, isCode: true, topContributor: ownerInfo?.topAuthor, contributorCount: ownerInfo?.authorCount, workspace: ws, notebookIssues, classes: localClasses.length > 0 ? localClasses : undefined };
      } else {
        const ws = localWorkspaces.length > 0 ? fileWorkspace(f.path, localWorkspaces) : undefined;
        analyzed[i] = { path: f.path, name: f.name, folder: f.folder, content: null, functions: [], lines: 0, layer: Parser.detectLayer(f.path), churn: 0, isCode: false, topContributor: ownerInfo?.topAuthor, contributorCount: ownerInfo?.authorCount, workspace: ws };
      }
      if ((i + 1) % 20 === 0 || i + 1 === max) progress(`Fetching files... ${i + 1}/${max}`);
      fileProgressCb?.(i + 1, max, codeFiles[i].path);
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

  // Build JS/TS import map to filter false-positive function-call connections.
  // Key: file path. Value: set of canonical (extension-stripped) paths that file imports.
  const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);
  const LANG_FAMILY: Record<string, string> = {
    '.ts': 'js', '.tsx': 'js', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
    '.kt': 'jvm', '.kts': 'jvm', '.java': 'jvm',
    '.lua': 'lua', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.swift': 'swift', '.py': 'python',
    '.sh': 'shell', '.bash': 'shell',
  };
  const langFamilyOf = (fp: string): string => {
    const ext = fp.includes('.') ? '.' + fp.split('.').pop()! : '';
    return LANG_FAMILY[ext] ?? 'other';
  };
  // Simple path resolver that handles ./ and ../ without OS-specific separators
  const resolvePath = (dir: string, rel: string): string => {
    const parts = (dir ? dir + '/' + rel : rel).split('/');
    const out: string[] = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p !== '.') out.push(p);
    }
    return out.join('/');
  };
  const stripExt = (p: string): string => p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');

  const jstsImportMap = new Map<string, Set<string>>();
  for (const file of validFiles) {
    if (!file.content) continue;
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()! : '';
    if (!JS_TS_EXTS.has(ext)) continue;
    const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
    const imported = new Set<string>();
    for (const line of file.content.split('\n')) {
      const m = line.match(/from\s+['"]([^'"]+)['"]/);
      const r = m?.[1] ?? line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1];
      if (!r || !r.startsWith('.')) continue;
      imported.add(stripExt(resolvePath(dir, r)));
    }
    jstsImportMap.set(file.path, imported);
  }

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
            // Filter out false-positive cross-file connections.
            // For JS/TS: only allow when the calling file explicitly imports from the source file.
            // For other languages: only allow within the same language family and top-level package.
            const callerExt = file.path.includes('.') ? '.' + file.path.split('.').pop()! : '';
            let allow = false;
            if (JS_TS_EXTS.has(callerExt)) {
              const callerImports = jstsImportMap.get(file.path);
              if (callerImports) allow = callerImports.has(stripExt(def));
            } else {
              // For non-JS/TS languages, use language family + package root filtering.
              // JVM (Kotlin, Java) has dedicated import parsers or is too noisy for name-matching.
              const defFamily = langFamilyOf(def);
              const callerFamily = langFamilyOf(file.path);
              const defPkg = def.split('/')[0] ?? '';
              const callerPkg = file.path.split('/')[0] ?? '';
              const NAME_MATCH_OK = new Set(['lua', 'go', 'rust', 'ruby', 'swift', 'python', 'shell']);
              allow = defFamily === callerFamily && defPkg === callerPkg && NAME_MATCH_OK.has(defFamily);
            }
            if (allow) {
              connections.push({ source: def, target: file.path, fn, count: cnt as number });
              const ex = fnStats[fn].callers.get(file.path);
              if (ex) ex.count += cnt as number;
              else fnStats[fn].callers.set(file.path, { file: file.path, name: file.name, count: cnt as number });
              fnStats[fn].external += cnt as number;
            }
          }
        }
      });
    }
  }

  // --- Step 4b: Structured import parsing for Go / Rust / Java ---
  for (const file of validFiles) {
    if (!file.content) continue;
    const filePath = file.path;
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()! : '';

    if (ext === '.go') {
      const goParsed = parseGoImports(file.content, filePath);
      for (const imp of goParsed.imports) {
        if (imp.stdlib) continue;
        const target = imp.internal && imp.localPath
          ? path.resolve(path.dirname(filePath), imp.localPath)
          : imp.path;
        connections.push({ source: target, target: filePath, fn: imp.alias ?? imp.path, count: 1 });
      }
    } else if (ext === '.rs') {
      const rsParsed = parseRustImports(file.content, filePath);
      for (const imp of rsParsed.imports) {
        if (imp.stdlib) continue;
        connections.push({ source: imp.module, target: filePath, fn: imp.path, count: 1 });
      }
      for (const submod of rsParsed.submodules) {
        const subPath = path.join(path.dirname(filePath), submod + '.rs');
        connections.push({ source: subPath, target: filePath, fn: submod, count: 1 });
      }
    } else if (ext === '.java') {
      const javaParsed = parseJavaImports(file.content, filePath);
      for (const imp of javaParsed.imports) {
        if (imp.stdlib || imp.wildcard) continue;
        const dep = imp.package + '.' + imp.className;
        connections.push({ source: dep, target: filePath, fn: imp.className, count: 1 });
      }
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
    if (stats.type === 'class' || stats.type === 'dataclass' || stats.type === 'abstract_class' || stats.type === 'interface' || stats.type === 'type') return false;
    const baseName = name.includes('.') ? name.split('.').pop()! : name;
    if (baseName.startsWith('__') && baseName.endsWith('__')) return false;
    if (baseName.startsWith('test_') || ['setUp', 'tearDown', 'setUpClass', 'tearDownClass'].includes(baseName)) return false;
    if (stats.file && (stats.file.includes('test_') || stats.file.includes('_test.') || stats.file.includes('/tests/'))) return false;
    if ((baseName === 'upgrade' || baseName === 'downgrade') && stats.file && (stats.file.includes('migration') || stats.file.includes('alembic'))) return false;
    if (['main', 'create_app', 'make_app', 'get_app', 'setup', 'configure', 'register', 'on_startup', 'on_shutdown', 'lifespan'].includes(baseName)) return false;
    if (stats.isExported && stats.file && /\.[jt]sx?$/.test(stats.file)) return false;
    if (stats.file && (/\.(?:spec|test)\.[jt]sx?$/.test(stats.file) || stats.file.includes('__tests__'))) return false;
    // Browser-injected scripts (content scripts, popup scripts) are called by the browser, not imported
    if (stats.file && (stats.file.includes('browser-extension') || stats.file.includes('safari-extension') || stats.file.includes('content.') || stats.file.includes('background.') || stats.file.includes('popup.'))) return false;
    return true;
  });
  if (deadFns.length) {
    issues.push({ type: 'warning', title: `${deadFns.length} Unused Functions`, desc: 'Functions not called from other files', items: deadFns.map(([name, s]) => ({ name, file: s.file, line: s.line })) });
  }

  // God files — exempt files named index.* (structural MCP/app entry points)
  const ENTRY_POINT_RE = /^index\.[jt]sx?$/i;
  const godFiles = validFiles.filter((f) =>
    f.functions.length > THRESHOLDS.maxFunctionsPerFile && !ENTRY_POINT_RE.test(f.name)
  );
  if (godFiles.length) {
    issues.push({ type: 'critical', title: `${godFiles.length} Large Files`, desc: `Files with ${THRESHOLDS.maxFunctionsPerFile}+ functions`, items: godFiles.map((f) => ({ name: `${f.name} (${f.functions.length} fns)`, file: f.path, fns: f.functions.length, lines: f.lines })) });
  }

  // High coupling — exempt entry-point files and known structural hubs
  const COUPLING_EXEMPT_RE = /^(?:index|analyzer|types)\.[jt]sx?$/i;
  const couplingMap: Record<string, number> = {};
  connections.forEach((c) => { couplingMap[c.target] = (couplingMap[c.target] ?? 0) + 1; });
  const highCoupling = Object.entries(couplingMap)
    .filter(([file, v]) => v > THRESHOLDS.maxCouplingIn && !COUPLING_EXEMPT_RE.test(file.split('/').pop() ?? ''))
    .sort((a, b) => b[1] - a[1]);
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
  // Build content map for dead-package detection before freeing memory
  const codeContentMap = new Map<string, string>(
    validFiles.filter(f => f.content).map(f => [f.path, f.content!])
  );

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

  // --- Dead package detection ---
  progress('Scanning for unused dependencies...');
  const deadPackages = await findDeadPackages(fileEntries, codeContentMap, (path) => fetchContent({ path, name: path.split('/').pop()!, folder: '' }), codeContentMap);
  if (deadPackages.length > 0) {
    issues.push({
      type: 'warning',
      title: `${deadPackages.length} Unused ${deadPackages.length === 1 ? 'Dependency' : 'Dependencies'}`,
      desc: 'Packages declared in package.json but never imported by any code file',
      items: deadPackages.map(p => ({
        name: `${p.name}@${p.version} (${p.type === 'devDependency' ? 'dev' : 'prod'})`,
        file: p.packageJsonPath,
      })),
    });
  }

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

  const ciStatus = glSrcRef ? await fetchGitLabCiStatus(glSrcRef) : undefined;

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
    ...(localWorkspaces.length > 0 ? { workspaces: localWorkspaces } : {}),
    ...(deadPackages.length > 0 ? { deadPackages } : {}),
    ...(ciStatus !== undefined ? { ciStatus } : {}),
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

export { THRESHOLDS };

function parseBitbucketUrl(input: string): { workspace: string; repo: string } | null {
  const m = input.match(
    /(?:https?:\/\/)?bitbucket\.org\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
  );
  return m ? { workspace: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

function parseAzureUrl(
  input: string
): { org: string; project: string; repo: string } | null {
  const m1 = input.match(
    /(?:https?:\/\/)?dev\.azure\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i
  );
  if (m1) return { org: m1[1], project: m1[2], repo: m1[3].replace(/\.git$/, '') };
  const m2 = input.match(
    /(?:https?:\/\/)?([a-zA-Z0-9_-]+)\.visualstudio\.com\/([a-zA-Z0-9_.-]+)\/_git\/([a-zA-Z0-9_.-]+)/i
  );
  if (m2) return { org: m2[1], project: m2[2], repo: m2[3].replace(/\.git$/, '') };
  return null;
}

function parseGiteaUrl(
  input: string
): { host: string; owner: string; repo: string } | null {
  const m = input.match(
    /(?:https?:\/\/)?([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
  );
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (
    host.includes('github') ||
    host.includes('gitlab') ||
    host.includes('bitbucket') ||
    host === 'dev.azure.com' ||
    host.endsWith('.visualstudio.com')
  )
    return null;
  return { host: `https://${m[1]}`, owner: m[2], repo: m[3].replace(/\.git$/, '') };
}

export function parseSource(
  input: string,
  token?: string,
  gitlabToken?: string,
  gitlabHost?: string,
  extra?: {
    gheToken?: string;
    gheHost?: string;
    bbUsername?: string;
    bbPassword?: string;
    azurePat?: string;
    giteaToken?: string;
    giteaHost?: string;
  }
): RepoSource | null {
  if (isLocalPath(input)) {
    return { type: 'local', path: resolveLocalPath(input) };
  }
  if (isGitLabSource(input)) {
    const gl = normalizeGitLabUrl(input);
    if (gl) {
      const glToken = gitlabToken ?? token ?? process.env['GITLAB_TOKEN'];
      const resolvedHost = gitlabHost ?? gl.host;
      return { type: 'gitlab', host: resolvedHost, namespace: gl.namespace, project: gl.project, token: glToken };
    }
  }
  const bb = parseBitbucketUrl(input);
  if (bb) {
    return {
      type: 'bitbucket',
      workspace: bb.workspace,
      repo: bb.repo,
      bitbucketUsername: extra?.bbUsername ?? process.env['BITBUCKET_USERNAME'],
      bitbucketPassword: extra?.bbPassword ?? process.env['BITBUCKET_PASSWORD'],
    };
  }
  const az = parseAzureUrl(input);
  if (az) {
    return {
      type: 'azure',
      azureOrg: az.org,
      project: az.project,
      repo: az.repo,
      azurePat: extra?.azurePat ?? process.env['AZURE_DEVOPS_PAT'],
    };
  }
  const ghe = parseGitHubEnterpriseUrl(input);
  if (ghe) {
    return {
      type: 'github-enterprise',
      host: extra?.gheHost ?? ghe.host,
      owner: ghe.owner,
      repo: ghe.repo,
      token: extra?.gheToken ?? process.env['GHE_TOKEN'],
    };
  }
  const gt = parseGiteaUrl(input);
  if (gt) {
    return {
      type: 'gitea',
      host: extra?.giteaHost ?? gt.host,
      owner: gt.owner,
      repo: gt.repo,
      token: extra?.giteaToken ?? process.env['GITEA_TOKEN'],
    };
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
    functionCount: f.functions?.length ?? 0,
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

export interface OrgRepoSummary {
  repo: string;
  healthScore: number;
  healthGrade: string;
  fileCount: number;
  securityIssues: number;
  languages: string[];
}

export interface OrgSummary {
  org: string;
  repo_count: number;
  analyzed_count: number;
  overall_health_grade: string;
  grade_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  repos_by_health: OrgRepoSummary[];
  top_churn_files: Array<{ file: string; repo: string; churn: number }>;
}

async function fetchOrgRepos(org: string, token?: string): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'grasp-mcp-server',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const repos: string[] = [];
  let page = 1;
  while (repos.length < 500) {
    const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&sort=stars&direction=desc&type=public`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
    const data = await resp.json() as Array<{ full_name: string; archived: boolean }>;
    if (data.length === 0) break;
    for (const r of data) if (!r.archived) repos.push(r.full_name);
    if (data.length < 100) break;
    page++;
  }
  return repos.slice(0, 500);
}

export async function analyzeOrg(
  org: string,
  token?: string,
  concurrency = 5,
  maxRepos = 20,
): Promise<OrgSummary> {
  const allRepos = await fetchOrgRepos(org, token);
  const batch = allRepos.slice(0, maxRepos);
  const results: OrgRepoSummary[] = [];
  const churnAll: Array<{ file: string; repo: string; churn: number }> = [];

  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map(async (repoName) => {
      const src = parseSource(repoName, token);
      if (!src) return null;
      const result = await analyzeSource(src, () => {});
      const langs = Array.from(new Set(result.files.map(f => f.language).filter((l): l is string => Boolean(l))));
      for (const f of result.files) {
        const churn = (f as any).churn ?? 0;
        if (churn > 0) churnAll.push({ file: f.path, repo: repoName, churn });
      }
      return {
        repo: repoName,
        healthScore: result.summary.healthScore,
        healthGrade: result.summary.healthGrade,
        fileCount: result.summary.fileCount,
        securityIssues: result.security.length,
        languages: langs,
      } as OrgRepoSummary;
    }));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
    }
  }

  const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const gradeDist: Record<string, number> = {};
  const langDist: Record<string, number> = {};
  let totalPoints = 0;
  for (const r of results) {
    gradeDist[r.healthGrade] = (gradeDist[r.healthGrade] ?? 0) + 1;
    totalPoints += gradePoints[r.healthGrade] ?? 3;
    for (const lang of r.languages) langDist[lang] = (langDist[lang] ?? 0) + 1;
  }
  const avg = results.length > 0 ? totalPoints / results.length : 3;
  const overallGrade = avg >= 4.5 ? 'A' : avg >= 3.5 ? 'B' : avg >= 2.5 ? 'C' : avg >= 1.5 ? 'D' : 'F';

  return {
    org,
    repo_count: allRepos.length,
    analyzed_count: results.length,
    overall_health_grade: overallGrade,
    grade_distribution: gradeDist,
    language_distribution: langDist,
    repos_by_health: results.sort((a, b) => b.healthScore - a.healthScore),
    top_churn_files: churnAll.sort((a, b) => b.churn - a.churn).slice(0, 10),
  };
}
