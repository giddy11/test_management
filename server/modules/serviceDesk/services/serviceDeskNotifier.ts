// modules/serviceDesk/services/serviceDeskNotifier.ts
// In-app notification plus email for an IT-request event. Fire-and-forget:
// the request has already been committed by the time this runs, so a mail or
// notification failure is logged and never reaches the caller.
import type { PersonRow } from "../repositories/serviceDesk.repository";
import { sendServiceRequestEmail } from "../../../shared/utils/mail/serviceDesk.mail";

const { NotificationRepository } = require("../../notification/repositories/notification.repository");
const { NotificationType } = require("../../../config/constants");
const { env } = require("../../../config/env");
const {
  NotificationCategory,
  NotificationChannel,
  wants,
} = require("../../notification/domain/notificationPreferences");

export type DeskNotificationKind = "approval" | "queued" | "update" | "escalated";

const TYPE_OF: Record<DeskNotificationKind, string> = {
  approval: NotificationType.SERVICE_REQUEST_APPROVAL,
  queued: NotificationType.SERVICE_REQUEST_QUEUED,
  update: NotificationType.SERVICE_REQUEST_UPDATE,
  escalated: NotificationType.SERVICE_REQUEST_ESCALATED,
};

// Settings → Notifications groups decisions apart from progress updates, so an
// approver can mute the chatter without missing what's waiting on them; and
// "a new request reached the queue" apart from both, so IT can mute the
// stream of new work and still hear about their own requests.
const CATEGORY_OF: Record<DeskNotificationKind, string> = {
  approval: NotificationCategory.SERVICE_DESK_APPROVALS,
  escalated: NotificationCategory.SERVICE_DESK_APPROVALS,
  queued: NotificationCategory.SERVICE_DESK_QUEUE,
  update: NotificationCategory.SERVICE_DESK_UPDATES,
};

export interface DeskEvent {
  kind: DeskNotificationKind;
  requestId: string;
  organizationId: string;
  title: string; // in-app title, also the email subject
  body: string; // one sentence, in-app body and the email's message
  heading: string;
  note?: string | null;
  noteLabel?: string;
  ctaLabel: string;
}

export class ServiceDeskNotifier {
  static Instance = new ServiceDeskNotifier();

  constructor(private readonly notifications = NotificationRepository.Instance) {}

  urlFor(requestId: string): string {
    return `${env.appUrl}/requests/${requestId}`;
  }

  // Each person once, never the one who caused the event.
  send(recipients: (PersonRow | null | undefined)[], event: DeskEvent, exceptUserId?: string | null): void {
    const seen = new Set<string>();
    const people = recipients.filter((p): p is PersonRow => {
      if (!p || p.id === exceptUserId || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    if (!people.length) return;

    this.notifications
      .findPreferences(people.map((p) => p.id))
      .then((prefs: Map<string, unknown>) => this.deliver(people, event, prefs))
      .catch((e: Error) => console.error("[serviceDesk] notification preferences failed:", e.message));
  }

  private deliver(people: PersonRow[], event: DeskEvent, prefs: Map<string, unknown>): void {
    const category = CATEGORY_OF[event.kind];
    const on = (p: PersonRow, channel: string) => wants(prefs.get(p.id), category, channel);

    this.notifications
      .createMany(
        people.filter((p) => on(p, NotificationChannel.IN_APP)).map((p) => ({
          userId: p.id,
          type: TYPE_OF[event.kind],
          title: event.title.slice(0, 255),
          body: event.body,
          data: { serviceRequestId: event.requestId },
        }))
      )
      .catch((e: Error) => console.error("[serviceDesk] notification failed:", e.message));

    const url = this.urlFor(event.requestId);
    for (const p of people.filter((p) => on(p, NotificationChannel.EMAIL))) {
      sendServiceRequestEmail({
        to: p.email,
        firstName: p.firstName,
        subject: event.title,
        heading: event.heading,
        message: event.body,
        note: event.note,
        noteLabel: event.noteLabel,
        url,
        ctaLabel: event.ctaLabel,
        organizationId: event.organizationId,
      }).catch((e: Error) => console.error("[serviceDesk] email failed:", e.message));
    }
  }
}
