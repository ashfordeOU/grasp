import { Octokit } from '@octokit/rest';
import type { FileEntry } from '../types.js';

const MAX_FILES = 2000;
const CONCURRENCY = 20;

export class GitHubSource {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(owner: string, repo: string, token?: string, baseUrl?: string) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: token, baseUrl });
  }

  async getFileTree(): Promise<FileEntry[]> {
    // Get default branch
    const { data: repoData } = await this.octokit.repos.get({
      owner: this.owner,
      repo: this.repo,
    });
    const branch = repoData.default_branch || 'main';

    // Fetch full recursive tree in one request
    const { data: tree } = await this.octokit.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: branch,
      recursive: '1',
    });

    if (tree.truncated) {
      throw new Error(
        `Repository tree is too large (truncated). Only repos up to ~${MAX_FILES} files are supported.`
      );
    }

    return (tree.tree || [])
      .filter((item) => item.type === 'blob' && item.path)
      .slice(0, MAX_FILES)
      .map((item) => {
        const p = item.path!;
        const parts = p.split('/');
        return {
          path: p,
          name: parts[parts.length - 1],
          folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '/',
          size: item.size,
        };
      });
  }

  async getFileContent(path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });
      if (Array.isArray(data) || data.type !== 'file') return null;
      if (!('content' in data) || !data.content) return null;
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  async getFileCommitCount(path: string, limit = 10): Promise<number> {
    try {
      const { data } = await this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        path,
        per_page: limit,
      });
      return data.length;
    } catch {
      return 0;
    }
  }

  async fetchFilesParallel(
    files: FileEntry[],
    isCode: (name: string) => boolean,
    onProgress?: (done: number, total: number) => void
  ): Promise<Array<{ entry: FileEntry; content: string | null; churn: number }>> {
    const results: Array<{ entry: FileEntry; content: string | null; churn: number }> = new Array(files.length);
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        const f = files[i];
        try {
          if (isCode(f.name)) {
            const [content, churn] = await Promise.all([
              this.getFileContent(f.path),
              this.getFileCommitCount(f.path, 10).catch(() => 0),
            ]);
            results[i] = { entry: f, content, churn };
          } else {
            const content = await this.getFileContent(f.path).catch(() => null);
            results[i] = { entry: f, content, churn: 0 };
          }
        } catch {
          results[i] = { entry: f, content: null, churn: 0 };
        }
        completed++;
        onProgress?.(completed, files.length);
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return results.filter(Boolean);
  }
}

export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  // Accept: "owner/repo", "https://github.com/owner/repo", "github.com/owner/repo"
  const patterns = [
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/,
    /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  }
  return null;
}

export function parseGitHubEnterpriseUrl(
  input: string
): { host: string; owner: string; repo: string } | null {
  // Matches github.mycompany.com/owner/repo — any github.* that is NOT github.com or api.github.com
  const m = input.match(
    /(?:https?:\/\/)?([a-zA-Z0-9_.-]*github[a-zA-Z0-9_.-]*\.[a-zA-Z]{2,})\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i
  );
  if (
    m &&
    m[1].toLowerCase() !== 'github.com' &&
    m[1].toLowerCase() !== 'api.github.com' &&
    m[1].toLowerCase() !== 'gist.github.com' &&
    !m[1].toLowerCase().endsWith('github.io')
  ) {
    return { host: m[1], owner: m[2], repo: m[3].replace(/\.git$/, '') };
  }
  return null;
}
