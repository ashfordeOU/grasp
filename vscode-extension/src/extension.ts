import * as vscode from 'vscode';
import * as path from 'path';

// =====================================================================
// Grasp VS Code Extension
//
// Provides a sidebar webview panel that shows the dependency graph for
// the currently open workspace, auto-panning to the active file.
// =====================================================================

export function activate(context: vscode.ExtensionContext) {
  // Status bar item — shows health score + file deps
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'grasp.openPanel';
  statusBar.tooltip = 'Grasp — click to open dependency graph';
  context.subscriptions.push(statusBar);

  // Diagnostics collection — surfaces arch violations + security issues in Problems panel
  const diagnostics = vscode.languages.createDiagnosticCollection('grasp');
  context.subscriptions.push(diagnostics);

  // Register sidebar webview view
  const provider = new GraspViewProvider(context.extensionUri, statusBar, diagnostics);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GraspViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Command: open panel (focus sidebar)
  context.subscriptions.push(
    vscode.commands.registerCommand('grasp.openPanel', () => {
      vscode.commands.executeCommand('grasp.panel.focus');
    })
  );

  // Command: re-analyse workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('grasp.analyzeWorkspace', () => {
      provider.triggerAnalysis();
    })
  );

  // Command: show file in graph (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('grasp.analyzeFile', (uri?: vscode.Uri) => {
      const fsPath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!fsPath) return;
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!ws) return;
      const rel = path.relative(ws, fsPath).replace(/\\/g, '/');
      vscode.commands.executeCommand('grasp.panel.focus');
      setTimeout(() => provider.highlightFile(fsPath), 300);
      vscode.window.showInformationMessage(`Grasp: focusing on ${rel}`);
    })
  );

  // Auto-pan to active file on editor change + update status bar
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        if (vscode.workspace.getConfiguration('grasp').get('highlightActiveFile')) {
          provider.highlightFile(editor.document.uri.fsPath);
        }
        provider.updateStatusBar(editor.document.uri.fsPath);
      }
    })
  );

  // File watcher — auto re-analyze on save
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,cs}');
  let watchDebounce: ReturnType<typeof setTimeout> | null = null;
  const onFileChange = () => {
    if (!vscode.workspace.getConfiguration('grasp').get('watchFiles')) return;
    if (watchDebounce) clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => provider.triggerAnalysis(), 2000);
  };
  context.subscriptions.push(
    fileWatcher.onDidChange(onFileChange),
    fileWatcher.onDidCreate(onFileChange),
    fileWatcher.onDidDelete(onFileChange),
    fileWatcher
  );

  // Hover provider — inline dep count and hotspot indicator
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['javascript','typescript','python','go','java','rust','ruby','php','c','cpp','csharp'],
      {
        provideHover(document, _position, _token) {
          const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!ws) return;
          const rel = path.relative(ws, document.uri.fsPath).replace(/\\/g, '/');
          const analysisData = provider.getLastAnalysis() as any;
          if (!analysisData) return;
          const deps = analysisData.connections?.filter((c: any) => c.source === rel).length ?? 0;
          const dependents = analysisData.connections?.filter((c: any) => c.target === rel).length ?? 0;
          const hotspot = dependents >= 10 ? ' 🔥 hotspot' : '';
          const md = new vscode.MarkdownString(
            `**Grasp** · \`${rel}\`\n\n` +
            `↑ ${deps} imports · ↓ ${dependents} dependents${hotspot}`
          );
          md.isTrusted = true;
          return new vscode.Hover(md);
        },
      }
    )
  );

  // Auto-analyze on startup
  if (vscode.workspace.getConfiguration('grasp').get('autoAnalyze')) {
    provider.triggerAnalysis();
  }
}

export function deactivate() {}

