# Grasp + Grok CLI

Grok CLI is xAI's command-line AI tool — this integration adds Grasp as an MCP server so Grok CLI can analyse your codebase during AI sessions.

## Setup

1. Install the [grok CLI](https://github.com/xai-org/grok-cli) and authenticate with your xAI API key.
2. Create or edit `~/.grok/mcp.json` (or set the `GROK_MCP_CONFIG` environment variable to point to a config file) with the following content:

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

3. Run `grok` — the Grasp MCP server will be loaded automatically.

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- [grok](https://github.com/xai-org/grok-cli) CLI
