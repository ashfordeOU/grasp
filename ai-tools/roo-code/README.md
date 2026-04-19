# Grasp + Roo Code

Add Grasp to the Roo Code VS Code extension as an MCP server.

## Setup

In VS Code with Roo Code installed:
1. Open Roo Code settings (gear icon in the Roo Code panel)
2. Navigate to **MCP Servers** and add:

```json
{
  "mcpServers": {
    "grasp": {
      "command": "npx",
      "args": ["-y", "grasp-mcp-server"]
    }
  }
}
```

Or edit `~/.vscode/roocodeconfig.json` → `mcpServers` section directly.

## What You Get

Roo Code can call all 48 Grasp tools for deep codebase analysis during AI coding sessions.

## Requirements

- VS Code with [Roo Code](https://marketplace.visualstudio.com/items?itemName=RooVetGit.roo-cline) installed  
- Node.js 18+