// =====================================================================
// GraspViewProvider — sidebar webview panel
// =====================================================================
class GraspViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'grasp.panel';
  private _view?: vscode.WebviewView;
  private _analysisResult: any = null;
  private lastAnalysis: unknown = null;
  getLastAnalysis(): unknown { return this.lastAnalysis; }

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: vscode.StatusBarItem,
    private readonly _diagnostics: vscode.DiagnosticCollection
  ) {}

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    const cfg = vscode.workspace.getConfiguration('grasp');
    view.webview.html = this._getHtml(view.webview, cfg.get('defaultColorMode') ?? 'layer');

    // Handle messages from webview
    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'openFile') {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (ws) {
          const fullPath = path.join(ws, msg.path);
          vscode.workspace.openTextDocument(fullPath).then(doc => {
            vscode.window.showTextDocument(doc);
          }, () => {
            vscode.window.showWarningMessage(`Cannot open: ${msg.path}`);
          });
        }
      }
      if (msg.type === 'ready') {
        this.triggerAnalysis();
      }
      if (msg.type === 'analyzeWorkspace') {
        this.triggerAnalysis();
      }
    });
  }

  async triggerAnalysis() {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return;

    this._view?.webview.postMessage({ type: 'status', text: 'Analysing…' });

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { analyzeSource } = require('grasp-mcp-server/dist/analyzer.js') as typeof import('grasp-mcp-server/dist/analyzer.js');
      const result = await (analyzeSource as any)(
        { type: 'local', path: ws },
        (msg: string) => this._view?.webview.postMessage({ type: 'status', text: msg })
      );
      this._analysisResult = result;
      this.lastAnalysis = result;
      this._view?.webview.postMessage({ type: 'analysis', data: result });

      // Update status bar + diagnostics
      const active = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (active) this.updateStatusBar(active);
      this.updateDiagnostics(ws, result);
    } catch (err: any) {
      this._view?.webview.postMessage({ type: 'error', text: err.message });
    }
  }

  highlightFile(fsPath: string) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return;
    const rel = path.relative(ws, fsPath).replace(/\\/g, '/');
    this._view?.webview.postMessage({ type: 'highlightFile', path: rel });
  }

  updateStatusBar(fsPath: string) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws || !this._analysisResult) {
      this._statusBar.hide();
      return;
    }
    const rel = path.relative(ws, fsPath).replace(/\\/g, '/');
    const files: any[] = this._analysisResult.files || [];
    const connections: any[] = this._analysisResult.connections || [];
    const summary: any = this._analysisResult.summary || {};

    const fileEntry = files.find((f: any) => f.path === rel);
    if (!fileEntry) {
      // Show health score when no file selected
      if (summary.healthScore != null) {
        this._statusBar.text = `$(circuit-board) ${summary.healthGrade} ${summary.healthScore}/100`;
        this._statusBar.tooltip = `Grasp workspace health: ${summary.healthScore}/100 (${summary.healthGrade})\n${summary.fileCount} files · ${summary.functionCount} functions`;
        this._statusBar.show();
      } else {
        this._statusBar.hide();
      }
      return;
    }

    const deps = new Set(
      connections.filter((c: any) => c.source === rel).map((c: any) => c.target)
    ).size;
    const dependents = new Set(
      connections.filter((c: any) => c.target === rel).map((c: any) => c.source)
    ).size;

    this._statusBar.text = `$(circuit-board) ↑${deps} ↓${dependents}`;
    this._statusBar.tooltip = [
      `Grasp: ${rel}`,
      `↑ ${deps} outgoing deps (imports)`,
      `↓ ${dependents} dependents (blast radius)`,
      fileEntry.churn ? `🔥 Churn: ${fileEntry.churn} commits` : '',
      fileEntry.complexity ? `⚡ Complexity: ${fileEntry.complexity.score ?? fileEntry.complexity}` : '',
      `Workspace health: ${summary.healthScore}/100 (${summary.healthGrade})`,
      'Click to open graph',
    ].filter(Boolean).join('\n');
    this._statusBar.show();
  }

  updateDiagnostics(ws: string, result: any) {
    this._diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();

    const addDiag = (filePath: string, message: string, severity: vscode.DiagnosticSeverity, line?: number) => {
      const absPath = path.join(ws, filePath);
      const uri = vscode.Uri.file(absPath);
      const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0);
      const range = new vscode.Range(pos, pos);
      const diag = new vscode.Diagnostic(range, `Grasp: ${message}`, severity);
      diag.source = 'grasp';
      const key = uri.toString();
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(diag);
    };

    // Security issues → Error
    for (const s of result.security || []) {
      if (s.file) {
        addDiag(s.file, `[Security] ${s.desc || s.type}`, vscode.DiagnosticSeverity.Error, s.line);
      }
    }

    // Architecture violations from issues array → Warning
    for (const issue of result.issues || []) {
      if (issue.type === 'critical' || issue.title?.toLowerCase().includes('violation')) {
        for (const item of issue.items || []) {
          if (item.file) {
            addDiag(item.file, `[${issue.title}] ${item.name || ''}`.trim(), vscode.DiagnosticSeverity.Warning);
          }
        }
      }
    }

    // Circular dependency files → Warning
    for (const cycle of result.cycles || []) {
      for (const filePath of cycle) {
        addDiag(filePath, `Circular dependency: ${cycle.join(' → ')}`, vscode.DiagnosticSeverity.Warning);
      }
    }

    for (const [uriStr, diags] of byFile) {
      this._diagnostics.set(vscode.Uri.parse(uriStr), diags);
    }
  }

  private _getHtml(webview: vscode.Webview, defaultColorMode: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; connect-src 'none';"/>
<title>Grasp</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);font-size:11px;overflow:hidden;height:100vh;display:flex;flex-direction:column;}
  #header{padding:6px 10px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:8px;flex-shrink:0;}
  #health-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;font-family:monospace;flex-shrink:0;}
  #status{font-size:10px;color:var(--vscode-descriptionForeground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #toolbar{padding:4px 8px;display:flex;gap:3px;align-items:center;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;flex-wrap:wrap;}
  button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:3px;padding:3px 7px;cursor:pointer;font-size:10px;transition:background 0.1s;}
  button:hover{background:var(--vscode-button-secondaryHoverBackground);}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}
  button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}
  #graph{flex:1;width:100%;}
  #tooltip{position:fixed;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:7px 9px;font-size:10px;pointer-events:none;opacity:0;transition:opacity 0.1s;max-width:220px;z-index:100;line-height:1.6;}
  .selected-info{padding:5px 10px;font-size:10px;color:var(--vscode-descriptionForeground);border-top:1px solid var(--vscode-panel-border);min-height:26px;cursor:pointer;flex-shrink:0;}
  .selected-info:hover{color:var(--vscode-textLink-foreground);}
  .cm-btn{padding:2px 6px;font-size:9px;border-radius:3px;cursor:pointer;border:none;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);}
  .cm-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}
