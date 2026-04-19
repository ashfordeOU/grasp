# Grasp + Trae

Trae is an AI IDE — this integration adds Grasp as an MCP server so Trae can analyse your codebase during AI coding sessions.

## Setup

1. Open Trae IDE and navigate to **Settings → Extensions → MCP Servers**.
2. Add a new MCP server entry with the following configuration:

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

3. Save settings and restart Trae — the Grasp MCP server will be available in all AI sessions.

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- [Trae IDE](https://trae.ai)
