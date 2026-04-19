#!/bin/bash
set -e
echo "Building Docker image..."
docker build -t grasp-smoke-test "$(dirname "$0")/.." 2>&1

echo "Testing --version..."
OUTPUT=$(docker run --rm grasp-smoke-test --version 2>&1)
echo "Output: $OUTPUT"

# grasp outputs version via npm/node
if echo "$OUTPUT" | grep -qE "[0-9]+\.[0-9]+\.[0-9]+|grasp|help"; then
  echo "PASS: Docker image works"
else
  echo "FAIL: unexpected output: $OUTPUT"
  exit 1
fi
