---
description: Detect changes since base branch and produce a risk-scored impact report
allowed-tools: Bash(git:*), mcp__grasp__grasp_analyze, mcp__grasp__grasp_detect_changes, mcp__grasp__grasp_change_risk
---

Use grasp to review the delta between the current branch and $1 (default `main`).

1. `grasp_analyze` the current working directory.
2. Call `grasp_detect_changes` with scope=compare, base_ref=$1.
3. Call `grasp_change_risk` to score the impact.
4. Summarize: changed files, affected functions, risk score, top 3 reviewer recommendations.
