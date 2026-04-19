export interface HealthSnapshot { score: number; grade: string; fileCount: number; analyzedAt: string }

export class HistoryStore {
  private store = new Map<string, HealthSnapshot[]>();

  async record(repo: string, snapshot: HealthSnapshot): Promise<void> {
    const existing = this.store.get(repo) ?? [];
    existing.push(snapshot);
    // keep most recent 90 entries; slice from the end
    this.store.set(repo, existing.slice(-90));
  }

  async get(repo: string, days: number): Promise<HealthSnapshot[]> {
    const all = this.store.get(repo) ?? [];
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    return all.filter(s => s.analyzedAt >= cutoff);
  }
}
