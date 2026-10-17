// modules/serviceDesk/domain/neededBy.ts
// The date the requester needs it by. It's an ordinary date question — the
// one whose answer key is "needed_by", which is what a question labelled
// "Needed by" gets — so admins add, rename or remove it in the form builder.
// It never sets the service level; it only tells IT when the request is in
// danger of missing the requester's date. Pure, so it's tested directly.
import type { FormField, FormValues } from "./formSchema";
import type { RequestStatus } from "./lifecycle";

export const NEEDED_BY_KEY = "needed_by";
// "Soon" = the date ends within this many hours.
export const NEEDED_BY_SOON_HOURS = 48;

// Still waiting on someone — drafts and finished requests get no warning.
const OPEN: readonly RequestStatus[] = ["submitted", "pending_approval", "approved", "in_progress", "info_requested"];

//   passed       the date has gone and it isn't done
//   after_target the service-level target is later than the date, so meeting
//                the target still misses it
//   soon         the date ends within NEEDED_BY_SOON_HOURS
export type NeededByWarning = "passed" | "after_target" | "soon";

export interface NeededBy {
  date: string; // YYYY-MM-DD, as answered
  warning: NeededByWarning | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A whole day: the date counts until the end of it (UTC, like the stored value).
function endOfDay(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) + 24 * 3_600_000;
}

export function neededByOf(
  r: {
    status: RequestStatus;
    formSchema: FormField[] | null | undefined;
    formValues: FormValues | null | undefined;
    approvalDueAt: Date | string | null;
    fulfilmentDueAt: Date | string | null;
  },
  now = Date.now()
): NeededBy | null {
  const field = (r.formSchema ?? []).find((f) => f.key === NEEDED_BY_KEY && f.type === "date");
  const value = field ? r.formValues?.[NEEDED_BY_KEY] : undefined;
  if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) return null;

  if (!OPEN.includes(r.status)) return { date: value, warning: null };
  const deadline = endOfDay(value);
  if (deadline <= now) return { date: value, warning: "passed" };
  // Before approval only the approval target is known; after it, fulfilment's.
  const target = r.fulfilmentDueAt ?? r.approvalDueAt;
  if (target && new Date(target).getTime() > deadline) return { date: value, warning: "after_target" };
  if (deadline - now <= NEEDED_BY_SOON_HOURS * 3_600_000) return { date: value, warning: "soon" };
  return { date: value, warning: null };
}
