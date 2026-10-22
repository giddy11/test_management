// modules/sla/services/slaEscalation.service.ts
// The sweeper: finds open tickets, bugs and feature requests past their SLA
// target and escalates them — the same three levels as IT requests, measured
// against each target (first response, resolution) separately.
//
//   level 1  remind whoever is holding it up — a ticket's assignees (or its IT
//            queue), a bug's assignee. Nobody, or a feature request: the SLA
//            administrators, so a breach never goes unseen.
//   level 2  the same people, plus the escalation contacts (or, when none are
//            configured, whoever holds sla.configure)
//   level 3  the same again, marked critical
//
// TestMate has no job runner, so this runs in-process: on a timer, and on demand
// when someone opens the SLA dashboard. A Postgres advisory lock means only one
// server sweeps at a time, and the unique (issue, target, level) row means a
// level is never sent twice — so running it too often is harmless.
//
// Only issues created after escalation was switched on are considered
// (settings.escalationSince): switching it on never fires for the backlog.
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { SlaRepository, REFERENCE_PREFIX } from "../repositories/sla.repository";
import { SlaEscalationRepository, type OverdueIssue, type SlaPerson } from "../repositories/slaEscalation.repository";
import { rulesFromSettings } from "./sla.service";
import { sendServiceRequestEmail } from "../../../shared/utils/mail/serviceDesk.mail";
import { ServiceDeskRepository } from "../../serviceDesk/repositories/serviceDesk.repository";

const { ActivityService } = require("../../activity/services/activity.service");
const { NotificationRepository } = require("../../notification/repositories/notification.repository");
const { NotificationType } = require("../../../config/constants");
const { env } = require("../../../config/env");
const { NotificationCategory, NotificationChannel, wants } = require("../../notification/domain/notificationPreferences");
const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

// Any fixed 32-bit number, unique to this job across the app (IT requests use ...031).
const LOCK_KEY = 74_210_032;
const BATCH = 200;
const MIN_GAP_MS = 60_000;
const SLA_ADMIN_PERMISSION = "sla.configure";

const NOUN: Record<string, string> = { ticket: "ticket", bug: "bug", feature_request: "feature request" };

export class SlaEscalationService {
  static Instance = new SlaEscalationService();

