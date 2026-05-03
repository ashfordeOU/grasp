// Markdown rendering for the knowledge-gaps report. Split from the
// computation file so each piece stays below the critical-complexity
// threshold (>30 cyclomatic).

export function renderKnowledgeGapsMarkdown(
  isolated: string[],
  untested: Array<{ file: string; fan_in: number }>,
  weak: Array<{ layer: string; file_count: number; outgoing_edges: number }>,
): string {
  const lines: string[] = [];
  lines.push(`# Knowledge gaps\n`);
  renderIsolatedSection(lines, isolated);
  renderUntestedSection(lines, untested);
  renderWeakSection(lines, weak);
  return lines.join('\n');
}

function renderIsolatedSection(lines: string[], isolated: string[]): void {
  lines.push(`## Isolated files (${isolated.length})\n`);
  lines.push(`Code files with no callers and no callees — likely dead code, demo scripts, or undocumented utilities.\n`);
  if (isolated.length === 0) {
    lines.push(`_None._\n`);
    return;
  }
  for (const p of isolated.slice(0, 20)) lines.push(`- \`${p}\``);
  if (isolated.length > 20) lines.push(`- _…and ${isolated.length - 20} more_`);
  lines.push('');
}

function renderUntestedSection(lines: string[], untested: Array<{ file: string; fan_in: number }>): void {
  lines.push(`## Untested hotspots (${untested.length})\n`);
  lines.push(`Files with > 5 dependents but no matching test file. Each is a high-impact candidate for new tests.\n`);
  if (untested.length === 0) {
    lines.push(`_None._\n`);
    return;
  }
  lines.push(`| File | dependents |`);
  lines.push(`|------|-----------:|`);
  for (const u of untested.slice(0, 20)) lines.push(`| \`${u.file}\` | ${u.fan_in} |`);
  if (untested.length > 20) lines.push(`| _…and ${untested.length - 20} more_ | |`);
  lines.push('');
}

function renderWeakSection(lines: string[], weak: Array<{ layer: string; file_count: number; outgoing_edges: number }>): void {
  lines.push(`## Weak communities (${weak.length})\n`);
  lines.push(`Layers with fewer than 3 files but more than 5 outgoing cross-layer edges — small modules that are heavily depended on (or that reach across many other layers).\n`);
  if (weak.length === 0) {
    lines.push(`_None._\n`);
    return;
  }
  lines.push(`| Layer | files | outgoing edges |`);
  lines.push(`|-------|------:|---------------:|`);
  for (const w of weak) lines.push(`| ${w.layer} | ${w.file_count} | ${w.outgoing_edges} |`);
  lines.push('');
}
