# Grasp — AI Coding Tool Integrations

Grasp works with all major AI coding tools via the [MCP (Model Context Protocol)](https://modelcontextprotocol.io).

## Supported Tools

| Tool | Config Location | Setup Guide |
|------|----------------|-------------|
| [Claude Code](./claude-code/) | `~/.claude.json` or `claude mcp add` | [README](./claude-code/README.md) |
| [Cursor](./cursor/) | `.cursor/mcp.json` | [README](./cursor/README.md) |
| [Cline](./cline/) | Cline MCP Settings panel | [README](./cline/README.md) |
| [Roo Code](./roo-code/) | Roo Code MCP Settings | [README](./roo-code/README.md) |
| [Kilo Code](./kilo-code/) | Kilo Code MCP panel | [README](./kilo-code/README.md) |
| [OpenCode](./opencode/) | `~/.config/opencode/mcp.json` | [README](./opencode/README.md) |
| [Trae](./trae/) | Settings → Extensions → MCP | [README](./trae/README.md) |
| [Grok CLI](./grok-cli/) | `~/.grok/mcp.json` | [README](./grok-cli/README.md) |
| [Codex CLI](./codex-cli/) | `~/.codex/config.json` | [README](./codex-cli/README.md) |
| [Droid](./droid/) | `.droid/mcp.json` | [README](./droid/README.md) |

## Universal Config

All tools use the same MCP server config:

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

Once connected, your AI coding tool can call all **48 Grasp tools** to:
- Analyze your full codebase (dependency graph, health score)
- Find the blast radius of any change
- Detect security issues (hardcoded secrets, injection risks)
- Understand architectural layers and circular dependencies

See [grasp-mcp-server](../mcp/) for the full tool list.
