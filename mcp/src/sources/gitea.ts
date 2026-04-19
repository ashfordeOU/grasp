import type { FileEntry } from '../types.js';

export class GiteaSource {
  constructor(
    private readonly baseUrl: string,
    private readonly owner: string,
    private readonly repo: string,
    private readonly token?: string
  ) {}

  private get headers(): Record<string, string> {
    return this.token ? { Authorization: `token ${this.token}` } : {};
  }

  async getFileTree(): Promise<FileEntry[]> {
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/git/trees/HEAD?recursive=true`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Gitea API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      tree?: Array<{ path: string; type: string; size?: number }>;
    };
    return (data.tree ?? [])
      .filter((f) => f.type === 'blob')
      .map((f) => {
        const parts = f.path.split('/');
        return {
          path: f.path,
          name: parts[parts.length - 1],
          folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '/',
          size: f.size ?? 0,
        };
      });
  }

  async getFileContent(path: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/raw/${path}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Gitea content fetch error: ${res.status} for ${path}`);
    }
    return res.text();
  }
}
