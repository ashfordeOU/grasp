import { watch, FSWatcher } from 'fs';
import type { BrainStore } from './brain.js';

const DEBOUNCE_MS = 500;

export class WatchDaemon {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly watchDir: string,
    private readonly brain: BrainStore,
    private readonly reindex: () => Promise<void>,
    private readonly debounceMs: number = DEBOUNCE_MS,
  ) {}

  start(): void {
    this.watcher = watch(this.watchDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.reindex().catch(() => {});
      }, this.debounceMs);
    });
  }

  stop(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
  }
}
