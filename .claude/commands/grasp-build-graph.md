---
description: Run grasp_analyze + grasp_minimal_context for the current repo, store the session_id, and report a 100-token orientation
allowed-tools: Bash(npx:*), Bash(grasp:*), mcp__grasp__grasp_analyze, mcp__grasp__grasp_minimal_context
---

Use the Grasp MCP server to:
1. Call mcp__grasp__grasp_analyze with source = the current working directory.
2. Capture the session_id from the response.
3. Call mcp__grasp__grasp_minimal_context with that session_id.
4. Print the minimal context and the session_id (so I can reuse it for follow-up tools).

If grasp_analyze fails, ensure grasp-mcp-server is registered (`npx grasp-mcp-server --version` to verify).
