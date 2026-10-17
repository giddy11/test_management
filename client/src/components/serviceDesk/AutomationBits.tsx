// components/serviceDesk/AutomationBits.tsx — how an automation run reads,
// shared by the run log and a request's Automation card.
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RunStatus } from "@/types/serviceDesk.types"

const STATUS: Record<RunStatus, { label: string; badge: string }> = {
  succeeded: { label: "Succeeded", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  failed: { label: "Failed", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  skipped: { label: "Stepped aside", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  pending: { label: "Waiting for result", badge: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  retrying: { label: "Retrying", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = STATUS[status]
  return <Badge className={cn("border-transparent", s.badge)}>{s.label}</Badge>
}
