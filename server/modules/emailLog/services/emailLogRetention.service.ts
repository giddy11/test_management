// modules/emailLog/services/emailLogRetention.service.ts
//
// Keeps the email log to its retention window (90 days). ServiceDesk4u has no
// job runner, so this runs in-process on a timer, like the SLA sweeper. It is
// safe on several servers at once: the delete is one idempotent statement, and
// a second server finds nothing left to remove.
import { EmailLogService } from "./emailLog.service";

const SWEEP_EVERY_MS = 6 * 60 * 60_000;
const FIRST_SWEEP_AFTER_MS = 2 * 60_000;

export class EmailLogRetentionService {
  static Instance = new EmailLogRetentionService();

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly log: Pick<EmailLogService, "purgeExpired"> = EmailLogService.Instance) {}

  // Called once at boot (server.js).
  start(intervalMs = SWEEP_EVERY_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.sweep(), FIRST_SWEEP_AFTER_MS).unref?.();
  }

  // Never throws: purgeExpired already swallows and reports its own failures.
  async sweep(): Promise<number> {
    const removed = await this.log.purgeExpired();
    if (removed > 0) console.info(`[emailLog] removed ${removed} entr${removed === 1 ? "y" : "ies"} past retention`);
    return removed;
  }
}
