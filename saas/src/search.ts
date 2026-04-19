export interface IndexedFile { path: string; functions: string[] }
export interface SearchResult { repo: string; file: string; matches: string[] }

export class SearchIndex {
  private store = new Map<string, Array<{ path: string; functions: string[]; repo: string }>>();

  index(repo: string, files: IndexedFile[]): void {
    for (const f of files) {
      const terms = [f.path, ...f.functions].map(t => t.toLowerCase());
      for (const term of terms) {
        const existing = this.store.get(term) ?? [];
        existing.push({ path: f.path, functions: f.functions, repo });
        this.store.set(term, existing);
      }
    }
  }

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const [term, entries] of this.store.entries()) {
      if (term.includes(q)) {
        for (const e of entries) {
          results.push({ repo: e.repo, file: e.path, matches: e.functions.filter(f => f.toLowerCase().includes(q)) });
        }
      }
    }
    return results.slice(0, 50);
  }
}
