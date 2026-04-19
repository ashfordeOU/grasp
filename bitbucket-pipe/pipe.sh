#!/bin/bash
set -e

THRESHOLD=${THRESHOLD:=D}
REPO="${BITBUCKET_REPO_FULL_NAME:-${1:-unknown/repo}}"

echo "=== Grasp Architecture Check ==="
echo "Repo: $REPO"
echo "Threshold: $THRESHOLD"

# Run grasp analysis
if command -v grasp &>/dev/null; then
  grasp analyze "$REPO" --format json > /tmp/grasp-result.json 2>/dev/null || echo '{"grade":"F","score":0}' > /tmp/grasp-result.json
else
  echo '{"grade":"F","score":0,"error":"grasp not found"}' > /tmp/grasp-result.json
fi

GRADE=$(python3 -c "import json; print(json.load(open('/tmp/grasp-result.json')).get('grade','F'))" 2>/dev/null || echo "F")
SCORE=$(python3 -c "import json; print(json.load(open('/tmp/grasp-result.json')).get('score',0))" 2>/dev/null || echo "0")

echo "Health Grade: $GRADE"
echo "Health Score: $SCORE/100"

# Check threshold
grades="A B C D F"
for g in $grades; do
  [ "$g" = "$THRESHOLD" ] && break
  [ "$g" = "$GRADE" ] && { echo "Grade $GRADE is above threshold $THRESHOLD"; exit 0; }
done
[ "$GRADE" = "$THRESHOLD" ] && { echo "Grade $GRADE meets threshold $THRESHOLD"; exit 0; }
echo "Grade $GRADE is below threshold $THRESHOLD — FAILING"
exit 1
