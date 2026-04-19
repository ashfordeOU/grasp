# Grasp + Cline

Add Grasp to the Cline VS Code extension as an MCP server.

## Setup

In VS Code with Cline installed:
1. Open the Cline MCP Settings panel (the plug icon in the Cline sidebar)
2. Add the following server configuration:

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

Or edit `~/.vscode/cline_mcp_settings.json` directly.

## What You Get

Cline can call all 48 Grasp tools to analyze your codebase during AI-assisted coding sessions.

## Requirements

- VS Code with [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) installed
- Node.js 18+
