import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import * as os from 'os';

export type EditorId = 'claude-code' | 'cursor' | 'windsurf' | 'codex' | 'opencode';

const EDITOR_NAMES: Record<EditorId, string> = {
  'claude-code': 'Claude Code',
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
  'codex': 'Codex',
  'opencode': 'OpenCode',
};

export function detectEditors(repoDir: string): EditorId[] {
  const detected: EditorId[] = [];
  const checks: Array<[EditorId, string]> = [
    ['claude-code', join(repoDir, '.claude')],
    ['cursor', join(repoDir, '.cursor')],
    ['windsurf', join(repoDir, '.windsurf')],
    ['codex', join(repoDir, '.codex')],
  ];
  for (const [id, marker] of checks) {
    if (existsSync(marker)) detected.push(id);
  }
  if (existsSync(join(os.homedir(), '.config', 'opencode'))) detected.push('opencode');
  return detected;
}

const MCP_CONFIG = {
  mcpServers: {
    grasp: {
      command: 'npx',
      args: ['-y', 'grasp-mcp-server'],
      env: {},
    },
  },
};

const CODEX_TOML = `[mcp]
[[mcp.servers]]
name = "grasp"
command = "npx"
args = ["-y", "grasp-mcp-server"]
`;

const PRE_TOOL_USE_HOOK = `#!/bin/sh
# Grasp PreToolUse hook — enriches file edits with architecture context
FILE="$(echo "$CLAUDE_TOOL_INPUT" | node -e "const d=require('fs').readFileSync(0,'utf8');try{console.log(JSON.parse(d).path||'')}catch{}" 2>/dev/null)"
if [ -n "$FILE" ]; then
  npx grasp-mcp-server context "$GRASP_SOURCE" "$FILE" 2>/dev/null || true
fi
`;

const POST_TOOL_USE_HOOK = `#!/bin/sh
# Grasp PostToolUse hook — re-index brain store after git commit
if [ "$CLAUDE_TOOL_NAME" = "Bash" ]; then
  CMD="$(echo "$CLAUDE_TOOL_INPUT" | node -e "const d=require('fs').readFileSync(0,'utf8');try{console.log(JSON.parse(d).command||'')}catch{}" 2>/dev/null)"
  if echo "$CMD" | grep -q "^git commit"; then
    REPO="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)"
    npx grasp-mcp-server index "$REPO" 2>/dev/null || true
  fi
fi
`;

export interface SetupResult {
  editor: EditorId;
  written: string[];
  skipped: string[];
}

export function setupEditor(repoDir: string, editor: EditorId): SetupResult {
  const written: string[] = [];
  const skipped: string[] = [];
  const absDir = resolve(repoDir);

  if (editor === 'claude-code') {
    const dir = join(absDir, '.claude');
    mkdirSync(dir, { recursive: true });
    const mcpPath = join(dir, 'mcp.json');
    writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG, null, 2));
    written.push(mcpPath);
    const hooksDir = join(dir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const prePath = join(hooksDir, 'pre-tool-use.sh');
    const postPath = join(hooksDir, 'post-tool-use.sh');
    writeFileSync(prePath, PRE_TOOL_USE_HOOK);
    writeFileSync(postPath, POST_TOOL_USE_HOOK);
    written.push(prePath, postPath);
  } else if (editor === 'cursor') {
    const dir = join(absDir, '.cursor');
    mkdirSync(dir, { recursive: true });
    const mcpPath = join(dir, 'mcp.json');
    writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG, null, 2));
    written.push(mcpPath);
  } else if (editor === 'windsurf') {
    const dir = join(absDir, '.windsurf');
    mkdirSync(dir, { recursive: true });
    const mcpPath = join(dir, 'mcp.json');
    writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG, null, 2));
    written.push(mcpPath);
  } else if (editor === 'codex') {
    const dir = join(absDir, '.codex');
    mkdirSync(dir, { recursive: true });
    const tomlPath = join(dir, 'config.toml');
    writeFileSync(tomlPath, CODEX_TOML);
    written.push(tomlPath);
  } else if (editor === 'opencode') {
    const cfgDir = join(os.homedir(), '.config', 'opencode');
    mkdirSync(cfgDir, { recursive: true });
    const mcpPath = join(cfgDir, 'mcp.json');
    writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG, null, 2));
    written.push(mcpPath);
  }

  return { editor, written, skipped };
}

