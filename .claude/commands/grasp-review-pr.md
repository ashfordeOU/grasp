---
description: Full PR review with blast-radius, suggested questions, and surprising-connections check
allowed-tools: mcp__grasp__grasp_analyze, mcp__grasp__grasp_detect_changes, mcp__grasp__grasp_suggested_questions, mcp__grasp__grasp_surprising_connections, mcp__grasp__grasp_knowledge_gaps
---

Run a full Grasp-powered PR review:

1. `grasp_analyze` the current working directory.
2. `grasp_detect_changes` with scope=compare, base_ref=main.
3. `grasp_suggested_questions` with the session_id — surface review questions.
4. `grasp_surprising_connections` — call out unexpected layer crossings introduced.
5. `grasp_knowledge_gaps` — flag any new uncovered hotspots.

Produce a single markdown comment suitable for posting on the PR: change summary, top 5 review questions, surprising connections, knowledge gaps, recommended approver based on file ownership patterns.
