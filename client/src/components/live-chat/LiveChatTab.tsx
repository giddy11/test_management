// components/live-chat/LiveChatTab.tsx
// The project's live-chat operator inbox: widget settings (admins only) on
// top, then a two-pane conversation list + realtime thread below — same
// layout as SupportInboxPage, scoped to this project instead of the whole
// platform, and reading from live_chat_conversations/liveChatMessages
// instead of the in-app support-chat's own tables/collection.
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, RotateCcw, UserPlus, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ChatComposer } from "@/components/support-chat/ChatComposer"
import { LiveChatMessageBody } from "@/components/live-chat/LiveChatMessageBody"
import { LiveChatSettingsCard } from "@/components/live-chat/LiveChatSettingsCard"
import { useLiveChatMessages } from "@/hooks/useLiveChatWidget"
import {
  useLiveChatConversations,
  useSendLiveChatAgentMessage,
  useMarkLiveChatAgentRead,
  useSetLiveChatConversationStatus,
  useAssignLiveChatAgent,
} from "@/hooks/useLiveChatInbox"
import { useAuth } from "@/contexts/AuthContext"
import { useCanManageProject } from "@/hooks/useProjects"
import {
  LIVE_CHAT_STATUS_LABELS,
  LIVE_CHAT_STATUS_VARIANT,
  type LiveChatConversation,
  type LiveChatStatus,
} from "@/types/liveChat.types"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function relative(iso: string | null) {
  if (!iso) return ""
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Thread({ conversation }: { conversation: LiveChatConversation }) {
  const { user } = useAuth()
  const { data: messages, isLoading } = useLiveChatMessages(conversation.id)
  const sendMessage = useSendLiveChatAgentMessage()
  const markRead = useMarkLiveChatAgentRead()
  const setStatus = useSetLiveChatConversationStatus()
  const assignAgent = useAssignLiveChatAgent()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Clear the unread badge for this thread once it's on screen.
  useEffect(() => {
    if (conversation.agentUnread > 0) markRead.mutate(conversation.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.agentUnread])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const status = conversation.status
  const closed = status === "closed"
  const resolved = status === "resolved"
  const isMine = conversation.assignedAgent?.id === user?.id
  const visitorName = conversation.visitor?.name ?? "Anonymous visitor"

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{visitorName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.visitor?.email ?? conversation.visitor?.currentUrl ?? "No contact info"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant={LIVE_CHAT_STATUS_VARIANT[status]}>{LIVE_CHAT_STATUS_LABELS[status]}</Badge>
          {conversation.assignedAgent ? (
            isMine ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => assignAgent.mutate({ id: conversation.id, agentId: null })}
                disabled={assignAgent.isPending}
              >
                Unassign
              </Button>
            ) : (
              <Badge variant="secondary">Assigned to {conversation.assignedAgent.name}</Badge>
            )
          ) : (
            user && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => assignAgent.mutate({ id: conversation.id, agentId: user.id })}
                disabled={assignAgent.isPending}
              >
                <UserPlus className="size-4" /> Assign to me
              </Button>
            )
          )}
          {!resolved && !closed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus.mutate({ id: conversation.id, status: "resolved" })}
              disabled={setStatus.isPending}
            >
              <CheckCircle2 className="size-4" /> Mark resolved
            </Button>
          )}
          {closed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus.mutate({ id: conversation.id, status: "in_progress" })}
              disabled={setStatus.isPending}
            >
              <RotateCcw className="size-4" /> Reopen
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus.mutate({ id: conversation.id, status: "closed" })}
              disabled={setStatus.isPending}
            >
              <XCircle className="size-4" /> Close
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <p className="text-center text-xs text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.authorRole === "agent"
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <span className="mb-0.5 px-1 text-[0.7rem] font-medium text-muted-foreground">
                  {mine ? m.authorName || "You" : m.authorRole === "bot" ? "Bot" : visitorName}
                </span>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  )}
                >
                  <LiveChatMessageBody body={m.body} attachments={m.attachments} />
                </div>
                <span className="mt-0.5 px-1 text-[0.65rem] text-muted-foreground">
                  {formatTime(m.createdAt)}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t p-3">
        <ChatComposer
          pending={sendMessage.isPending}
          placeholder="Write a reply…  (Shift+Enter for a new line)"
          onSend={(body, files) => sendMessage.mutateAsync({ id: conversation.id, body, files })}
        />
      </div>
    </div>
  )
}

interface Props {
  projectId: string
}

export function LiveChatTab({ projectId }: Props) {
  // Widget settings and its link are the project's team lead's call.
  const isAdmin = useCanManageProject(projectId)

  const [tab, setTab] = useState<LiveChatStatus | "all">("new")
  const statusFilter = tab === "all" ? undefined : tab
  const { data: conversations, isLoading } = useLiveChatConversations(projectId, statusFilter)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = useMemo(() => conversations ?? [], [conversations])

  // Keep a valid selection as the filtered list changes.
  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null)
    } else if (!selectedId || !list.some((c) => c.id === selectedId)) {
      setSelectedId(list[0].id)
    }
  }, [list, selectedId])

  const selected = list.find((c) => c.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      {isAdmin && <LiveChatSettingsCard projectId={projectId} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid h-[32rem] grid-cols-1 gap-4 md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <div className="overflow-y-auto rounded-lg border">
          {isLoading ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="divide-y">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                      c.id === selectedId && "bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.visitor?.name ?? "Anonymous visitor"}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.agentUnread > 0 && (
                          <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5">
                            {c.agentUnread}
                          </Badge>
                        )}
                        <span className="text-[0.65rem] text-muted-foreground">
                          {relative(c.lastMessageAt ?? c.createdAt)}
                        </span>
                      </div>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.lastSenderRole === "agent" && "You: "}
                      {c.lastMessagePreview ?? "No messages yet"}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={LIVE_CHAT_STATUS_VARIANT[c.status]} className="w-fit text-[0.65rem]">
                        {LIVE_CHAT_STATUS_LABELS[c.status]}
                      </Badge>
                      {c.assignedAgent && (
                        <Badge variant="outline" className="w-fit text-[0.65rem]">
                          {c.assignedAgent.name}
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className="overflow-hidden rounded-lg border">
          {selected ? (
            <Thread key={selected.id} conversation={selected} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