</style>
</head>
<body>
<div id="header">
  <span style="font-weight:600;font-size:11px;">⬡ Grasp</span>
  <span id="health-badge" style="display:none"></span>
  <span id="status">⏳ Initialising…</span>
</div>
<div id="toolbar">
  <button onclick="reanalyze()" title="Re-analyse workspace">🔄</button>
  <button onclick="fitView()" title="Fit view">⊡</button>
  <button onclick="resetHighlight()" title="Clear selection">✕</button>
  <span style="margin-left:4px;font-size:9px;opacity:0.5;">Color:</span>
  <button class="cm-btn ${defaultColorMode === 'layer' ? 'active' : ''}" id="cm-layer" onclick="setColorMode('layer')">Layer</button>
  <button class="cm-btn ${defaultColorMode === 'folder' ? 'active' : ''}" id="cm-folder" onclick="setColorMode('folder')">Folder</button>
  <button class="cm-btn ${defaultColorMode === 'churn' ? 'active' : ''}" id="cm-churn" onclick="setColorMode('churn')">Churn</button>
  <button class="cm-btn ${defaultColorMode === 'complexity' ? 'active' : ''}" id="cm-complexity" onclick="setColorMode('complexity')">Cx</button>
  <span style="margin-left:auto;font-size:9px;opacity:0.5;" id="file-count"></span>
