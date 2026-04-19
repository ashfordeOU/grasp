export interface AuditEvent { action: string; repo: string; apiKey: string; ip: string; timestamp?: string }

export class AuditLogger {
  private log: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.log.unshift({ ...event, timestamp: new Date().toISOString() });
    if (this.log.length > 10000) this.log.pop();
  }

  async query({ repo, since, limit }: { repo?: string; since?: string; limit: number }): Promise<AuditEvent[]> {
    return this.log
      .filter(e => (!repo || e.repo === repo) && (!since || (e.timestamp ?? '') >= since))
      .slice(0, limit);
  }
}
