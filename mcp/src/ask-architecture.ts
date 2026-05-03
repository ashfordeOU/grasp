import type { SearchableBrainStore as BrainStore } from './brain-search.js';
import {
  handleComplexity,
  handleSecurity,
  handleCoupling,
  handleGrade,
  handleChurn,
  handleLayer,
  handleCycles,
} from './ask-architecture-handlers.js';

type Intent = 'complexity' | 'coupling' | 'security' | 'blast-radius' | 'layer' | 'grade' | 'churn' | 'cycles';

const INTENT_PATTERNS: Array<[RegExp, Intent]> = [
  [/blast.?radius|highest.?blast|most.?coupled/, 'blast-radius'],
  [/security|vuln|injection|secret|xss|csrf/, 'security'],
  [/circular|cycle|cyclic.?dep/, 'cycles'],
  [/churn|most.?changed|frequently.?modified|hotspot/, 'churn'],
  [/complex|complexity|cyclomatic/, 'complexity'],
  [/coupling|dependencies|dependents|coupled/, 'coupling'],
  [/grade|health.?grade|[A-F]\s+grade/, 'grade'],
  [/layer|architecture|services|utils|data/, 'layer'],
];

function detectIntent(q: string): Intent {
  const lower = q.toLowerCase();
  for (const [re, intent] of INTENT_PATTERNS) {
    if (re.test(lower)) return intent;
  }
  return 'complexity';
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

  let handled = false;
  if (intent === 'complexity') handled = handleComplexity(brain, source, lines);
  else if (intent === 'security') handled = handleSecurity(brain, source, lines);
  else if (intent === 'blast-radius' || intent === 'coupling') handled = handleCoupling(brain, source, lines);
  else if (intent === 'grade') handled = handleGrade(brain, source, extractGradeFilter(question), lines);
  else if (intent === 'churn') handled = handleChurn(brain, source, lines);
  else if (intent === 'layer') handled = handleLayer(brain, source, lines);
  else if (intent === 'cycles') handled = handleCycles(repo, lines);

  if (!handled) return searchArchitecture(brain, source, question);
  return lines.join('\n');
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