</div>
<svg id="graph"></svg>
<div id="tooltip"></div>
<div class="selected-info" id="selected-info" onclick="openSelected()" style="display:none"></div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
let analysisData = null;
let selectedPath = null;
let zoomBeh = null;
let nodesRef = null;
let linksRef = null;
let simRef = null;
let colorMode = '${defaultColorMode}';

const svgEl = document.getElementById('graph');
const statusEl = document.getElementById('status');
const tooltip = document.getElementById('tooltip');
const selectedInfo = document.getElementById('selected-info');
const fileCount = document.getElementById('file-count');
const healthBadge = document.getElementById('health-badge');

const LAYER_COLORS = {
  ui:'#6366f1',services:'#22c55e',data:'#f59e0b',utils:'#06b6d4',
  config:'#8b5cf6',test:'#ec4899',types:'#14b8a6',api:'#f97316',security:'#ef4444',
};
const FOLDER_COLORS = ['#4d9fff','#a78bfa','#00d4aa','#ff9f43','#ff5f5f','#22d3ee','#f472b6','#4ade80','#fb923c','#c084fc'];

function setStatus(t) { statusEl.textContent = t; }
function reanalyze() { vscode.postMessage({ type: 'analyzeWorkspace' }); setStatus('Analysing…'); }
function openSelected() { if(selectedPath) vscode.postMessage({ type: 'openFile', path: selectedPath }); }

function setColorMode(mode) {
  colorMode = mode;
  ['layer','folder','churn','complexity'].forEach(m => {
    const btn = document.getElementById('cm-' + m);
    if (btn) btn.className = 'cm-btn' + (m === mode ? ' active' : '');
  });
  if (nodesRef) nodesRef.selectAll('circle').attr('fill', getColor);
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.type === 'status') setStatus(msg.text);
  if (msg.type === 'error') setStatus('⚠️ ' + msg.text);
  if (msg.type === 'analysis') { analysisData = msg.data; renderGraph(); }
  if (msg.type === 'highlightFile') { highlightNode(msg.path); }
});

vscode.postMessage({ type: 'ready' });

function getColor(d) {
  if (colorMode === 'folder') {
    if (!getColor._folderMap && analysisData) {
      getColor._folderMap = {};
      const folders = [...new Set((analysisData.files || []).map(f => f.folder))];
      folders.forEach((f, i) => { getColor._folderMap[f] = FOLDER_COLORS[i % FOLDER_COLORS.length]; });
    }
    return (getColor._folderMap && getColor._folderMap[d.folder]) || FOLDER_COLORS[0];
  }
  if (colorMode === 'churn') {
    if (!getColor._maxChurn && analysisData) {
      getColor._maxChurn = Math.max(1, ...(analysisData.files || []).map(f => f.churn || 0));
    }
    const ratio = (d.churn || 0) / (getColor._maxChurn || 1);
    return ratio > 0.66 ? '#ef4444' : ratio > 0.33 ? '#f59e0b' : '#4ade80';
  }
  if (colorMode === 'complexity') {
    const cx = typeof d.complexity === 'object' ? d.complexity?.score : d.complexity;
    return cx > 20 ? '#ef4444' : cx > 10 ? '#f59e0b' : '#4ade80';
  }
  return LAYER_COLORS[d.layer] || '#6366f1';
}

