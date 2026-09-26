// lib/enums.ts — domain enums mirrored from the backend, with display metadata.

export const TC_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const
export type TcPriority = (typeof TC_PRIORITIES)[number]

export const TC_STATUSES = ["Draft", "Active", "Deprecated"] as const
export type TcStatus = (typeof TC_STATUSES)[number]

export const RUN_STATUSES = ["in_progress", "completed"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const RESULT_STATUSES = ["pass", "fail", "blocked", "skipped"] as const
export type ResultStatus = (typeof RESULT_STATUSES)[number]

// Tailwind badge classes per status — used across cards, tables and charts legends.
export const PRIORITY_BADGE: Record<TcPriority, string> = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export const STATUS_BADGE: Record<TcStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Deprecated: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 line-through",
}

export const RESULT_META: Record<
  ResultStatus | "pending",
  { label: string; color: string; badge: string }
> = {
  pass: { label: "Pass", color: "#22c55e", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  fail: { label: "Fail", color: "#ef4444", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  blocked: { label: "Blocked", color: "#f59e0b", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  skipped: { label: "Skipped", color: "#94a3b8", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  pending: { label: "Not Run", color: "#64748b", badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
}

export const FEATURE_REQUEST_STATUSES = [
  "new",
  "under_review",
  "planned",
  "in_progress",
  "done",
  "rejected",
] as const
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number]

export const FEATURE_REQUEST_STATUS_META: Record<FeatureRequestStatus, { label: string; badge: string }> = {
  new: { label: "New", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  under_review: { label: "Under Review", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  planned: { label: "Planned", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  in_progress: { label: "In Progress", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  done: { label: "Done", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Rejected", badge: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 line-through" },
}

// Feature requests only move forward through these stages. "rejected" is an exit
// from any open stage rather than a step in the sequence, and done/rejected are
// final. Mirrors assertValidStatusTransition in the API's featureRequest.service.js.
const FEATURE_REQUEST_STAGES: readonly FeatureRequestStatus[] = ["new", "under_review", "planned", "in_progress", "done"]

export const isFeatureRequestFinal = (s: FeatureRequestStatus) => s === "done" || s === "rejected"

// Whether `candidate` may be chosen for a request currently at `current`.
export function isFeatureRequestStatusSelectable(current: FeatureRequestStatus, candidate: FeatureRequestStatus): boolean {
  if (candidate === current) return true
  if (isFeatureRequestFinal(current)) return false
  if (candidate === "rejected") return true
  return FEATURE_REQUEST_STAGES.indexOf(candidate) > FEATURE_REQUEST_STAGES.indexOf(current)
}

export const BUG_SEVERITIES = ["Trivial", "Minor", "Major", "Critical"] as const
export type BugSeverity = (typeof BUG_SEVERITIES)[number]

export const BUG_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const
export type BugPriority = (typeof BUG_PRIORITIES)[number]

export const BUG_STATUSES = ["Open", "In Progress", "Fixed", "Verified", "Closed", "Reopened"] as const
export type BugStatus = (typeof BUG_STATUSES)[number]

export const BUG_SEVERITY_BADGE: Record<BugSeverity, string> = {
  Trivial: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Minor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Major: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export const BUG_PRIORITY_BADGE: Record<BugPriority, string> = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export const BUG_STATUS_META: Record<BugStatus, { label: string; badge: string }> = {
  Open: { label: "Open", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  "In Progress": { label: "In Progress", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  Fixed: { label: "Fixed", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  Verified: { label: "Verified", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  Closed: { label: "Closed", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  Reopened: { label: "Reopened", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
}

// Bugs only move forward through these stages. "Reopened" is the one way back —
// a fixed bug resurfaces — and re-enters the sequence just before In Progress.
// Mirrors assertValidStatusTransition in the API's bug.service.js.
const BUG_STAGES: readonly BugStatus[] = ["Open", "In Progress", "Fixed", "Verified", "Closed"]
const bugRank = (s: BugStatus) => (s === "Reopened" ? 0.5 : BUG_STAGES.indexOf(s))

// Whether `candidate` may be chosen for a bug currently at `current`.
export function isBugStatusSelectable(current: BugStatus, candidate: BugStatus): boolean {
  if (candidate === current) return true
  if (candidate === "Reopened") return current === "Fixed" || current === "Verified" || current === "Closed"
  return bugRank(candidate) > bugRank(current)
}
