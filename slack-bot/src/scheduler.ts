/**
 * Cron-based scheduler for Grasp health alerts and weekly digests.
 *
 * Alert cadence:
 *   - After each analysis: compare with previous result → alert if thresholds exceeded
 *   - Weekly digest: every Monday 9am UTC (configurable)
 *
 * Usage:
 *   import { GraspBot } from './scheduler.js';
 *   const bot = new GraspBot(config, analyzeRepo);
 *   bot.start();
 */

import cron from 'node-cron';
import type { HealthSnapshot, AlertThresholds } from './formatter.js';
import {
  buildSlackAlert, buildSlackDigest,
  buildTeamsAlert, buildTeamsDigest,
  shouldAlert,
} from './formatter.js';
import { sendWebhook, type BotConfig } from './sender.js';

export type AnalyzeRepoFn = (repo: string) => Promise<HealthSnapshot | null>;

export class GraspBot {
  private readonly previousSnapshots = new Map<string, HealthSnapshot>();
  private digestTask: cron.ScheduledTask | null = null;
  private alertTask: cron.ScheduledTask | null = null;

  constructor(
    private readonly config: BotConfig,
    private readonly analyzeRepo: AnalyzeRepoFn,
  ) {}

  /** Start the scheduled tasks. */
  start(): void {
    const digestCron = this.config.digestCron ?? '0 9 * * 1';

    // Weekly digest
    this.digestTask = cron.schedule(digestCron, () => {
      this.runDigest().catch(err => console.error('[grasp-bot] Digest error:', err));
    }, { timezone: 'UTC' });

    // Alert check every hour
    this.alertTask = cron.schedule('0 * * * *', () => {
      this.runAlertCheck().catch(err => console.error('[grasp-bot] Alert error:', err));
    }, { timezone: 'UTC' });

    console.log(`[grasp-bot] Started. Watching ${this.config.repos.length} repos. Digest: ${digestCron}`);
  }

  /** Stop all scheduled tasks. */
  stop(): void {
    this.digestTask?.stop();
    this.alertTask?.stop();
  }

  /** Run an immediate alert check for all configured repos. */
  async runAlertCheck(): Promise<void> {
    for (const repo of this.config.repos) {
      try {
        const snapshot = await this.analyzeRepo(repo);
        if (!snapshot) continue;

        const previous = this.previousSnapshots.get(repo) ?? null;
        const decision = shouldAlert(snapshot, previous, this.config.thresholds);

        if (decision.shouldAlert) {
          await this.sendAlert(snapshot);
        }

        this.previousSnapshots.set(repo, snapshot);
      } catch (err) {
        console.error(`[grasp-bot] Error analyzing ${repo}:`, err);
      }
    }
  }

  /** Run an immediate weekly digest for all configured repos. */
  async runDigest(): Promise<void> {
    const snapshots: HealthSnapshot[] = [];

    for (const repo of this.config.repos) {
      try {
        const snapshot = await this.analyzeRepo(repo);
        if (snapshot) snapshots.push(snapshot);
      } catch (err) {
        console.error(`[grasp-bot] Error analyzing ${repo} for digest:`, err);
      }
    }

    if (snapshots.length === 0) return;

    const weekOf = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    if (this.config.slackWebhookUrl) {
      const payload = buildSlackDigest(snapshots, weekOf);
      await sendWebhook(this.config.slackWebhookUrl, payload);
    }
    if (this.config.teamsWebhookUrl) {
      const payload = buildTeamsDigest(snapshots, weekOf);
      await sendWebhook(this.config.teamsWebhookUrl, payload);
    }
  }

  private async sendAlert(snapshot: HealthSnapshot): Promise<void> {
    const thresholds: Partial<AlertThresholds> = this.config.thresholds ?? {};

    if (this.config.slackWebhookUrl) {
      const payload = buildSlackAlert(snapshot, thresholds);
      const result = await sendWebhook(this.config.slackWebhookUrl, payload);
      if (!result.ok) {
        console.warn(`[grasp-bot] Slack alert failed (${result.status}): ${result.body}`);
      }
    }
    if (this.config.teamsWebhookUrl) {
      const payload = buildTeamsAlert(snapshot, thresholds);
      const result = await sendWebhook(this.config.teamsWebhookUrl, payload);
      if (!result.ok) {
        console.warn(`[grasp-bot] Teams alert failed (${result.status}): ${result.body}`);
      }
    }
  }

  /** Expose for testing — force a snapshot for a repo. */
  setPreviousSnapshot(repo: string, snapshot: HealthSnapshot): void {
    this.previousSnapshots.set(repo, snapshot);
  }

  getPreviousSnapshot(repo: string): HealthSnapshot | undefined {
    return this.previousSnapshots.get(repo);
  }
}
