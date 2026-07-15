// pages/support/SupportInboxPage.tsx — the super admin's support inbox. Lists
// every in-app support conversation and lets them reply in realtime (Firestore).
import { useEffect, useMemo, useRef, useState } from "react"
import { Headset, CheckCircle2, RotateCcw, Power, PowerOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ChatComposer } from "@/components/support-chat/ChatComposer"
import { ChatMessageBody } from "@/components/support-chat/ChatMessageBody"
import {
  useSupportChatConversations,
  useSupportChatMessages,
  useSendAdminMessage,
  useMarkAdminRead,
  useSetConversationStatus,
  useSupportChatSettings,
  useSetSupportChatEnabled,
} from "@/hooks/useSupportChat"
import type { SupportChatConversation, SupportChatStatus } from "@/types/supportChat.types"

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

function Thread({ conversation }: { conversation: SupportChatConversation }) {
  const { data: messages, isLoading } = useSupportChatMessages(conversation.id)
  const sendMessage = useSendAdminMessage()
  const markRead = useMarkAdminRead()
  const setStatus = useSetConversationStatus()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Clear the unread badge for this thread once it's on screen.
  useEffect(() => {
    if (conversation.adminUnread > 0) markRead.mutate(conversation.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.adminUnread])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const closed = conversation.status === "closed"

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {conversation.user?.name ?? "Unknown user"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{conversation.user?.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setStatus.mutate({ id: conversation.id, status: closed ? "open" : "closed" })
          }
          disabled={setStatus.isPending}
        >
          {closed ? (
            <>
              <RotateCcw className="size-4" /> Reopen
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" /> Mark closed
            </>
          )}
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <p className="text-center text-xs text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.authorRole === "admin"
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {mine && (
                  <span className="mb-0.5 px-1 text-[0.7rem] font-medium text-muted-foreground">
                    {m.author?.name || "You"}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  )}
                >
                  <ChatMessageBody message={m} />
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

export default function SupportInboxPage() {
  const [tab, setTab] = useState<"open" | "closed" | "all">("open")
  const status = tab === "all" ? undefined : (tab as SupportChatStatus)
  const { data: conversations, isLoading } = useSupportChatConversations(status)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: settings } = useSupportChatSettings()
  const setEnabled = useSetSupportChatEnabled()
  const enabled = settings?.enabled ?? true

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "Support chat enabled for users" : "Support chat disabled for users"),
      onError: () => toast.error("Couldn't update the setting"),
    })
  }

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Headset className="size-6 text-primary" /> Support inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            In-app messages from users across the platform. Reply here — they see it live in their
            support widget.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? "Chat on" : "Chat off"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleEnabled}
            disabled={setEnabled.isPending}
          >
            {enabled ? (
              <>
                <PowerOff className="size-4" /> Disable for users
              </>
            ) : (
              <>
                <Power className="size-4" /> Enable for users
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
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
            <p className="p-4 text-center text-sm text-muted-foreground">No conversations.</p>
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
                        {c.user?.name ?? "Unknown user"}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.adminUnread > 0 && (
                          <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5">
                            {c.adminUnread}
                          </Badge>
                        )}
                        <span className="text-[0.65rem] text-muted-foreground">
                          {relative(c.lastMessageAt ?? c.createdAt)}
                        </span>
                      </div>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.lastSenderRole === "admin" && "You: "}
                      {c.lastMessagePreview ?? "No messages yet"}
                    </span>
                    {c.status === "closed" && (
                      <Badge variant="secondary" className="w-fit text-[0.65rem]">
                        Closed
                      </Badge>
                    )}
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
