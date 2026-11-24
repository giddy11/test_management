// modules/subscription/services/subscriptionReminder.service.ts
// Tells people before a paid plan or trial ends, and when it has.
//
// Who hears:
// - the organisation's administrators (anyone who can add team members): an
//   email and an in-app notification at 14 days, 7 days and 1 day before the
//   end, and once it has ended;
// - the platform owner: an email and an in-app notification at 7 days before,
//   and when it has ended, so renewals can be chased.
//
// These go out whatever someone's notification settings say: like sign-in
// emails, they're about the account itself.
//
// Runs on a timer (started in server.js). Each reminder is claimed in
// subscription_reminders before it's sent, so it goes out once, even with
// several servers. Renewing moves the end date, which starts a fresh set.
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { sendServiceRequestEmail } from "../../../shared/utils/mail/serviceDesk.mail";
import { PLAN_NAMES, isPlanKey } from "../domain/planCatalog";

const { NotificationRepository } = require("../../notification/repositories/notification.repository");
const { NotificationType } = require("../../../config/constants");
const { env } = require("../../../config/env");

const LOCK_KEY = 74_210_033;
const DAY = 86_400_000;

// An end date that passed longer ago than this gets no "ended" email: it
// would be news to no one (and stops a flood the first time this runs).
const ENDED_GRACE_MS = 3 * DAY;

export type ReminderKind = "14d" | "7d" | "1d" | "ended";

// The platform owner only hears about the ones worth acting on.
const OWNER_KINDS: ReminderKind[] = ["7d", "ended"];

interface DueRow {
  organizationId: string;
  planKey: string;
  status: "active" | "trial";
  endsAt: Date;
}

interface Person {
  id: string;
  email: string;
  firstName: string;
}

type Query = (sql: string, params?: unknown[]) => Promise<any[]>;

/** Which reminder an end date calls for right now, or null for none. */
export function reminderKindFor(endsAt: Date, now: Date): ReminderKind | null {
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return -left <= ENDED_GRACE_MS ? "ended" : null;
  if (left <= DAY) return "1d";
  if (left <= 7 * DAY) return "7d";
  if (left <= 14 * DAY) return "14d";
  return null;
}

