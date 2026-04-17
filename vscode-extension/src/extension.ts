import * as vscode from 'vscode';
import * as path from 'path';

// =====================================================================
// Grasp VS Code Extension
//
// Provides a sidebar webview panel that shows the dependency graph for
// the currently open workspace, auto-panning to the active file.
// =====================================================================

let panel: GraspPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Register sidebar webview view
  const provider = new GraspViewProvider(context.extensionUri);
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

  // Auto-pan to active file on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && vscode.workspace.getConfiguration('grasp').get('highlightActiveFile')) {
        provider.highlightFile(editor.document.uri.fsPath);
      }
    })
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

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
    view.webview.html = this._getHtml(view.webview);

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
    });
  }

  async triggerAnalysis() {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return;

    this._view?.webview.postMessage({ type: 'status', text: 'Analysing…' });

    try {
      // Use the grasp-mcp-server analyzeSource function directly
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { analyzeSource } = require('grasp-mcp-server/dist/analyzer.js') as typeof import('grasp-mcp-server/dist/analyzer.js');
      const result = await (analyzeSource as any)(
        { type: 'local', path: ws },
        (msg: string) => this._view?.webview.postMessage({ type: 'status', text: msg })
      );
      this._view?.webview.postMessage({ type: 'analysis', data: result });
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

  private _getHtml(webview: vscode.Webview): string {
    // CDN versions of D3 (same as grasp browser app)
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline'; connect-src 'none';"/>
<title>Grasp</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);font-size:11px;overflow:hidden;height:100vh;display:flex;flex-direction:column;}
  #status{padding:6px 10px;font-size:10px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:6px;min-height:28px;}
  #toolbar{padding:4px 8px;display:flex;gap:4px;align-items:center;border-bottom:1px solid var(--vscode-panel-border);}
  button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:10px;}
  button:hover{background:var(--vscode-button-secondaryHoverBackground);}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}
  #graph{flex:1;width:100%;}
  #tooltip{position:fixed;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:6px 8px;font-size:10px;pointer-events:none;opacity:0;transition:opacity 0.1s;max-width:200px;z-index:100;line-height:1.5;}
  .selected-info{padding:6px 10px;font-size:10px;color:var(--vscode-descriptionForeground);border-top:1px solid var(--vscode-panel-border);min-height:28px;cursor:pointer;}
  .selected-info:hover{color:var(--vscode-textLink-foreground);}
</style>
</head>
<body>
<div id="status">⏳ Initialising…</div>
<div id="toolbar">
  <button onclick="reanalyze()">🔄 Re-analyse</button>
  <button onclick="fitView()">⊡ Fit</button>
  <button onclick="resetHighlight()">Clear</button>
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

const svgEl = document.getElementById('graph');
const status = document.getElementById('status');
const tooltip = document.getElementById('tooltip');
const selectedInfo = document.getElementById('selected-info');
const fileCount = document.getElementById('file-count');

function setStatus(t) { status.textContent = t; }
function reanalyze() { vscode.postMessage({ type: 'analyzeWorkspace' }); setStatus('Analysing…'); }
function openSelected() { if(selectedPath) vscode.postMessage({ type: 'openFile', path: selectedPath }); }

window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.type === 'status') setStatus(msg.text);
  if (msg.type === 'error') setStatus('⚠️ ' + msg.text);
  if (msg.type === 'analysis') { analysisData = msg.data; renderGraph(); }
  if (msg.type === 'highlightFile') { highlightNode(msg.path); }
});

vscode.postMessage({ type: 'ready' });

