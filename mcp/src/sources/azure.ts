import type { FileEntry } from '../types.js';

export class AzureSource {
  private readonly baseUrl: string;

  constructor(
    private readonly org: string,
    private readonly project: string,
    private readonly repo: string,
    private readonly pat: string
  ) {
    this.baseUrl = `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}`;
  }

  private get authHeader(): string {
    return 'Basic ' + Buffer.from(`:${this.pat}`).toString('base64');
  }

  async getFileTree(): Promise<FileEntry[]> {
    const url = `${this.baseUrl}/items?recursionLevel=Full&api-version=7.1`;
    const res = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`Azure DevOps API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      value?: Array<{ path: string; gitObjectType: string }>;
    };
    return (data.value ?? [])
      .filter((item) => item.gitObjectType === 'blob')
      .map((item) => {
        const p = item.path.replace(/^\//, '');
        const parts = p.split('/');
        return {
          path: p,
          name: parts[parts.length - 1],
          folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '/',
          size: 0,
        };
      });
  }

  async getFileContent(path: string): Promise<string> {
    const url = `${this.baseUrl}/items?path=/${path}&api-version=7.1`;
    const res = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`Azure content fetch error: ${res.status} for ${path}`);
    }
    return res.text();
  }
}
