# Grasp + Cursor

Add Grasp to Cursor as an MCP server for codebase analysis in AI chat.

## Quick Setup

Copy `mcp.json` to your project root as `.cursor/mcp.json`, or add to the global `~/.cursor/mcp.json`:

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

Then in Cursor: **Settings → MCP** — the grasp server will appear automatically.

## What You Get

Ask Cursor's AI about your codebase:
- "What's the health score of this project?"
- "Show me the blast radius if I change auth.ts"
- "Find any security issues in the codebase"

All 48 Grasp tools are available via MCP.

## Requirements

- Node.js 18+
- Cursor 0.40+
