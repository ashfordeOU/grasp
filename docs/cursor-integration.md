# Using Grasp with Cursor IDE

Grasp's MCP server integrates directly with Cursor's AI via the Model Context Protocol.

## Setup (30 seconds)

1. Open Cursor Settings → Features → MCP
2. Click "Add Server" and paste:
   ```json
   { "command": "npx", "args": ["grasp-mcp-server"] }
   ```
3. Or copy `docs/examples/cursor-mcp.json` to `.cursor/mcp.json` in your repo

## Example prompts in Cursor

- "Analyze this codebase and tell me the riskiest files to touch"
- "What would break if I refactor src/auth.ts?"
- "Are there any circular dependencies? How do I fix them?"
- "Which files have no test coverage?"
- "Generate a change risk score for the files I've modified"

## How it works

Cursor calls `grasp_analyze` first (returns a session_id), then uses any of the 47+ tools
with that session_id to answer questions about your codebase. All analysis runs locally —
your code never leaves your machine.
