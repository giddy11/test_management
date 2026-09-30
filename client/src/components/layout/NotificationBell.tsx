import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, Bug, CheckCheck, ClipboardCheck, FlaskConical, Headset, Lightbulb, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { InlineLoader } from "@/components/shared/PageLoader"
import {
  useUnreadCount,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/useNotifications"
import type { AppNotification } from "@/types/notification.types"

type Filter = "all" | "unread" | "read"

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
]

const EMPTY_MESSAGE: Record<Filter, string> = {
  all: "You're all caught up.",
  unread: "No unread notifications.",
  read: "No read notifications yet.",
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function linkFor(n: AppNotification): string {
  const d = n.data ?? {}
  // A user message to the admins opens the inbox; a reply to a user has no page
  // (they read it in the floater) so it falls through to the dashboard.
  if (n.type === "support_chat_message") return "/support-inbox"
  if (d.support) return "/support"
  if (d.caseId && d.projectId && d.suiteId)
    return `/projects/${d.projectId}/suites/${d.suiteId}/cases/${d.caseId}`
  if (d.runId && d.projectId) return `/projects/${d.projectId}/runs/${d.runId}`
  if (d.requestId && d.projectId) return `/projects/${d.projectId}/feature-requests/${d.requestId}`
  if (d.bugId && d.projectId) return `/projects/${d.projectId}/bugs/${d.bugId}`
  if (d.feedbackId && d.projectId) return `/projects/${d.projectId}?tab=feedback`
  if (d.projectId) return `/projects/${d.projectId}`
  return "/dashboard"
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const navigate = useNavigate()
  const { data: count = 0 } = useUnreadCount()
  const { data: items = [], isLoading } = useNotifications(open)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  const visible = items.filter((n) =>
    filter === "unread" ? !n.read : filter === "read" ? n.read : true
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Start on "All" every time the dropdown is reopened.
    if (!next) setFilter("all")
  }

  const onItem = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id)
    setOpen(false)
    setFilter("all")
    navigate(linkFor(n))
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" data-cy="notification-bell">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
              <CheckCheck className="mr-1 size-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <div role="tablist" aria-label="Filter notifications" className="flex gap-1 border-b px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={filter === t.value}
              data-cy={`notification-tab-${t.value}`}
              onClick={() => setFilter(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === t.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t.label}
              {t.value === "unread" && count > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] leading-4">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && <InlineLoader className="py-6" />}
          {!isLoading && visible.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground" data-cy="notification-empty">
              {EMPTY_MESSAGE[filter]}
            </p>
          )}
          {visible.map((n) => {
            const Icon = n.type === "run_completed"
              ? FlaskConical
              : n.type.startsWith("bug_")
              ? Bug
              : n.type.startsWith("feature_request_")
              ? Lightbulb
              : n.type === "project_member_added"
              ? UserPlus
              : n.type.startsWith("support_chat_")
              ? Headset
              : ClipboardCheck
            return (
              <button
                key={n.id}
                data-cy="notification-item"
                onClick={() => onItem(n)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
