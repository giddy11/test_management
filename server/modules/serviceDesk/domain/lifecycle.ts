// modules/serviceDesk/domain/lifecycle.ts
// The life of an IT request. Pure — no I/O — so the rules are tested on their
// own and every service path goes through the same table.
//
//   draft ──submit──▶ submitted ─────────────────────────────▶ in_progress ──▶ fulfilled
//     │                (no approval needed: straight to IT)         ▲
//     └──submit──▶ pending_approval ──approve──▶ approved ──────────┘
//                         └──reject──▶ rejected
//   cancelled is reachable from every open state except in_progress for the
//   requester, and from the IT-side states for an agent (with a reason).
//
// The invariant the stories insist on (BR 1.2 / 2.4): nothing reaches
// in_progress unless it needed no approval (submitted) or was approved. The
// table below is what enforces it — there is no edge from pending_approval or
// rejected to in_progress.
const { AppError } = require("../../../shared/errors/AppError");

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "in_progress",
  "fulfilled",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const APPROVAL_MODES = ["none", "approvers"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPROVAL_DECISIONS = ["pending", "approved", "rejected", "skipped"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ["submitted", "pending_approval", "cancelled"],
  submitted: ["in_progress", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["in_progress", "cancelled"],
  in_progress: ["fulfilled", "cancelled"],
  rejected: [],
  fulfilled: [],
  cancelled: [],
};

// Waiting in the IT queue for someone to pick it up.
export const READY_FOR_FULFILMENT: readonly RequestStatus[] = ["submitted", "approved"];
// What IT sees in its queue at all — a draft is still the requester's own.
export const QUEUE_STATUSES: readonly RequestStatus[] = [
  "submitted",
  "pending_approval",
  "approved",
  "in_progress",
  "fulfilled",
  "rejected",
  "cancelled",
];
// A requester may withdraw until IT has started on it.
export const REQUESTER_CANCELLABLE: readonly RequestStatus[] = ["draft", "submitted", "pending_approval", "approved"];
// IT may decline anything that has reached it, including work in progress.
export const AGENT_CANCELLABLE: readonly RequestStatus[] = ["submitted", "approved", "in_progress"];
export const TERMINAL_STATUSES: readonly RequestStatus[] = ["rejected", "fulfilled", "cancelled"];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(`This request is ${labelOf(from)} and can't be moved to ${labelOf(to)}`, 409);
  }
}

// Where a submitted request goes first.
export function statusOnSubmit(needsApproval: boolean): RequestStatus {
  return needsApproval ? "pending_approval" : "submitted";
}

// "Any one approver decides": the first approval approves the request, the
// first rejection rejects it, and either way the remaining rows are skipped.
export function outcomeOfDecision(decision: "approved" | "rejected"): RequestStatus {
  return decision === "approved" ? "approved" : "rejected";
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export function labelOf(status: RequestStatus): string {
  return STATUS_LABELS[status]?.toLowerCase() ?? status;
}

// Shown everywhere instead of the uuid. Global sequence, never reused.
export function formatReference(requestNumber: number): string {
  return `SR-${String(requestNumber).padStart(6, "0")}`;
}

// "SR-000123", "sr-123" or "123" → 123; anything else → null.
export function parseReference(value: string): number | null {
  const m = /^(?:sr-?)?0*(\d{1,9})$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}
