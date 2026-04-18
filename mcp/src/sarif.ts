/**
 * SARIF 2.1.0 serializer for Grasp analysis results.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/
 */

import type { AnalysisResult, SecurityIssue, Issue, LayerViolation } from './types.js';

// ── SARIF types (minimal subset needed) ─────────────────────────────────────

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId?: string };
    region?: { startLine: number };
  };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: { text: string };
  locations: SarifLocation[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: string };
  helpUri?: string;
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
  artifacts?: Array<{ location: { uri: string } }>;
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

// ── Rule catalogue ────────────────────────────────────────────────────────────

const RULES: Record<string, SarifRule> = {
  'grasp/security': {
    id: 'grasp/security',
    name: 'SecurityIssue',
    shortDescription: { text: 'Security vulnerability detected' },
    fullDescription: { text: 'Grasp detected a potential security issue such as a hardcoded secret, SQL injection risk, or insecure pattern.' },
    defaultConfiguration: { level: 'error' },
    helpUri: 'https://github.com/ashfordeOU/grasp#security-scanner',
  },
  'grasp/arch-violation': {
    id: 'grasp/arch-violation',
    name: 'ArchitectureViolation',
    shortDescription: { text: 'Architecture layer violation' },
    fullDescription: { text: 'A file imports from a layer that it should not depend on according to the architecture rules.' },
    defaultConfiguration: { level: 'warning' },
    helpUri: 'https://github.com/ashfordeOU/grasp#architecture-rule-engine',
  },
  'grasp/circular-dep': {
    id: 'grasp/circular-dep',
    name: 'CircularDependency',
    shortDescription: { text: 'Circular dependency detected' },
    fullDescription: { text: 'Two or more files form a circular import chain, which can cause runtime errors and makes code harder to reason about.' },
    defaultConfiguration: { level: 'warning' },
    helpUri: 'https://github.com/ashfordeOU/grasp#health-score',
  },
  'grasp/dead-code': {
    id: 'grasp/dead-code',
    name: 'DeadCode',
    shortDescription: { text: 'Dead code or unused export' },
    fullDescription: { text: 'A function, class, or file is defined but never imported or called by anything else in the codebase.' },
    defaultConfiguration: { level: 'note' },
    helpUri: 'https://github.com/ashfordeOU/grasp#health-score',
  },
  'grasp/high-complexity': {
    id: 'grasp/high-complexity',
    name: 'HighComplexity',
    shortDescription: { text: 'High cyclomatic complexity' },
    fullDescription: { text: 'A file has unusually high cyclomatic complexity, making it harder to test and maintain.' },
    defaultConfiguration: { level: 'warning' },
    helpUri: 'https://github.com/ashfordeOU/grasp#health-score',
  },
};

// ── Converters ────────────────────────────────────────────────────────────────

function severityToLevel(severity: string): SarifResult['level'] {
  switch (severity) {
    case 'critical':
    case 'high': return 'error';
    case 'medium':
    case 'warning': return 'warning';
    default: return 'note';
  }
}

function toLocation(file: string, line?: number): SarifLocation {
  return {
    physicalLocation: {
      artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
      ...(line != null ? { region: { startLine: line } } : {}),
    },
  };
}

function securityToSarif(s: SecurityIssue): SarifResult {
  return {
    ruleId: 'grasp/security',
    level: severityToLevel(s.severity),
    message: { text: `${s.type}: ${s.desc}${s.match ? ` — matched: ${s.match}` : ''}` },
    locations: [toLocation(s.file, s.line)],
  };
}

function layerViolationToSarif(v: LayerViolation): SarifResult {
  return {
    ruleId: 'grasp/arch-violation',
    level: 'warning',
    message: { text: `Layer violation: ${v.fromLayer} (${v.from}) → ${v.toLayer} (${v.to}) via '${v.fn}'` },
    locations: [toLocation(v.from)],
  };
}

function issueToSarif(issue: Issue): SarifResult[] {
  const results: SarifResult[] = [];
  const ruleId = issue.title.toLowerCase().includes('circular')
    ? 'grasp/circular-dep'
    : issue.title.toLowerCase().includes('dead') || issue.title.toLowerCase().includes('unused')
    ? 'grasp/dead-code'
    : issue.title.toLowerCase().includes('complex')
    ? 'grasp/high-complexity'
    : 'grasp/dead-code'; // fallback

  for (const item of issue.items) {
    const file = item.file ?? (item.files?.[0]) ?? '';
    if (!file) continue;
    results.push({
      ruleId,
      level: severityToLevel(issue.type),
      message: { text: `${issue.title}: ${issue.desc}${item.name ? ` — ${item.name}` : ''}` },
      locations: [toLocation(file, item.line)],
    });
  }
  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function toSarif(result: AnalysisResult): SarifLog {
  const sarifResults: SarifResult[] = [];
  const usedRuleIds = new Set<string>();

  // Security issues
  for (const s of result.security) {
    sarifResults.push(securityToSarif(s));
    usedRuleIds.add('grasp/security');
  }

  // Layer violations
  for (const v of result.layerViolations) {
    sarifResults.push(layerViolationToSarif(v));
    usedRuleIds.add('grasp/arch-violation');
  }

  // Grouped issues (circular deps, dead code, complexity)
  for (const issue of result.issues) {
    const converted = issueToSarif(issue);
    for (const r of converted) {
      sarifResults.push(r);
      usedRuleIds.add(r.ruleId);
    }
  }

  const rules = [...usedRuleIds].map(id => RULES[id]).filter(Boolean);

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Grasp',
            version: '2.0.0',
            informationUri: 'https://github.com/ashfordeOU/grasp',
            rules,
          },
        },
        results: sarifResults,
        artifacts: result.files.map(f => ({
          location: { uri: f.path },
        })),
      },
    ],
  };
}
