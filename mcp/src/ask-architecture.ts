import type { SearchableBrainStore as BrainStore } from './brain-search.js';

type Intent = 'complexity' | 'coupling' | 'security' | 'blast-radius' | 'layer' | 'grade' | 'churn' | 'cycles';

function detectIntent(q: string): Intent {
  const lower = q.toLowerCase();
  if (/blast.?radius|highest.?blast|most.?coupled/.test(lower)) return 'blast-radius';
  if (/security|vuln|injection|secret|xss|csrf/.test(lower)) return 'security';
  if (/circular|cycle|cyclic.?dep/.test(lower)) return 'cycles';
  if (/churn|most.?changed|frequently.?modified|hotspot/.test(lower)) return 'churn';
  if (/complex|complexity|cyclomatic/.test(lower)) return 'complexity';
  if (/coupling|dependencies|dependents|coupled/.test(lower)) return 'coupling';
  if (/grade|health.?grade|[A-F]\s+grade/.test(lower)) return 'grade';
  if (/layer|architecture|services|utils|data/.test(lower)) return 'layer';
  return 'complexity';  // default
}

function extractGradeFilter(q: string): string | null {
  const m = q.match(/\b([A-F])\s*(grade|files?)\b/i);
  return m ? m[1].toUpperCase() : null;
}

export async function askArchitecture(brain: BrainStore, source: string, question: string): Promise<string> {
  const repo = brain.getRepo(source);
  if (!repo) return `Source "${source}" is not indexed. Run: grasp index ${source}`;

  const intent = detectIntent(question);
  const lines: string[] = [`Intent: ${intent}`, ''];

  if (intent === 'complexity') {
    const files = brain.queryFiles(source, { minComplexity: 5, limit: 10 });
    if (files.length === 0) return 'No complex files found (complexity ≥ 5).';
    lines.push('Most complex files:');
    files.forEach(f => lines.push(`  ${f.path}  complexity=${f.complexity}  grade=${f.healthGrade}`));
  } else if (intent === 'security') {
    // query files with security_json via getFileContext — iterate all files
    const files = brain.queryFiles(source, { limit: 10000 });
    const withSecurity: Array<{ path: string; issues: Array<{ severity: string; desc: string }> }> = [];
    for (const f of files) {
      const ctx = brain.getFileContext(source, f.path);
      if (ctx && ctx.security.length > 0) withSecurity.push({ path: f.path, issues: ctx.security });
    }
    if (withSecurity.length === 0) return 'No security issues found in brain data.';
    lines.push(`Security issues found in ${withSecurity.length} file(s):`);
    withSecurity.forEach(f => f.issues.forEach(i => lines.push(`  [${i.severity}] ${f.path}: ${i.desc}`)));
  } else if (intent === 'blast-radius' || intent === 'coupling') {
    const files = brain.queryFiles(source, { limit: 20 });
    const sorted = files.sort((a, b) => (b.couplingOut + b.couplingIn) - (a.couplingOut + a.couplingIn));
    lines.push('Files with highest coupling (blast radius):');
    sorted.slice(0, 10).forEach(f => lines.push(`  ${f.path}  in=${f.couplingIn} out=${f.couplingOut}`));
  } else if (intent === 'grade') {
    const gradeFilter = extractGradeFilter(question);
    const files = brain.queryFiles(source, { limit: 10000 });
    const filtered = gradeFilter ? files.filter(f => f.healthGrade === gradeFilter) : files.sort((a, b) => ['A','B','C','D','F'].indexOf(b.healthGrade) - ['A','B','C','D','F'].indexOf(a.healthGrade)).slice(0, 10);
    if (filtered.length === 0) return `No files with grade ${gradeFilter ?? 'D/F'} found.`;
    lines.push(gradeFilter ? `Files with grade ${gradeFilter}:` : 'Worst-graded files:');
    filtered.slice(0, 10).forEach(f => lines.push(`  ${f.path}  grade=${f.healthGrade}  complexity=${f.complexity}`));
  } else if (intent === 'churn') {
    const files = brain.queryFiles(source, { limit: 10000 });
    const sorted = files.sort((a, b) => b.churn - a.churn).slice(0, 10);
    lines.push('Most churned files:');
    sorted.forEach(f => lines.push(`  ${f.path}  churn=${f.churn}  grade=${f.healthGrade}`));
  } else if (intent === 'layer') {
    const files = brain.queryFiles(source, { limit: 10000 });
    const byLayer: Record<string, number> = {};
    files.forEach(f => { byLayer[f.layer] = (byLayer[f.layer] ?? 0) + 1; });
    lines.push('Architecture layers:');
    Object.entries(byLayer).sort((a, b) => b[1] - a[1]).forEach(([l, n]) => lines.push(`  ${l}: ${n} file(s)`));
  } else if (intent === 'cycles') {
    lines.push(`Circular dependency count: ${repo.circularDepCount}`);
    if (repo.circularDepCount === 0) lines.push('  No circular dependencies detected.');
  }

  const answer = lines.join('\n');
  // If intent was recognized but its branch produced no data rows, fall back to hybrid search
  if (answer.trim() === `Intent: ${intent}`) {
    return searchArchitecture(brain, source, question);
  }
  return answer;
}

export async function searchArchitecture(brain: BrainStore, source: string, query: string): Promise<string> {
  const results = await brain.hybridSearch(source, query, 10);
  if (results.length === 0) return `No results found for "${query}".`;
  const lines = [`Hybrid search results for "${query}":`, ''];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.filePath}${r.fnName ? ` → ${r.fnName}` : ''}`);
    lines.push(`   layer=${r.layer}  complexity=${r.complexity}  score=${r.score.toFixed(4)}`);
    if (r.processes.length > 0) lines.push(`   processes: ${r.processes.join(', ')}`);
  });
  return lines.join('\n');
}
