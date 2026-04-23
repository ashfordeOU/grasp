import * as vscode from 'vscode';

const fanInDecoration = vscode.window.createTextEditorDecorationType({ after: { margin: '0 0 0 1em', color: '#888' } });

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '⬡ --';
  statusBar.tooltip = 'Grasp health score';
  statusBar.show();
  context.subscriptions.push(statusBar);

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor) return;
    updateDecorations(editor, statusBar);
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(doc => {
    const ext = doc.fileName.split('.').pop();
    if (['ts','js','tsx','jsx','py','c','cpp','h'].includes(ext ?? '')) {
      vscode.commands.executeCommand('grasp.reanalyze');
    }
  }, null, context.subscriptions);

  context.subscriptions.push(vscode.commands.registerCommand('grasp.reanalyze', () => {
    vscode.window.showInformationMessage('Grasp: re-analysing workspace…');
  }));
}

function updateDecorations(editor: vscode.TextEditor, statusBar: vscode.StatusBarItem) {
  const grasp = (global as any).__graspSession;
  if (!grasp) return;
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const fileData = grasp.files?.find((f: any) => f.path === filePath);
  if (!fileData) return;

  statusBar.text = `⬡ ${grasp.health ?? '--'} ${grasp.grade ?? ''}`;

  const decorations: vscode.DecorationOptions[] = [];
  editor.document.getText().split('\n').forEach((line, i) => {
    if (/^(import|require|from)/.test(line)) {
      const fanIn = grasp.connections?.filter((c: any) => c.source === filePath).length ?? 0;
      if (fanIn > 3) decorations.push({ range: new vscode.Range(i, line.length, i, line.length), renderOptions: { after: { contentText: ` ← fan-in: ${fanIn}` } } });
    }
  });
  editor.setDecorations(fanInDecoration, decorations);
}

export function deactivate() {}
