export interface PerfFinding {
  file: string;
  line: number;
  pattern: 'n+1' | 'sync-io' | 'serialization-in-loop' | 'missing-await';
  severity: 'critical' | 'warning';
  message: string;
  suggestion: string;
}

export interface PerfAnalysisResult {
  findings: PerfFinding[];
  criticalCount: number;
  warningCount: number;
}

export function analyzePerfPatterns(
  files: Array<{ path: string; content: string; layer: string }>,
): PerfAnalysisResult {
  const findings: PerfFinding[] = [];

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split('\n');
    let inLoop = false;
    let loopDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track loop context
      if (/^\s*(?:for|while)\s*[\s(]/.test(line)) {
        inLoop = true;
        loopDepth++;
      }
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      if (inLoop) {
        loopDepth += openBraces - closeBraces;
        if (loopDepth <= 0) { inLoop = false; loopDepth = 0; }
      }

      // N+1: ORM/DB call inside a loop
      if (inLoop && /(?:await\s+)?(?:\w+\.)?(?:find|findOne|findAll|findById|query|execute|fetch)\s*\(/.test(line)) {
        findings.push({
          file: file.path, line: i + 1, pattern: 'n+1', severity: 'critical',
          message: 'Database/ORM call inside a loop — potential N+1 query',
          suggestion: 'Batch the query outside the loop using findAll with an IN clause or equivalent.',
        });
      }

      // Sync I/O
      if (/fs\.readFileSync|fs\.writeFileSync|fs\.existsSync|execSync/.test(line)) {
        findings.push({
          file: file.path, line: i + 1, pattern: 'sync-io', severity: 'warning',
          message: 'Synchronous I/O call blocks the event loop',
          suggestion: 'Replace with the async equivalent (fs.promises.readFile, etc.).',
        });
      }

      // Serialization in loop
      if (inLoop && /JSON\.stringify|JSON\.parse/.test(line)) {
        findings.push({
          file: file.path, line: i + 1, pattern: 'serialization-in-loop', severity: 'warning',
          message: 'JSON serialization inside a loop — O(n) allocation pressure',
          suggestion: 'Move serialization outside the loop or use streaming serialization.',
        });
      }
    }
  }

  return {
    findings,
    criticalCount: findings.filter(f => f.severity === 'critical').length,
    warningCount: findings.filter(f => f.severity === 'warning').length,
  };
}
