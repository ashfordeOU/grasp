import type { FileEntry } from '../types.js';

export class BitbucketSource {
  private readonly baseUrl = 'https://api.bitbucket.org/2.0';

  constructor(
    private readonly workspace: string,
    private readonly repo: string,
    private readonly username: string,
    private readonly appPassword: string
  ) {}

  private get authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
  }

  async getFileTree(): Promise<FileEntry[]> {
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repo}/src?pagelen=100&fields=values.path,values.size,values.type`;
    const res = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`Bitbucket API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { values?: Array<{ path: string; size?: number; type?: string }> };
    return (data.values ?? [])
      .filter((f) => !f.type || f.type === 'commit_file')
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
    const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repo}/src/HEAD/${path}`;
    const res = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(`Bitbucket content fetch error: ${res.status} for ${path}`);
    }
    return res.text();
  }
}
