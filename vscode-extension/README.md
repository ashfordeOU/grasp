# Grasp — Architecture Graph for VS Code

Shows a live dependency graph for your workspace in the sidebar. Auto-pans to the currently open file.

## Features

- **Sidebar panel** — dependency graph of your entire workspace
- **Auto-pan** — switching files highlights and centres the active file in the graph
- **Click to open** — click any node to open that file in the editor
- **Re-analyse** — one-click refresh after making changes

## Usage

1. Install the extension
2. Open a workspace folder
3. Grasp appears in the activity bar (circuit-board icon)
4. Click it to open the Architecture Graph panel
5. Switch between files — the graph tracks your position

## Setup

```bash
cd vscode-extension
npm install
npm run build
```

Then press F5 in VS Code to launch the Extension Development Host.

## Commands

- `Grasp: Open Architecture Panel` — focus the sidebar panel
- `Grasp: Analyse Workspace` — re-run analysis

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `grasp.autoAnalyze` | `true` | Analyse on startup |
| `grasp.highlightActiveFile` | `true` | Pan to active file on switch |
