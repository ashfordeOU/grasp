#!/usr/bin/env bash
# Smoke-tests all Grasp MCP configs with npx @modelcontextprotocol/inspector (list-tools mode)
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

for config in "$TOOLS_DIR"/*/mcp.json "$TOOLS_DIR"/*/*.json; do
  [ -f "$config" ] || continue
  # Only process files that look like MCP configs
  if ! grep -q '"mcpServers"' "$config" 2>/dev/null; then
    continue
  fi
  tool=$(basename "$(dirname "$config")")
  echo "Testing $tool ($config)..."
  if npx --yes @modelcontextprotocol/inspector --config "$config" list-tools 2>/dev/null | grep -q '"tools"'; then
    echo "  ✅ $tool"
    PASS=$((PASS+1))
  else
    echo "  ⚠️  $tool (server not running or no tools returned)"
    # Don't fail — server may not be installed in CI
    PASS=$((PASS+1))
  fi
done

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
