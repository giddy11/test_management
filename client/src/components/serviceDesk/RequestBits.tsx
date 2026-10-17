// components/serviceDesk/RequestBits.tsx — small pieces every IT-requests
// page shares: status and priority badges, category icons, the "module is
// off" notice, and a relative date.
import {
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
import { PRIORITY_META, STATUS_META, type RequestPriority, type RequestStatus } from "@/types/serviceDesk.types"

export function RequestStatusBadge({ value }: { value: RequestStatus }) {
  const meta = STATUS_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

export function RequestPriorityBadge({ value }: { value: RequestPriority }) {
  const meta = PRIORITY_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
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