  private running = false;
  private lastRun = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly slaRepo = SlaRepository.Instance,
    private readonly repo = SlaEscalationRepository.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly notifications = NotificationRepository.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // Called once at boot (server.js).
  start(intervalMs = 5 * 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.sweep(), 45_000).unref?.();
  }

  // Opportunistic run, at most once a minute per server.
  kick(): void {
    if (Date.now() - this.lastRun > MIN_GAP_MS) void this.sweep();
  }

  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    this.lastRun = Date.now();
    let runner: ReturnType<typeof AppDataSource.createQueryRunner> | null = null;
    let sent = 0;
    try {
      runner = AppDataSource.createQueryRunner();
      await runner.connect();
      const [{ locked }] = await runner.query(`SELECT pg_try_advisory_lock($1) AS "locked"`, [LOCK_KEY]);
      if (!locked) return 0;
      try {
        for (const organizationId of await this.repo.enabledOrganizationIds()) {
          try {
            sent += await this.sweepOrganization(organizationId, now);
          } catch (e) {
            console.error(`[sla] escalation for organisation ${organizationId} failed:`, (e as Error).message);
          }
        }
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
      }
    } catch (e) {
      console.error("[sla] escalation sweep failed:", (e as Error).message);
    } finally {
      await runner?.release().catch(() => {});
      this.running = false;
    }
    return sent;
  }

  private async sweepOrganization(organizationId: string, now: Date): Promise<number> {
    const settings = await this.slaRepo.findSettings(organizationId);
    const rules = settings?.escalation;
    if (!settings || !rules?.enabled || !settings.escalationSince) return 0;

    const issues = await this.repo.overdue(
      organizationId,
      rulesFromSettings(settings),
      new Date(settings.escalationSince),
      rules,
      BATCH
    );

    // Looked up once per sweep, and only if some issue needs them.
    const once = <T>(load: () => Promise<T>) => {
      let value: Promise<T> | null = null;
      return () => (value ??= load());
    };
    const administrators = once(() =>
      this.deskRepo.usersWithPermission(organizationId, [SLA_ADMIN_PERMISSION]).then(toPeople)
    );
    const contacts = once(() =>
      rules.contactIds.length
        ? this.deskRepo.peopleByIds(organizationId, rules.contactIds).then(toPeople)
        : administrators()
    );

    let sent = 0;
    for (const issue of issues) {
      try {
        const holders = await this.repo.holdersOf(issue);
        // Nobody holding it up (or a feature request): the administrators hear it first.
        const first = holders.length ? holders : await administrators();
        const extra = issue.level >= 2 ? await contacts() : [];
        if (await this.escalate(organizationId, issue, dedupe([...first, ...extra]), holders, now)) sent += 1;
      } catch (e) {
        console.error(`[sla] escalation of ${issue.source} ${issue.id} failed:`, (e as Error).message);
      }
    }
    return sent;
  }

  private async escalate(
    organizationId: string,
    issue: OverdueIssue,
    recipients: SlaPerson[],
    holders: SlaPerson[],
    now: Date
  ): Promise<boolean> {
    const level = issue.level;
    const ref = formatReferenceCode(REFERENCE_PREFIX[issue.source], issue.referenceNumber, issue.createdAt);
    const target = issue.metric === "first_response" ? "first response" : "resolution";
    const noun = NOUN[issue.source] ?? "issue";

    const recorded = await this.repo.run((m) =>
      this.repo.record(
        m,
        organizationId,
        issue,
        level,
        recipients.map((p) => p.id),
        this.activity.buildEntry(
          { id: null, organizationId, role: null, name: "Automatic escalation" },
          {
            action: "sla.escalated",
            summary: `Escalated ${noun} ${ref}: ${target} target missed (level ${level})`,
            entityType: issue.source,
            entityId: issue.id,
            severity: level >= 3 ? "warning" : "info",
            metadata: { metric: issue.metric, level, dueAt: issue.dueAt, notified: recipients.map((p) => p.id) },
          }
        )
      )
    );
    if (!recorded) return false;

    const late = describeLate(now, new Date(issue.dueAt));
    const withWho =
      issue.source === "feature_request"
        ? ""
        : holders.length
          ? ` (with ${holders.map((p) => p.name).join(", ")})`
          : " and nobody has picked it up";
    this.notify(recipients, issue, {
      title: `${level >= 3 ? "Critical — " : ""}SLA breached (${target}): ${ref} ${issue.title}`,
      heading: `A ${noun} has run past its SLA`,
      body: `"${issue.title}" (${ref}) on ${issue.projectName} is ${late} past its ${target} target${withWho}.`,
      note: level >= 2 ? `Escalation level ${level} of 3.` : null,
      organizationId,
    });
    return true;
  }

  // In-app notification plus email, per each person's preferences. Fire-and-forget:
  // the escalation is already recorded, so a delivery failure is logged only.
  private notify(
    people: SlaPerson[],
    issue: OverdueIssue,
    event: { title: string; heading: string; body: string; note: string | null; organizationId: string }
  ): void {
    if (!people.length) return;
    this.notifications
      .findPreferences(people.map((p) => p.id))
      .then((prefs: Map<string, unknown>) => {
        const on = (p: SlaPerson, channel: string) => wants(prefs.get(p.id), NotificationCategory.SLA, channel);

        this.notifications
          .createMany(
            people
              .filter((p) => on(p, NotificationChannel.IN_APP))
              .map((p) => ({
                userId: p.id,
                type: NotificationType.SLA_ESCALATED,
                title: event.title.slice(0, 255),
                body: event.body,
                data: dataFor(issue, p),
              }))
          )
          .catch((e: Error) => console.error("[sla] notification failed:", e.message));

        // The generic one-heading, one-sentence, one-button email template.
        for (const p of people.filter((p) => on(p, NotificationChannel.EMAIL))) {
          sendServiceRequestEmail({
            to: p.email,
            firstName: p.firstName,
            subject: event.title,
            heading: event.heading,
            message: event.body,
            note: event.note,
            noteLabel: "Escalation",
            url: urlFor(issue, p),
            ctaLabel: "Open it",
            organizationId: event.organizationId,
          }).catch((e: Error) => console.error("[sla] email failed:", e.message));
        }
      })
      .catch((e: Error) => console.error("[sla] notification preferences failed:", e.message));
  }
}

// Where the notification takes each person — see NotificationBell's linkFor.
function dataFor(issue: OverdueIssue, p: SlaPerson): Record<string, unknown> {
  const data: Record<string, unknown> = { projectId: issue.projectId };
  if (issue.source === "bug") data.bugId = issue.id;
  else if (issue.source === "feature_request") data.requestId = issue.id;
  else {
    data.feedbackId = issue.id;
    if (p.external) data.support = true;
  }
  return data;
}

function urlFor(issue: OverdueIssue, p: SlaPerson): string {
  const base = `${env.appUrl}/projects/${issue.projectId}`;
  if (issue.source === "bug") return `${base}/bugs/${issue.id}`;
  if (issue.source === "feature_request") return `${base}/feature-requests/${issue.id}`;
  return p.external ? `${env.appUrl}/support` : `${base}?tab=feedback`;
}

// The desk repository's rows carry no `external` flag — they are internal people.
function toPeople(rows: { id: string; name: string; email: string; firstName: string }[]): SlaPerson[] {
  return rows.map((r) => ({ ...r, external: false }));
}

function dedupe(people: SlaPerson[]): SlaPerson[] {
  const seen = new Set<string>();
  return people.filter((p) => !seen.has(p.id) && !!seen.add(p.id));
}

function describeLate(now: Date, due: Date): string {
  const h = Math.max(0, Math.round((now.getTime() - due.getTime()) / 3_600_000));
  if (h < 1) return "less than an hour";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}