function dateText(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function inText(kind: ReminderKind): string {
  return kind === "14d" ? "14 days" : kind === "7d" ? "7 days" : "1 day";
}

export class SubscriptionReminderService {
  static Instance = new SubscriptionReminderService();

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly query: Query = (sql, params) => AppDataSource.query(sql, params),
    private readonly notifications = NotificationRepository.Instance,
    private readonly sendEmail = sendServiceRequestEmail
  ) {}

  // Called once at boot (server.js). Hourly is plenty for day-level reminders.
  start(intervalMs = 60 * 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.sweep(), 60_000).unref?.();
  }

  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let runner: ReturnType<typeof AppDataSource.createQueryRunner> | null = null;
    let sent = 0;
    try {
      runner = AppDataSource.createQueryRunner();
      await runner.connect();
      const [{ locked }] = await runner.query(`SELECT pg_try_advisory_lock($1) AS "locked"`, [LOCK_KEY]);
      if (!locked) return 0;
      try {
        for (const row of await this.due(now)) {
          try {
            if (await this.remind(row, now)) sent += 1;
          } catch (e) {
            console.error(`[plans] reminder for organisation ${row.organizationId} failed:`, (e as Error).message);
          }
        }
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
      }
    } catch (e) {
      console.error("[plans] reminder sweep failed:", (e as Error).message);
    } finally {
      await runner?.release().catch(() => {});
      this.running = false;
    }
    return sent;
  }

  // Paid plans and trials ending within 14 days, or ended within the grace.
  private async due(now: Date): Promise<DueRow[]> {
    const rows = await this.query(
      `SELECT "organization_id" AS "organizationId", "plan_key" AS "planKey", "status",
              CASE WHEN "status" = 'trial' THEN "trial_ends_at" ELSE "paid_until" END AS "endsAt"
         FROM "organization_subscriptions"
        WHERE "plan_key" <> 'free'
          AND (CASE WHEN "status" = 'trial' THEN "trial_ends_at" ELSE "paid_until" END)
              BETWEEN $1 AND $2`,
      [new Date(now.getTime() - ENDED_GRACE_MS), new Date(now.getTime() + 14 * DAY)]
    );
    return rows.map((r) => ({ ...r, endsAt: new Date(r.endsAt) }));
  }

  private async remind(row: DueRow, now: Date): Promise<boolean> {
    const kind = reminderKindFor(row.endsAt, now);
    if (!kind) return false;

    // Claim it first; if it was already sent (or another server just did), stop.
    const claimed = await this.query(
      `INSERT INTO "subscription_reminders" ("organization_id", "ends_at", "kind")
       VALUES ($1, $2, $3)
       ON CONFLICT ("organization_id", "ends_at", "kind") DO NOTHING
       RETURNING "id"`,
      [row.organizationId, row.endsAt, kind]
    );
    if (!claimed.length) return false;

    const plan = isPlanKey(row.planKey) ? PLAN_NAMES[row.planKey] : row.planKey;
    const what = row.status === "trial" ? `${plan} trial` : `${plan} plan`;
    const when = dateText(row.endsAt);
    const orgName = await this.organizationName(row.organizationId);

    // ── The organisation's administrators ──
    const admins = await this.admins(row.organizationId);
    const ended = kind === "ended";
    const subject = ended ? `Your ${what} has ended` : `Your ${what} ends in ${inText(kind)}`;
    const message = ended
      ? `Your organisation's ${what} ended on ${when}, so ServiceDesk4u is locked for your team until you renew. Nothing has been deleted: everything is there when you come back.`
      : row.status === "trial"
        ? `Your organisation's ${what} ends on ${when}. Choose a plan before then, or ServiceDesk4u will be locked for your team until you do. Nothing is deleted either way.`
        : `Your organisation's ${what} is paid until ${when}. Renew before then, or ServiceDesk4u will be locked for your team until you do. Nothing is deleted either way.`;
    this.deliver(admins, {
      organizationId: row.organizationId,
      subject,
      heading: subject,
      message,
      note: "To renew or change plan, contact us. Our details are on your Plan page.",
      url: `${env.appUrl}/settings?tab=plan`,
      ctaLabel: "See your plan",
      link: "/settings?tab=plan",
    });

    // ── The platform owner ──
    if (OWNER_KINDS.includes(kind)) {
      const owners = await this.platformOwners();
      const ownerSubject = ended ? `${orgName}: ${what} has ended` : `${orgName}: ${what} ends in ${inText(kind)}`;
      this.deliver(owners, {
        organizationId: null,
        subject: ownerSubject,
        heading: ownerSubject,
        message: ended
          ? `${orgName}'s ${what} ended on ${when}. The organisation is locked until you record a payment or set its plan.`
          : `${orgName}'s ${what} ends on ${when}. Record their payment from Organisations when they renew.`,
        note: null,
        url: `${env.appUrl}/platform`,
        ctaLabel: "Open Organisations",
        link: "/platform",
      });
    }
    return true;
  }

  // In-app plus email. Fire-and-forget: the reminder is already recorded, so a
  // delivery failure is logged, not retried.
  private deliver(
    people: Person[],
    m: {
      organizationId: string | null;
      subject: string;
      heading: string;
      message: string;
      note: string | null;
      url: string;
      ctaLabel: string;
      link: string;
    }
  ): void {
    if (!people.length) return;
    this.notifications
      .createMany(
        people.map((p) => ({
          userId: p.id,
          type: NotificationType.PLAN_REMINDER,
          title: m.subject.slice(0, 255),
          body: m.message,
          data: { link: m.link },
        }))
      )
      .catch((e: Error) => console.error("[plans] reminder notification failed:", e.message));
    for (const p of people) {
      this.sendEmail({
        to: p.email,
        firstName: p.firstName,
        subject: m.subject,
        heading: m.heading,
        message: m.message,
        note: m.note,
        noteLabel: "What to do",
        url: m.url,
        ctaLabel: m.ctaLabel,
        organizationId: m.organizationId,
      }).catch((e: Error) => console.error("[plans] reminder email failed:", e.message));
    }
  }

  // Whoever runs the workspace: people who can add team members.
  private admins(organizationId: string): Promise<Person[]> {
    return this.query(
      `SELECT DISTINCT u."id", u."email", u."first_name" AS "firstName"
         FROM "users" u
         JOIN "user_roles" ur ON ur."user_id" = u."id"
         JOIN "role_permissions" rp ON rp."role_id" = ur."role_id"
        WHERE u."organization_id" = $1 AND u."deleted_at" IS NULL AND u."client_company_id" IS NULL
          AND rp."permission_code" = 'user.create'`,
      [organizationId]
    );
  }

  // Holders of the locked super administrator role.
  private platformOwners(): Promise<Person[]> {
    return this.query(
      `SELECT DISTINCT u."id", u."email", u."first_name" AS "firstName"
         FROM "users" u
         JOIN "user_roles" ur ON ur."user_id" = u."id"
         JOIN "roles" r ON r."id" = ur."role_id"
        WHERE r."is_locked" = true AND u."deleted_at" IS NULL`
    );
  }

  // There's no organisations table: the name is the earliest member's company name.
  private async organizationName(organizationId: string): Promise<string> {
    const [row] = await this.query(
      `SELECT "company_name" FROM "users"
        WHERE "organization_id" = $1 AND "company_name" IS NOT NULL AND "company_name" <> ''
        ORDER BY "created_at" ASC LIMIT 1`,
      [organizationId]
    );
    return row?.company_name || "An organisation";
  }
}
