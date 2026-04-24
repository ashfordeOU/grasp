import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export type EditorId = 'claude-code' | 'cursor' | 'windsurf';

const EDITOR_MARKERS: Record<EditorId, string> = {
  'claude-code': '.claude',
  'cursor': '.cursor',
  'windsurf': '.windsurf',
};

export function detectEditors(repoDir: string): EditorId[] {
  return (Object.entries(EDITOR_MARKERS) as [EditorId, string][])
    .filter(([, marker]) => existsSync(join(repoDir, marker)))
    .map(([id]) => id);
}

const HOOK_SCRIPT = `#!/bin/sh
# Grasp PreToolUse hook — injects file context before edits
# Runs: grasp context <source> <file>
FILE="$(echo "$CLAUDE_TOOL_INPUT" | node -e "const d=require('fs').readFileSync(0,'utf8');try{console.log(JSON.parse(d).path||'')}catch{}" 2>/dev/null)"
if [ -n "$FILE" ]; then
  node "$(dirname "$0")/../../../mcp/dist/cli.js" context "$GRASP_SOURCE" "$FILE" 2>/dev/null || true
fi
`;

export function generateHookScript(repoDir: string, editor: EditorId): string {
  if (editor === 'claude-code') {
    const hooksDir = join(repoDir, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const scriptPath = join(hooksDir, 'pre-tool-use.sh');
    writeFileSync(scriptPath, HOOK_SCRIPT);
    return scriptPath;
  }
  // cursor / windsurf: no standard hook path yet — return empty
  return '';
}

const CLAUDE_MD_TEMPLATE = (source: string) => `## Grasp Architecture Context

This repo is indexed in the Grasp brain. Before editing a file, run:

\`\`\`
grasp context ${source} <file>
\`\`\`

This gives you: layer, health grade, complexity, coupling, churn, dependents, dependencies, and security issues.

Re-index after major changes: \`grasp index ${source}\`
`;

const AGENTS_MD_TEMPLATE = (source: string) => `## Grasp Architecture Context

Before editing any file, run \`grasp context ${source} <file>\` for architectural context.
Re-index after major changes: \`grasp index ${source}\`
`;

export function generateClaudeMd(repoDir: string, source: string): string {
  const p = join(repoDir, 'CLAUDE.md');
  writeFileSync(p, CLAUDE_MD_TEMPLATE(source));
  return p;
}

export function generateAgentsMd(repoDir: string, source: string): string {
  const p = join(repoDir, 'AGENTS.md');
  writeFileSync(p, AGENTS_MD_TEMPLATE(source));
  return p;
}
