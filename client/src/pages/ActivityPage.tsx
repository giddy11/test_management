import { useState } from "react"
import {
  FolderKanban,
  Layers,
  ClipboardCheck,
  FlaskConical,
  CircleCheck,
  UserPlus,
  Users,
  FileUp,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageLoader } from "@/components/shared/PageLoader"
import { useActivity } from "@/hooks/useActivity"
import type { ActivityLog } from "@/types/activity.types"

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

const ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  suite: Layers,
  test_case: ClipboardCheck,
  test_run: FlaskConical,
  test_run_result: CircleCheck,
  user: Users,
}

function iconFor(a: ActivityLog): LucideIcon {
  if (a.action.startsWith("test_case.assigned")) return UserPlus
  if (a.action.startsWith("test_case.imported")) return FileUp
  return ICONS[a.entityType ?? ""] ?? ActivityIcon
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

export default function ActivityPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useActivity({ page, limit: 30 })
  const items = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">Every action across your organisation.</p>
      </div>

      {isLoading ? (
        <PageLoader label="Loading activity" />
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ActivityIcon className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((a) => {
                const Icon = iconFor(a)
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.actor?.name || "Someone"} · {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    {a.actor && (
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {initials(a.actor.name) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {(meta?.hasNext || page > 1) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
