# Grasp + OpenCode

OpenCode is a terminal-based AI coding tool — this integration adds Grasp as an MCP server so OpenCode can analyse your codebase during AI sessions.

## Setup

1. Install OpenCode by following the [official instructions](https://github.com/sst/opencode).
2. Create or edit `~/.config/opencode/mcp.json` and add the Grasp server:

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

3. Start `opencode` in your terminal — the Grasp MCP server will be loaded automatically.

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- [opencode](https://github.com/sst/opencode) CLI
