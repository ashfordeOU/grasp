// CSV exporter — emits three sheets (files, connections, issues) plus a
// concatenated bundle for single-payload delivery.

import type { AnalysisResult } from './types.js';
import { csvRow, buildFanMaps } from './graph-export-shared.js';

export function exportCsv(result: AnalysisResult): {
  files: string;
  connections: string;
  issues: string;
} {
  const { fanIn, fanOut } = buildFanMaps(result);
  const securityFiles = new Set((result.security ?? []).map(s => s.file).filter(Boolean));

  // files.csv
  const filesLines = [
    csvRow([
      'path',
      'layer',
      'language',
      'lines',
      'complexity',
      'churn',
      'fan_in',
      'fan_out',
      'has_security_issue',
    ]),
  ];
  for (const f of result.files) {
    const lang = f.path.includes('.') ? f.path.split('.').pop() ?? '' : '';
    filesLines.push(
      csvRow([
        f.path,
        f.layer ?? '',
        lang,
        f.lines ?? 0,
        f.complexity ?? 0,
        f.churn ?? 0,
        fanIn.get(f.path) ?? 0,
        fanOut.get(f.path) ?? 0,
        securityFiles.has(f.path) ? 'true' : 'false',
      ]),
    );
  }

  // connections.csv (aggregated). \x01 separator avoids collisions.
  const agg = new Map<string, number>();
  for (const c of result.connections) {
    const k = c.source + '\x01' + c.target;
    agg.set(k, (agg.get(k) ?? 0) + (c.count ?? 1));
  }
  const connLines = [csvRow(['source', 'target', 'count'])];
  for (const [k, count] of agg) {
    const [source, target] = k.split('\x01');
    connLines.push(csvRow([source, target, count]));
  }

  // issues.csv — flatten Issue.items + security findings.
  const issueLines = [csvRow(['type', 'severity', 'file', 'description'])];
  for (const iss of result.issues ?? []) {
    if (iss.items && iss.items.length) {
      for (const it of iss.items) {
        issueLines.push(
          csvRow([
            iss.title,
            iss.type,
            it.file ?? (it.files ? it.files.join(';') : '') ?? '',
            iss.desc,
          ]),
        );
      }
    } else {
      issueLines.push(csvRow([iss.title, iss.type, '', iss.desc]));
    }
  }
  for (const sec of result.security ?? []) {
    issueLines.push(csvRow([sec.type, sec.severity, sec.file, sec.desc]));
  }

  return {
    files: filesLines.join('\n'),
    connections: connLines.join('\n'),
    issues: issueLines.join('\n'),
  };
}

export function exportCsvBundle(result: AnalysisResult): string {
  const csv = exportCsv(result);
  return [
    '--- files.csv ---',
    csv.files,
    '',
    '--- connections.csv ---',
    csv.connections,
    '',
    '--- issues.csv ---',
    csv.issues,
    '',
  ].join('\n');
}