function renderGraph() {
  if (!analysisData) return;
  // Invalidate color caches
  delete getColor._folderMap;
  delete getColor._maxChurn;

  const d = analysisData;
  const files = d.files || [];
  const conns = d.connections || [];
  const summary = d.summary || {};
  fileCount.textContent = files.length + ' files';
  setStatus('✓ ' + files.length + ' files · health ' + (summary.healthScore ?? '?') + '/100');

  // Update health badge
  if (summary.healthScore != null) {
    const score = summary.healthScore;
    const grade = summary.healthGrade || '';
    healthBadge.textContent = grade + ' ' + score + '/100';
    healthBadge.style.display = 'inline-block';
    healthBadge.style.background = score >= 80 ? 'rgba(74,222,128,0.15)' : score >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
    healthBadge.style.color = score >= 80 ? '#4ade80' : score >= 60 ? '#f59e0b' : '#ef4444';
  }

  const w = svgEl.clientWidth || 300;
  const h = svgEl.clientHeight || 400;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const nodes = files.map(f => ({
    id: f.path, name: f.name, layer: f.layer, folder: f.folder,
    fnCount: f.functions.length, lines: f.lines, churn: f.churn || 0,
    complexity: f.complexity, topContributor: f.topContributor
  }));

  const nodeSet = new Set(nodes.map(n => n.id));
  const linkMap = new Map();
  conns.forEach(c => {
    if (!nodeSet.has(c.source) || !nodeSet.has(c.target)) return;
    const k = c.source + '|' + c.target;
    if (!linkMap.has(k)) linkMap.set(k, { source: c.source, target: c.target, count: 0 });
    linkMap.get(k).count += c.count;
  });
  const links = Array.from(linkMap.values());

  function getR(d) { return Math.max(5, Math.min(16, 4 + d.fnCount * 0.5)); }

  svg.append('defs').append('marker').attr('id','arr').attr('viewBox','0 -5 10 10')
    .attr('refX',14).attr('markerWidth',4).attr('markerHeight',4).attr('orient','auto')
    .append('path').attr('d','M0,-4L10,0L0,4').attr('fill','rgba(150,150,150,0.4)');

  const container = svg.append('g');
  zoomBeh = d3.zoom().scaleExtent([0.1,5]).on('zoom', e => container.attr('transform', e.transform));
  svg.call(zoomBeh);

  const linkG = container.append('g');
  const nodeG = container.append('g');

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(0.05))
    .force('charge', d3.forceManyBody().strength(-80))
    .force('center', d3.forceCenter(w/2, h/2))
    .force('collision', d3.forceCollide(d => getR(d) + 6));
  simRef = sim;

  linksRef = linkG.selectAll('line').data(links).join('line')
    .attr('stroke','rgba(150,150,150,0.22)').attr('stroke-width', d => Math.max(0.5, d.count * 0.2))
    .attr('marker-end','url(#arr)');

  nodesRef = nodeG.selectAll('g').data(nodes).join('g')
    .style('cursor','pointer')
    .call(d3.drag()
      .on('start', (e,d) => { if(!e.active) sim.alphaTarget(0.1).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag', (e,d) => { d.fx=e.x; d.fy=e.y; })
      .on('end', (e,d) => { if(!e.active) sim.alphaTarget(0); })
    )
    .on('click', (e, d) => {
      selectedPath = d.id;
      selectedInfo.style.display = 'block';
      selectedInfo.textContent = '📄 ' + d.id + ' — click to open';
      highlightNode(d.id);
    })
    .on('dblclick', (e, d) => {
      vscode.postMessage({ type: 'openFile', path: d.id });
    })
    .on('mouseover', (e, d) => {
      tooltip.style.opacity = '1';
      const cx = typeof d.complexity === 'object' ? d.complexity?.score : d.complexity;
      const parts = [
        d.name,
        d.layer,
        d.fnCount + ' functions · ' + d.lines + ' lines',
        d.churn ? '🔥 Churn: ' + d.churn + ' commits' : '',
        cx ? '⚡ Complexity: ' + cx : '',
        d.topContributor ? '👤 ' + d.topContributor : '',
      ].filter(Boolean);
      tooltip.textContent = '';
      parts.forEach((p, i) => {
        if (i > 0) tooltip.appendChild(document.createElement('br'));
        tooltip.appendChild(document.createTextNode(p));
      });
    })
    .on('mousemove', e => {
      tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 230) + 'px';
      tooltip.style.top = (e.clientY + 12) + 'px';
    })
    .on('mouseout', () => { tooltip.style.opacity = '0'; });

  nodesRef.append('circle').attr('r', getR).attr('fill', getColor)
    .attr('stroke', 'var(--vscode-editor-background)').attr('stroke-width', 1.5);
  nodesRef.append('text').attr('dy','0.3em').attr('text-anchor','middle')
    .attr('font-size', d => Math.max(5, Math.min(8, getR(d) * 0.6)) + 'px')
    .attr('fill','#fff').attr('pointer-events','none')
    .text(d => { const n = d.name.replace(/\\.[^.]+$/, ''); return n.length > 7 ? n.slice(0,7)+'\\u2026' : n; });

  sim.on('tick', () => {
    linksRef.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodesRef.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  });
}