function renderGraph() {
  if (!analysisData) return;
  const d = analysisData;
  const files = d.files || [];
  const conns = d.connections || [];
  fileCount.textContent = files.length + ' files';
  setStatus('✓ ' + files.length + ' files analysed');

  const w = svgEl.clientWidth || 300;
  const h = svgEl.clientHeight || 400;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const LAYER_COLORS = {
    ui:'#6366f1',services:'#22c55e',data:'#f59e0b',utils:'#06b6d4',
    config:'#8b5cf6',test:'#ec4899',types:'#14b8a6',api:'#f97316',
  };

  const nodes = files.map(f => ({
    id: f.path, name: f.name, layer: f.layer, fnCount: f.functions.length,
    lines: f.lines, churn: f.churn || 0
  }));

  const linkMap = new Map();
  conns.forEach(c => {
    const k = c.source + '|' + c.target;
    if (!linkMap.has(k)) linkMap.set(k, { source: c.source, target: c.target, count: 0 });
    linkMap.get(k).count += c.count;
  });
  const links = Array.from(linkMap.values());

  function getR(d) { return Math.max(5, Math.min(16, 4 + d.fnCount * 0.5)); }
  function getC(d) { return LAYER_COLORS[d.layer] || '#6366f1'; }

  svg.append('defs').append('marker').attr('id','arr').attr('viewBox','0 -5 10 10')
    .attr('refX',14).attr('markerWidth',4).attr('markerHeight',4).attr('orient','auto')
    .append('path').attr('d','M0,-4L10,0L0,4').attr('fill','rgba(150,150,150,0.5)');

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
    .attr('stroke','rgba(150,150,150,0.25)').attr('stroke-width', d => Math.max(0.5, d.count * 0.2))
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
    .on('mouseover', (e, d) => {
      tooltip.style.opacity = '1';
      tooltip.style.left = (e.clientX + 10) + 'px';
      tooltip.style.top = (e.clientY + 10) + 'px';
      tooltip.innerHTML = '<b>' + d.name + '</b><br/>' + d.layer + ' · ' + d.fnCount + ' fns · ' + d.lines + ' lines';
    })
    .on('mousemove', e => { tooltip.style.left=(e.clientX+10)+'px'; tooltip.style.top=(e.clientY+10)+'px'; })
    .on('mouseout', () => { tooltip.style.opacity = '0'; });

  nodesRef.append('circle').attr('r', getR).attr('fill', getC)
    .attr('stroke', 'var(--vscode-editor-background)').attr('stroke-width', 1.5);
  nodesRef.append('text').attr('dy','0.3em').attr('text-anchor','middle')
    .attr('font-size', d => Math.max(5, Math.min(8, getR(d) * 0.6)) + 'px')
    .attr('fill','#fff').attr('pointer-events','none')
    .text(d => { const n = d.name.replace(/\.[^.]+$/, ''); return n.length > 7 ? n.slice(0,7)+'…' : n; });

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
    .attr('opacity', d => d.id === relPath ? 1 : 0.4);
  linksRef.attr('stroke', d => {
    const s = d.source.id || d.source, t = d.target.id || d.target;
    return s === relPath || t === relPath ? 'rgba(99,102,241,0.8)' : 'rgba(150,150,150,0.15)';
  });
  // Pan to the node
  if (simRef) {
    const n = simRef.nodes().find(n => n.id === relPath);
    if (n && n.x != null && svgEl && zoomBeh) {
      const w = svgEl.clientWidth, h = svgEl.clientHeight;
      const scale = 1.8;
      d3.select(svgEl).transition().duration(500)
        .call(zoomBeh.transform, d3.zoomIdentity.translate(w/2 - scale*n.x, h/2 - scale*n.y).scale(scale));
    }
  }
}

function resetHighlight() {
  if (!nodesRef || !linksRef) return;
  nodesRef.selectAll('circle').attr('opacity',1).attr('stroke','var(--vscode-editor-background)').attr('stroke-width',1.5);
  linksRef.attr('stroke','rgba(150,150,150,0.25)');
  selectedPath = null;
  selectedInfo.style.display = 'none';
}

function fitView() {
  if (!svgEl || !zoomBeh) return;
  d3.select(svgEl).transition().duration(400).call(zoomBeh.transform, d3.zoomIdentity);
}
</script>
</body>
</html>`;
  }
}

class GraspPanel {
  static current?: GraspPanel;
}
