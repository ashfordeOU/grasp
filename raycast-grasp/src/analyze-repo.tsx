import React, { useState } from 'react';
import { Form, ActionPanel, Action, Detail, showToast, Toast } from '@raycast/api';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface FormValues {
  repo: string;
}

interface GraspSummary {
  grade: string;
  score: number;
  fileCount: number;
  issueCount: number;
  securityIssueCount: number;
  topIssues: string[];
}

export async function analyzeRepo(repo: string): Promise<GraspSummary | null> {
  if (!repo || !repo.includes('/')) {
    await showToast({ style: Toast.Style.Failure, title: 'Invalid repository', message: 'Format: owner/repo' });
    return null;
  }
  const toast = await showToast({ style: Toast.Style.Animated, title: 'Analysing…', message: repo });
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['grasp-mcp-server', 'analyze', repo, '--format', 'json'],
      { timeout: 120_000 },
    );
    const r = JSON.parse(stdout) as {
      summary?: { healthGrade?: string; healthScore?: number; fileCount?: number; issueCount?: number; securityIssueCount?: number };
      issues?: Array<{ description?: string }>;
    };
    const summary: GraspSummary = {
      grade: r.summary?.healthGrade ?? 'F',
      score: r.summary?.healthScore ?? 0,
      fileCount: r.summary?.fileCount ?? 0,
      issueCount: r.summary?.issueCount ?? 0,
      securityIssueCount: r.summary?.securityIssueCount ?? 0,
      topIssues: r.issues?.slice(0, 5).map(i => i.description ?? '').filter(Boolean) ?? [],
    };
    toast.style = Toast.Style.Success;
    toast.title = `Grade ${summary.grade} · ${summary.score}/100`;
    toast.message = `${summary.fileCount} files · ${summary.issueCount} issues`;
    return summary;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = 'Analysis failed';
    toast.message = String(err);
    return null;
  }
}

export default function Command() {
  const [repo, setRepo] = useState('');
  const [result, setResult] = useState<GraspSummary | null>(null);

  async function handleSubmit(values: FormValues) {
    const r = await analyzeRepo(values.repo);
    if (r) setResult(r);
  }

  if (result) {
    const emoji = result.grade === 'A' ? '✅' : result.grade <= 'C' ? '⚠️' : '❌';
    const issueLines = result.topIssues.length > 0
      ? '\n## Top Issues\n' + result.topIssues.map(i => `- ${i}`).join('\n')
      : '\n_No issues found._';
    const markdown = [
      `# ${emoji} Grasp Health Report`,
      `**Repository:** \`${repo}\``,
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Grade | **${result.grade}** |`,
      `| Score | ${result.score}/100 |`,
      `| Files | ${result.fileCount} |`,
      `| Issues | ${result.issueCount} |`,
      `| Security | ${result.securityIssueCount} |`,
      issueLines,
    ].join('\n');

    return (
      <Detail
        markdown={markdown}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="View Interactive Report"
              url={`https://ashfordeou.github.io/grasp?repo=${encodeURIComponent(repo)}`}
            />
            <Action title="Analyze Another Repo" onAction={() => setResult(null)} />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Analyze" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="repo"
        title="Repository"
        placeholder="owner/repo (e.g. ashfordeOU/grasp)"
        value={repo}
        onChange={setRepo}
      />
    </Form>
  );
}
