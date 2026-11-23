// modules/emailLog/services/emailLog.service.ts
//
// The email log: written from the mail sender, read by platform admins. Reading
// is guarded at the route (emaillog.read, platform-only); this service has no
// notion of who is asking because there is nothing to scope — the page shows
// every organisation's mail on purpose.
import { EmailLogRepository, type EmailLogListRow, type EmailLogSummary } from "../repositories/emailLog.repository";
import type { EmailLogFilters, EmailLogSummaryFilters } from "../domain/emailLogQuery";
import { EMAIL_LOG_RETENTION_DAYS, toLogRow, type EmailLogInput } from "../domain/emailLogRow";

const { buildMetaFromTotal } = require("../../../shared/pagination/paginate");

export class EmailLogService {
  static Instance = new EmailLogService();

  // True while a database error has already been reported and nothing has
  // succeeded since: one warning per outage, not one per email.
  private warned = false;

  constructor(private readonly repo: Pick<EmailLogRepository, "insertMany" | "list" | "summary" | "purgeOlderThan"> = EmailLogRepository.Instance) {}

  // Writes one row per recipient. NEVER throws and is never awaited by the
  // sender: logging an email must not break or delay sending it. A database
  // error is swallowed and reported once.
  async record(inputs: EmailLogInput[]): Promise<void> {
    try {
      if (!inputs.length) return;
      await this.repo.insertMany(inputs.map(toLogRow));
      this.warned = false;
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.warn(
          "[emailLog] could not record sent email (the email itself is unaffected); " +
            "further failures are not reported until one succeeds:",
          e instanceof Error ? e.message : e
        );
      }
    }
  }

  async list(filters: EmailLogFilters, page: number, limit: number) {
    const { rows, total } = await this.repo.list(filters, page, limit);
    return { data: rows as EmailLogListRow[], meta: buildMetaFromTotal(page, limit, total) };
  }

  summary(filters: EmailLogSummaryFilters): Promise<EmailLogSummary> {
    return this.repo.summary(filters);
  }

  // Deletes rows past the retention window. NEVER throws: it runs on a timer
  // and a failed sweep must not take the process down. Returns the rows removed.
  async purgeExpired(days = EMAIL_LOG_RETENTION_DAYS): Promise<number> {
    try {
      return await this.repo.purgeOlderThan(days);
    } catch (e) {
      console.error("[emailLog] retention purge failed:", e instanceof Error ? e.message : e);
      return 0;
    }
  }
}
