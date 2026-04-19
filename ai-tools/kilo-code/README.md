# Grasp + Kilo Code

Kilo Code is a VS Code extension for AI-assisted coding — this integration adds Grasp as an MCP server so Kilo Code can analyse your codebase during AI sessions.

## Setup

1. Install the [Kilo Code extension](https://marketplace.visualstudio.com/items?itemName=kilocode.kilo-code) in VS Code.
2. Open the Kilo Code panel in the VS Code sidebar, navigate to **MCP Servers**, and add a new server entry.
3. Paste the following configuration:

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

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- VS Code with the [Kilo Code extension](https://marketplace.visualstudio.com/items?itemName=kilocode.kilo-code)
