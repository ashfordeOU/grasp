# Grasp + Droid

Droid is an AI coding agent — this integration adds Grasp as an MCP server so Droid can analyse your codebase during AI coding sessions.

## Setup

1. Install the [Droid CLI](https://droid.dev) and initialise it in your project.
2. Create `.droid/mcp.json` in your project root with the following content:

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

3. Run `droid` — the Grasp MCP server will be loaded automatically from the project config.

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- [Droid CLI](https://droid.dev)
