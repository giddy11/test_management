// components/serviceDesk/RequestBits.tsx — small pieces every IT-requests
// page shares: status and priority badges, category icons, the "module is
// off" notice, and a relative date.
import {
  AlarmClock,
  CalendarClock,
  AppWindow,
  Briefcase,
  Cloud,
  IdCard,
  KeyRound,
  Laptop,
  Lightbulb,
  Package,
  PowerOff,
  UserPlus,
  type LucideIcon,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/timeAgo"
import { NEEDED_BY_WARNING_TEXT, formatNeededBy } from "@/lib/serviceDesk"
import {
  PRIORITY_META,
  RISK_META,
  STATUS_META,
  type NeededByWarning,
  type RequestPriority,
  type RequestStatus,
  type RiskLevel,
} from "@/types/serviceDesk.types"

export function RequestStatusBadge({ value }: { value: RequestStatus }) {
  const meta = STATUS_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

export function RequestPriorityBadge({ value }: { value: RequestPriority }) {
  const meta = PRIORITY_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

export function RiskBadge({ value }: { value: RiskLevel }) {
  const meta = RISK_META[value] ?? RISK_META.low
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

// Past its approval or fulfilment service level right now.
export function OverdueBadge({ phase, level }: { phase: "approval" | "fulfilment" | null; level?: number }) {
  if (!phase) return null
  return (
    <Badge className="gap-1 border-transparent bg-red-600 text-white" title={level ? `Escalation level ${level} of 3` : undefined}>
      <AlarmClock className="size-3" />
      {phase === "approval" ? "Approval overdue" : "Overdue"}
    </Badge>
  )
}

// The date the requester needs it by; amber when it's at risk, red once gone.
export function NeededByBadge({ value }: { value: { date: string; warning: NeededByWarning | null } | null }) {
  if (!value) return null
  const tone =
    value.warning === "passed"
      ? "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      : value.warning
        ? "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : ""
  return (
    <Badge
      variant={value.warning ? "default" : "outline"}
      className={cn("gap-1 font-normal", tone)}
      title={value.warning ? NEEDED_BY_WARNING_TEXT[value.warning] : "The date the requester needs this by"}
      data-cy="needed-by"
    >
      <CalendarClock className="size-3" />
      Needed by {formatNeededBy(value.date)}
    </Badge>
  )
}

// "due in 5h", "due tomorrow", "12h overdue".
export function DueText({ at, className }: { at: string | null | undefined; className?: string }) {
  if (!at) return null
  const ms = new Date(at).getTime() - Date.now()
  const h = Math.round(Math.abs(ms) / 3_600_000)
  const span = h < 1 ? "under an hour" : h < 48 ? `${h}h` : `${Math.round(h / 24)} days`
  return (
    <span className={cn(ms < 0 && "font-medium text-red-600 dark:text-red-400", className)} title={new Date(at).toLocaleString()}>
      {ms < 0 ? `${span} overdue` : `due in ${span}`}
    </span>
  )
}

// The icon names the server's default catalog uses; anything else gets a box.
const ICONS: Record<string, LucideIcon> = {
  "app-window": AppWindow,
  laptop: Laptop,
  "user-plus": UserPlus,
  "key-round": KeyRound,
  briefcase: Briefcase,
  cloud: Cloud,
  "id-card": IdCard,
  lightbulb: Lightbulb,
}

export function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && ICONS[name]) || Package
  return <Icon className={className} />
}

export function When({ at }: { at: string | null | undefined }) {
  if (!at) return null
  return (
    <time dateTime={at} title={new Date(at).toLocaleString()}>
      {timeAgo(at)}
    </time>
  )
}

export function ModuleOffNotice({ canManage }: { canManage: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <PowerOff className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">IT requests isn't turned on yet</p>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Set up the catalog, then turn it on for everyone."
              : "Your administrator hasn't turned IT requests on for your organisation."}
          </p>
        </div>
        {canManage && (
          <Button asChild size="sm">
            <Link to="/requests/catalog">Open catalog setup</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
