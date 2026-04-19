# Grasp + Codex CLI

Codex CLI is OpenAI's command-line coding agent — this integration adds Grasp as an MCP server so Codex CLI can analyse your codebase during AI sessions.

## Setup

1. Install Codex CLI (`npm install -g @openai/codex`) and authenticate with your OpenAI API key.
2. Create or edit `~/.codex/config.json` and add the `mcpServers` key:

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

3. Run `codex` in your project directory — the Grasp MCP server will be loaded automatically.

## What You Get

All 48 Grasp tools are available via MCP for codebase analysis during AI coding sessions.

## Requirements

- Node.js 18+
- [codex](https://github.com/openai/codex) CLI (`npm install -g @openai/codex`)
