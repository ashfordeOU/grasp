import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ContextItem {
  name: string;
  description: string;
  content: string;
}

export interface ProviderConfig {
  graspServerUrl?: string;
}

export class GraspContextProvider {
  private readonly serverUrl: string;

  constructor(config: ProviderConfig = {}) {
    this.serverUrl = config.graspServerUrl ?? 'http://localhost:3000';
  }

  async getContextItems(query: string, _extras: unknown): Promise<ContextItem[]> {
    // Primary: run CLI directly (works without a running server)
    try {
      const { stdout } = await execFileAsync(
        'npx',
        ['grasp-mcp-server', 'analyze', query, '--format', 'json'],
        { timeout: 120_000 },
      );
      const r = JSON.parse(stdout) as {
        summary?: { healthGrade?: string; healthScore?: number; fileCount?: number; issueCount?: number };
        files?: Array<{ path: string; complexity: number; healthGrade: string }>;
        security?: Array<{ file: string; severity: string; desc: string }>;
        issues?: Array<{ description?: string }>;
      };
      const grade = r.summary?.healthGrade ?? 'N/A';
      const score = r.summary?.healthScore ?? 0;
      const hotspots = (r.files ?? [])
        .sort((a, b) => b.complexity - a.complexity)
        .slice(0, 5)
        .map(f => `- \`${f.path}\` complexity ${f.complexity} · grade ${f.healthGrade}`)
        .join('\n');
      const securityLines = r.security?.map(s => `- [${s.severity}] \`${s.file}\`: ${s.desc}`).join('\n') ?? '';
      return [
        {
          name: 'Grasp Health Summary',
          description: `Architecture health for ${query}`,
          content: `Grade: ${grade} · Score: ${score}/100 · ${r.summary?.fileCount ?? 0} files · ${r.summary?.issueCount ?? 0} issues`,
        },
        {
          name: 'Grasp Complexity Hotspots',
          description: 'Top 5 most complex files',
          content: hotspots || 'No files analysed.',
        },
        {
          name: 'Grasp Security Issues',
          description: 'Security findings',
          content: securityLines || 'No security issues found.',
        },
      ];
    } catch {
      // Fallback: try HTTP endpoint (if grasp SaaS or local server is running)
      try {
        const res = await fetch(`${this.serverUrl}/analyze?file=${encodeURIComponent(query)}`);
        if (!res.ok) return this.offline(query);
        const data = (await res.json()) as { healthGrade?: string; healthScore?: number };
        return [
          {
            name: 'Grasp Health Score',
            description: `Architecture health for ${query}`,
            content: `Grade: ${data.healthGrade ?? 'N/A'} · Score: ${data.healthScore ?? 0}/100`,
          },
        ];
      } catch {
        return this.offline(query);
      }
    }
  }

  private offline(query: string): ContextItem[] {
    return [
      {
        name: 'Grasp (offline)',
        description: 'grasp-mcp-server not found — install it to enable context',
        content: `Install: \`npm install -g grasp-mcp-server\`\nThen re-open this file: ${query}`,
      },
    ];
  }
}
