import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const fanInDecoration = vscode.window.createTextEditorDecorationType({
  after: { margin: '0 0 0 1em', color: '#888' },
});

interface GraspResult {
  grade: string;
  score: number;
  files?: Array<{ path: string; complexity: number; healthGrade: string }>;
  connections?: Array<{ source: string; target: string }>;
  issues?: Array<{ description?: string }>;
  summary?: { healthGrade: string; healthScore: number; fileCount: number; issueCount: number };
}

let graspResult: GraspResult | null = null;

async function runAnalysis(workspaceRoot: string, statusBar: vscode.StatusBarItem): Promise<void> {
  statusBar.text = '⬡ …';
  statusBar.tooltip = 'Grasp: analysing…';
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['grasp-mcp-server', 'analyze', workspaceRoot, '--format', 'json'],
      { cwd: workspaceRoot, timeout: 60_000 },
    );
    graspResult = JSON.parse(stdout) as GraspResult;
    const grade = graspResult.summary?.healthGrade ?? graspResult.grade ?? '--';
    const score = graspResult.summary?.healthScore ?? graspResult.score ?? 0;
    const issues = graspResult.summary?.issueCount ?? graspResult.issues?.length ?? 0;
    statusBar.text = `⬡ ${score} ${grade}`;
    statusBar.tooltip = `Grasp: ${grade} (${score}/100) · ${issues} issue${issues !== 1 ? 's' : ''}`;
    const editor = vscode.window.activeTextEditor;
    if (editor) updateDecorations(editor);
  } catch (err) {
    statusBar.text = '⬡ --';
    statusBar.tooltip = `Grasp: analysis failed — ${String(err)}`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '⬡ --';
  statusBar.tooltip = 'Grasp health score — click to re-analyse';
  statusBar.command = 'grasp.reanalyze';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (workspaceRoot) {
    runAnalysis(workspaceRoot, statusBar);
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor || !graspResult) return;
    updateDecorations(editor);
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(doc => {
    const ext = doc.fileName.split('.').pop();
    if (['ts', 'js', 'tsx', 'jsx', 'py', 'c', 'cpp', 'h', 'go', 'rs', 'java'].includes(ext ?? '')) {
      vscode.commands.executeCommand('grasp.reanalyze');
    }
  }, null, context.subscriptions);

  context.subscriptions.push(
    vscode.commands.registerCommand('grasp.reanalyze', () => {
      if (!workspaceRoot) {
        vscode.window.showWarningMessage('Grasp: no workspace folder open');
        return;
      }
      runAnalysis(workspaceRoot, statusBar);
    }),
  );
}

function updateDecorations(editor: vscode.TextEditor): void {
  if (!graspResult) return;
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const fanIn = graspResult.connections?.filter(c => c.target === filePath).length ?? 0;
  const decorations: vscode.DecorationOptions[] = [];
  if (fanIn > 3) {
    editor.document.getText().split('\n').forEach((line, i) => {
      if (/^(import|require|from)\s/.test(line)) {
        decorations.push({
          range: new vscode.Range(i, line.length, i, line.length),
          renderOptions: { after: { contentText: ` ← fan-in: ${fanIn}` } },
        });
      }
    });
  }
  editor.setDecorations(fanInDecoration, decorations);
}

export function deactivate() {}
