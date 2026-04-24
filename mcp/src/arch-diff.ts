const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

function gradeWorsened(before: string, after: string): boolean {
  return GRADE_ORDER.indexOf(after) > GRADE_ORDER.indexOf(before);
}

export interface GradeDegradation {
  file: string;
  before: string;
  after: string;
  complexityDelta: number;
}

export interface ArchDiff {
  gradeDegradations: GradeDegradation[];
  healthDelta: number;
  newSecurityIssues: Array<{ severity: string; file: string; desc: string }>;
}

export function computeArchDiff(
  base: {
    files: Array<{ path: string; healthGrade: string; complexity: number }>;
    healthScore: number;
    security: Array<{ severity: string; file: string; desc: string }>;
  },
  current: {
    files: Array<{ path: string; healthGrade: string; complexity: number }>;
    healthScore: number;
    security: Array<{ severity: string; file: string; desc: string }>;
  }
): ArchDiff {
  const baseMap = new Map(base.files.map(f => [f.path, f]));
  const baseSecSet = new Set(base.security.map(s => `${s.file}:${s.desc}`));

  const gradeDegradations: GradeDegradation[] = [];
  for (const f of current.files) {
    const b = baseMap.get(f.path);
    if (b && gradeWorsened(b.healthGrade, f.healthGrade)) {
      gradeDegradations.push({ file: f.path, before: b.healthGrade, after: f.healthGrade, complexityDelta: f.complexity - b.complexity });
    }
  }

  const newSecurityIssues = current.security.filter(s => !baseSecSet.has(`${s.file}:${s.desc}`));

  return { gradeDegradations, healthDelta: current.healthScore - base.healthScore, newSecurityIssues };
}