function highlightNode(relPath) {
  if (!nodesRef || !linksRef) return;
  nodesRef.selectAll('circle')
    .attr('stroke', d => d.id === relPath ? '#fff' : 'var(--vscode-editor-background)')
    .attr('stroke-width', d => d.id === relPath ? 2.5 : 1.5)
    .attr('opacity', d => d.id === relPath ? 1 : 0.35);
  linksRef
    .attr('stroke', d => {
      const s = d.source.id || d.source, t = d.target.id || d.target;
      return s === relPath ? 'rgba(99,102,241,0.9)' : t === relPath ? 'rgba(74,222,128,0.7)' : 'rgba(150,150,150,0.1)';
    })
    .attr('stroke-width', d => {
      const s = d.source.id || d.source, t = d.target.id || d.target;
      return s === relPath || t === relPath ? 1.5 : 0.5;
    });
  if (simRef) {
    const n = simRef.nodes().find(n => n.id === relPath);
    if (n && n.x != null && svgEl && zoomBeh) {
      const w = svgEl.clientWidth, h = svgEl.clientHeight;
      const scale = 2;
      d3.select(svgEl).transition().duration(500)
        .call(zoomBeh.transform, d3.zoomIdentity.translate(w/2 - scale*n.x, h/2 - scale*n.y).scale(scale));
    }
  }
}

function resetHighlight() {
  if (!nodesRef || !linksRef) return;
  nodesRef.selectAll('circle').attr('opacity',1).attr('stroke','var(--vscode-editor-background)').attr('stroke-width',1.5);
  linksRef.attr('stroke','rgba(150,150,150,0.22)').attr('stroke-width', d => Math.max(0.5, d.count * 0.2));
  selectedPath = null;
  selectedInfo.style.display = 'none';
}

function fitView() {
  if (!svgEl || !zoomBeh || !simRef) return;
  const ns = simRef.nodes().filter(n => n.x != null);
  if (!ns.length) { d3.select(svgEl).transition().duration(400).call(zoomBeh.transform, d3.zoomIdentity); return; }
  const xs = ns.map(n => n.x), ys = ns.map(n => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = svgEl.clientWidth, h = svgEl.clientHeight;
  const pad = 30;
  const scale = Math.min((w - pad*2) / (x1 - x0 || 1), (h - pad*2) / (y1 - y0 || 1), 3);
  const tx = (w - scale * (x0 + x1)) / 2, ty = (h - scale * (y0 + y1)) / 2;
  d3.select(svgEl).transition().duration(500).call(zoomBeh.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}
</script>
</body>
</html>`;
  }
}
