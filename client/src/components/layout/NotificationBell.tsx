import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, Bug, CheckCheck, ClipboardCheck, FlaskConical, Headset, Lightbulb, Maximize2, Minimize2, Store, UserPlus } from "lucide-react"
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

// Whether the panel is shown large, kept per browser.
const EXPANDED_KEY = "tm_notifications_expanded"

function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1"
  } catch {
    return false
  }
}

function saveExpanded(expanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0")
  } catch {
    // Private mode or blocked storage: the panel still expands, just not across visits.
  }
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
  // Notifications that know exactly where they belong (plan reminders) say so.
  if (typeof d.link === "string" && d.link.startsWith("/")) return d.link
  // A user message to the admins opens the inbox; a reply to a user has no page
  // (they read it in the floater) so it falls through to the dashboard.
  if (n.type === "support_chat_message") return "/support-inbox"
  if (d.serviceRequestId) return `/requests/${d.serviceRequestId}`
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
  const [expanded, setExpanded] = useState(loadExpanded)
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

  const toggleExpanded = () => {
    saveExpanded(!expanded)
    setExpanded(!expanded)
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
      <DropdownMenuContent
        align="end"
        className={cn("p-0", expanded ? "w-[min(40rem,calc(100vw-1rem))]" : "w-80")}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <div className="flex items-center gap-1">
            {count > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
                <CheckCheck className="mr-1 size-3.5" /> Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={toggleExpanded}
              aria-label={expanded ? "Collapse notifications" : "Expand notifications"}
              title={expanded ? "Collapse" : "Expand"}
              data-cy="notification-expand"
            >
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          </div>
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

        <div className={cn("overflow-y-auto", expanded ? "max-h-[70vh]" : "max-h-96")}>
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
              : n.type.startsWith("service_request_")
              ? Store
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
                  <p className={cn("text-sm font-medium", expanded ? "break-words" : "truncate")}>{n.title}</p>
                  {n.body && (
                    <p
                      className={cn(
                        "text-muted-foreground",
                        expanded ? "mt-0.5 whitespace-pre-line break-words text-sm" : "truncate text-xs"
                      )}
                    >
                      {n.body}
                    </p>
                  )}
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
