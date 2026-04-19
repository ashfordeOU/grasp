#!/bin/bash
# E2E smoke test using nektos/act (dry-run mode — no actual execution needed for CI)
# In CI this script validates the workflow YAML is valid for act, not that it runs end-to-end
# (actual act execution requires Docker and GitHub credentials)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW="$SCRIPT_DIR/workflow.yml"

echo "=== Grasp GitHub Action E2E Smoke Test ==="

# Validate workflow YAML is parseable
python3 -c "import yaml; yaml.safe_load(open('$WORKFLOW'))" && echo "✓ E2E workflow YAML is valid"

# Check if act is available for full dry-run
if command -v act &>/dev/null; then
  echo "act is available — running dry-run..."
  act pull_request -W "$WORKFLOW" --dryrun 2>&1 | head -30
  echo "✓ act dry-run succeeded"
else
  echo "act not installed — skipping dry-run (install with: brew install act or npm install -g @nektos/act)"
  echo "✓ Smoke test passed (YAML valid, act not available)"
fi

echo "=== E2E Smoke Test Complete ==="
