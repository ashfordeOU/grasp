import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

export function isValidRepo(repo: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo);
}

interface AnalysisResponse {
  repo: string;
  grade: string;
  score: number;
  fileCount: number;
  issueCount: number;
  securityIssues: string[];
  issues: string[];
}

export async function analyzeRepo(repo: string): Promise<AnalysisResponse> {
  const { stdout } = await execFileAsync(
    'npx',
    ['grasp-mcp-server', 'analyze', repo, '--format', 'json'],
    { timeout: 120_000 },
  );
  const r = JSON.parse(stdout) as {
    summary?: { healthGrade?: string; healthScore?: number; fileCount?: number; issueCount?: number; securityIssueCount?: number };
    security?: Array<{ desc?: string }>;
    issues?: Array<{ description?: string }>;
  };
  return {
    repo,
    grade: r.summary?.healthGrade ?? 'F',
    score: r.summary?.healthScore ?? 0,
    fileCount: r.summary?.fileCount ?? 0,
    issueCount: r.summary?.issueCount ?? 0,
    securityIssues: r.security?.map(s => s.desc ?? '').filter(Boolean) ?? [],
    issues: r.issues?.map(i => i.description ?? '').filter(Boolean) ?? [],
  };
}

app.get('/analyze', async (req, res) => {
  const repo = req.query.repo as string;
  if (!repo || !isValidRepo(repo)) {
    res.status(400).json({ error: 'Invalid repo format. Expected: owner/repo' });
    return;
  }
  try {
    res.json(await analyzeRepo(repo));
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', detail: String(err) });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '3.21.0' });
});

export default app;
