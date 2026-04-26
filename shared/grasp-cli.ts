import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GraspResult {
  grade: string;
  score: number;
  fileCount: number;
  issues: string[];
}

export async function fetchGraspResult(repo: string): Promise<GraspResult> {
  const { stdout } = await execFileAsync(
    'npx',
    ['grasp-mcp-server', 'analyze', repo, '--format', 'json'],
    { timeout: 120_000 },
  );
  const r = JSON.parse(stdout) as {
    summary?: { healthGrade?: string; healthScore?: number; fileCount?: number };
    issues?: Array<{ description?: string }>;
  };
  return {
    grade: r.summary?.healthGrade ?? 'F',
    score: r.summary?.healthScore ?? 0,
    fileCount: r.summary?.fileCount ?? 0,
    issues: r.issues?.slice(0, 5).map(i => i.description ?? '').filter(Boolean) ?? [],
  };
}
