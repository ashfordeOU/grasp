// Suggested review questions — composed from the four other primitives
// plus circular deps, duplicates, and layer violations.

import type { AnalysisResult } from './types.js';
import { hubNodes } from './graph-hubs.js';
import { bridgeNodes } from './graph-bridges.js';
import { surprisingConnections } from './graph-surprising.js';
import { knowledgeGaps, type KnowledgeGapsReport } from './graph-knowledge-gaps.js';

export interface SuggestedQuestion {
  question: string;
  why: string;
  category: 'hub' | 'bridge' | 'surprising' | 'gap' | 'circular' | 'duplicate' | 'general';
}

export interface SuggestedQuestionsReport {
  markdown: string;
  questions: SuggestedQuestion[];
}

function questionFromHub(result: AnalysisResult): SuggestedQuestion | null {
  const hubs = hubNodes(result, 3).rows;
  if (hubs.length === 0) return null;
  const top = hubs[0];
  return {
    question: `Why does \`${top.file}\` have ${top.total} total connections (fan-in ${top.fan_in}, fan-out ${top.fan_out})? Is it the right abstraction level, or has it become a god-object?`,
    why: `It is the most-connected node in the codebase; changes here ripple the widest.`,
    category: 'hub',
  };
}

function questionFromBridge(result: AnalysisResult): SuggestedQuestion | null {
  const bridges = bridgeNodes(result, 3).rows;
  if (bridges.length === 0) return null;
  const top = bridges[0];
  return {
    question: `Why does \`${top.file}\` sit on the critical path between so many components (betweenness ${top.betweenness.toFixed(4)})?`,
    why: `Bridge nodes are chokepoints — outage or breaking change here splits the codebase in two.`,
    category: 'bridge',
  };
}

function questionFromSurprising(result: AnalysisResult): SuggestedQuestion | null {
  const surp = surprisingConnections(result, 3).rows;
  if (surp.length === 0) return null;
  const top = surp[0];
  return {
    question: `Why does the \`${top.source_layer}\` layer (\`${top.source}\`) call into the \`${top.target_layer}\` layer (\`${top.target}\`) directly? Is this an intentional shortcut?`,
    why: `This layer-pair appears in only ${(100 - top.rarity_pct).toFixed(1)}% of cross-layer edges, suggesting it might be an architectural anomaly.`,
    category: 'surprising',
  };
}

function questionsFromGaps(gaps: KnowledgeGapsReport): SuggestedQuestion[] {
  const out: SuggestedQuestion[] = [];
  if (gaps.untested_hotspots.length > 0) {
    const top = gaps.untested_hotspots[0];
    out.push({
      question: `Why does \`${top.file}\` have no tests despite ${top.fan_in} files depending on it?`,
      why: `Untested hotspots carry the highest defect risk — a regression here breaks ${top.fan_in} other files.`,
      category: 'gap',
    });
  }
  if (gaps.isolated_files.length > 0) {
    out.push({
      question: `Are the ${gaps.isolated_files.length} isolated file(s) (e.g. \`${gaps.isolated_files[0]}\`) dead code, demos, or hidden APIs? Can they be removed?`,
      why: `Isolated files have no callers and no callees — they are either dead, examples, or have undeclared usage (reflection, dynamic imports).`,
      category: 'gap',
    });
  }
  if (gaps.weak_communities.length > 0) {
    const top = gaps.weak_communities[0];
    out.push({
      question: `The \`${top.layer}\` layer has only ${top.file_count} file(s) but ${top.outgoing_edges} outgoing edges. Is it a thin wrapper that should be merged, or a real cross-cutting concern?`,
      why: `Tiny layers with high coupling are usually either over-engineered or under-developed; both deserve a second look.`,
      category: 'gap',
    });
  }
  return out;
}

function questionsFromCirculars(result: AnalysisResult): SuggestedQuestion[] {
  const circulars = (result.issues ?? []).filter(i =>
    i.title.toLowerCase().includes('circular') || (i.type === 'critical' && /circ/i.test(i.title))
  );
  if (circulars.length > 0 && (circulars[0].items?.length ?? 0) > 0) {
    const item = circulars[0].items[0];
    return [{
      question: `Should the circular dependency in \`${item.file ?? item.name}\` be broken? What is the right way to invert it?`,
      why: `Circular deps prevent independent reasoning, testing, and packaging — they are the canonical refactor target.`,
      category: 'circular',
    }];
  }
  if ((result.summary?.circularDepCount ?? 0) > 0) {
    return [{
      question: `Why does the codebase have ${result.summary.circularDepCount} circular dependencies? Which is the easiest to break?`,
      why: `Each circular cluster is a refactor candidate; sorting by smallest cluster gives the cheapest win.`,
      category: 'circular',
    }];
  }
  return [];
}

function questionFromDuplicates(result: AnalysisResult): SuggestedQuestion | null {
  if ((result.duplicates?.length ?? 0) === 0) return null;
  const top = result.duplicates![0];
  const fileList = top.files.slice(0, 3).map(f => `\`${f.file}\``).join(', ');
  return {
    question: `Are the ${top.count} copies of \`${top.name}\` (in ${fileList}) intentional, or should they be extracted into a shared module?`,
    why: `Duplicates increase change-amplification cost — fixing a bug means N edits instead of one.`,
    category: 'duplicate',
  };
}

function questionFromLayerViolation(result: AnalysisResult): SuggestedQuestion | null {
  if ((result.layerViolations?.length ?? 0) === 0) return null;
  const v = result.layerViolations![0];
  return {
    question: `Why does \`${v.from}\` (${v.fromLayer}) violate the layering rule by calling \`${v.to}\` (${v.toLayer}) via \`${v.fn}\`?`,
    why: `Layer violations erode architecture intent over time; each one normalises the next.`,
    category: 'surprising',
  };
}

function fallbackHealthQuestion(result: AnalysisResult): SuggestedQuestion | null {
  if (!result.summary) return null;
  return {
    question: `The repo has a health score of ${result.summary.healthScore}/100 (grade ${result.summary.healthGrade}). What are the three highest-impact fixes the team could ship this sprint?`,
    why: `A concrete, time-boxed prioritisation forces the team to convert metrics into action.`,
    category: 'general',
  };
}

export function suggestedQuestions(result: AnalysisResult): SuggestedQuestionsReport {
  const questions: SuggestedQuestion[] = [];

  const hub = questionFromHub(result);
  if (hub) questions.push(hub);

  const bridge = questionFromBridge(result);
  if (bridge) questions.push(bridge);

  const surp = questionFromSurprising(result);
  if (surp) questions.push(surp);

  const gaps = knowledgeGaps(result);
  questions.push(...questionsFromGaps(gaps));
  questions.push(...questionsFromCirculars(result));

  const dup = questionFromDuplicates(result);
  if (dup) questions.push(dup);

  const layer = questionFromLayerViolation(result);
  if (layer) questions.push(layer);

  if (questions.length < 5) {
    const fb = fallbackHealthQuestion(result);
    if (fb) questions.push(fb);
  }

  const capped = questions.slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Suggested review questions\n`);
  lines.push(`Auto-generated from this session's hubs, bridges, layer crossings, gaps, circular deps, and duplicates. Use them as the opening agenda for the next architecture review.\n`);
  capped.forEach((q, i) => {
    lines.push(`${i + 1}. **${q.question}**`);
    lines.push(`   _${q.why}_\n`);
  });
  if (capped.length === 0) {
    lines.push(`_No notable findings — the codebase looks healthy from this analysis._`);
  }

  return { markdown: lines.join('\n'), questions: capped };
}
