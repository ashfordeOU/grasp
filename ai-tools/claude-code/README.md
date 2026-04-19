# Grasp + Claude Code

Add Grasp to Claude Code as an MCP server.

## Quick Setup

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json` for Desktop or `claude mcp add` via CLI):

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

Or via CLI:
```bash
claude mcp add grasp -- npx -y grasp-mcp-server
```

## What You Get

Once connected, Claude Code can call all 48 Grasp tools directly:
- `analyze_codebase` — dependency graph + health score
- `get_blast_radius` — what breaks if you change a file
- `get_security_issues` — hardcoded secrets, injection risks
- Full tool list: `npx grasp-mcp-server --list-tools`

## Requirements

- Node.js 18+
- `grasp-mcp-server` (installed automatically via `npx`)