export function setupAll(repoDir: string): SetupResult[] {
  const editors = detectEditors(repoDir);
  if (editors.length === 0) editors.push('claude-code');
  return editors.map(e => setupEditor(repoDir, e));
}

// Legacy export preserved for cli.ts
export function generateHookScript(repoDir: string, editor: EditorId): string {
  if (editor === 'claude-code') {
    const result = setupEditor(repoDir, 'claude-code');
    return result.written.find(p => p.endsWith('pre-tool-use.sh')) ?? '';
  }
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

export function generateClaudeMd(repoDir: string, source: string): string {
  const p = join(repoDir, 'CLAUDE.md');
  writeFileSync(p, CLAUDE_MD_TEMPLATE(source));
  return p;
}

export function generateAgentsMd(
  repoDir: string,
  source: string,
  data?: import('./types.js').AnalysisResult,
): string {
  const p = join(repoDir, 'AGENTS.md');
  let content = `## Grasp Architecture Context\n\nBefore editing any file, run \`grasp context ${source} <file>\` for architectural context.\nRe-index after major changes: \`grasp index ${source}\`\n`;

  if (data) {
    content += `\n## Health\nGrade: ${data.summary.healthGrade} (${data.summary.healthScore}/100) | Files: ${data.summary.fileCount} | Functions: ${data.summary.functionCount}\n`;

    const topIssues = data.issues.filter((i: any) => i.type === 'critical').slice(0, 3);
    if (topIssues.length > 0) {
      content += `\n## Critical Issues\n`;
      for (const issue of topIssues) {
        content += `- **${(issue as any).title}**: ${(issue as any).desc}\n`;
      }
    }

    const folderMap = new Map<string, number>();
    for (const f of data.files) {
      if (!f.isCode) continue;
      const folder = f.path.includes('/') ? f.path.split('/')[0] : 'root';
      folderMap.set(folder, (folderMap.get(folder) ?? 0) + 1);
    }
    const topFolders = [...folderMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topFolders.length > 0) {
      content += `\n## Functional Areas\n`;
      for (const [folder, count] of topFolders) {
        content += `- \`${folder}/\`: ${count} files\n`;
      }
    }
  }

  writeFileSync(p, content);
  return p;
}

export function generateSkills(
  repoDir: string,
  data: import('./types.js').AnalysisResult,
): string[] {
  const skillsDir = join(repoDir, '.claude', 'skills', 'generated');
  mkdirSync(skillsDir, { recursive: true });

  const folderMap = new Map<string, typeof data.files>();
  for (const f of data.files) {
    if (!f.isCode) continue;
    const folder = f.path.includes('/') ? f.path.split('/')[0] : 'root';
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(f);
  }

  const fanIn = new Map<string, number>();
  for (const conn of data.connections) {
    fanIn.set(conn.source, (fanIn.get(conn.source) ?? 0) + conn.count);
  }

  const written: string[] = [];
  for (const [folder, files] of folderMap) {
    if (files.length < 2) continue;
    const keyFiles = files.sort((a, b) => (fanIn.get(b.path) ?? 0) - (fanIn.get(a.path) ?? 0)).slice(0, 5);
    const topFns = files.flatMap(f => f.functions.filter((fn: any) => fn.isExported)).slice(0, 10);
    const deps = [...new Set(
      data.connections
        .filter(c => files.some(f => f.path === c.target))
        .map(c => c.source.split('/')[0])
        .filter(d => d !== folder)
    )].slice(0, 5);

    const skillContent = `---
name: grasp-${folder}
description: Architecture context for the ${folder} functional area
---

# ${folder} — Architecture Skill

## Key Files
${keyFiles.map(f => `- \`${f.path}\` (${f.functions.length} functions, layer: ${f.layer})`).join('\n')}

## Exported API
${topFns.length > 0 ? topFns.map((fn: any) => `- \`${fn.name}\``).join('\n') : '(none exported)'}

## Cross-area Dependencies
${deps.length > 0 ? deps.map(d => `- \`${d}/\``).join('\n') : '(self-contained)'}

## Navigation
To explore this area: \`grasp context ${data.source} ${keyFiles[0]?.path ?? folder}\`
`;
    const skillPath = join(skillsDir, `${folder}.md`);
    writeFileSync(skillPath, skillContent);
    written.push(skillPath);
  }
  return written;
}
