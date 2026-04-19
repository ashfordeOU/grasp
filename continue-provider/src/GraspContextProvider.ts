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
    try {
      const res = await fetch(
        `${this.serverUrl}/analyze?file=${encodeURIComponent(query)}`
      );
      if (!res.ok) return this.fallback(query);
      const data = (await res.json()) as {
        dependencies?: Record<string, string[]>;
        healthScore?: number;
        healthGrade?: string;
      };
      return [
        {
          name: 'Grasp Dependency Graph',
          description: `Dependencies for ${query}`,
          content: JSON.stringify({ dependencies: data.dependencies ?? {} }, null, 2),
        },
        {
          name: 'Grasp Health Score',
          description: `Architecture health for current file`,
          content: `Grade: ${data.healthGrade ?? 'N/A'} · Score: ${data.healthScore ?? 0}/100`,
        },
      ];
    } catch {
      return this.fallback(query);
    }
  }

  private fallback(query: string): ContextItem[] {
    return [
      {
        name: 'Grasp (offline)',
        description: `Grasp server not running — start with: grasp-mcp`,
        content: `Run \`grasp-mcp\` to start the Grasp MCP server, then query: ${query}`,
      },
    ];
  }
}
