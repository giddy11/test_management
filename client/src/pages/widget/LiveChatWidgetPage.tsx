// pages/widget/LiveChatWidgetPage.tsx
// The embeddable live-chat widget's entire UI. Reached via /widget/live-chat/:token,
// always loaded inside an iframe on a third-party site (see public/live-chat-widget.js,
// the loader script that creates that iframe and resizes it on request). Never
// part of the authenticated app shell — no DashboardLayout, no useAuth.
import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Mail, MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { WidgetComposer } from "@/components/live-chat-widget/WidgetComposer"
import { WidgetMessageBody } from "@/components/live-chat-widget/WidgetMessageBody"
import {
  useLiveChatWidgetConfig,
  useLiveChatVisitor,
  useLiveChatConversation,
  useLiveChatMessages,
  useSendLiveChatMessage,
  useMarkLiveChatRead,
  useUpdateLiveChatContact,
} from "@/hooks/useLiveChatWidget"
import { LIVE_CHAT_STATUS_LABELS, LIVE_CHAT_STATUS_VARIANT } from "@/types/liveChat.types"

// Must match PARENT_MESSAGE_SOURCE in public/live-chat-widget.js.
const PARENT_MESSAGE_SOURCE = "testmate-live-chat-widget"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// The loader owns the iframe's actual pixel size (it alone knows the real
// host-page viewport, e.g. to go fullscreen on mobile) — this page only ever
// asks for "open" vs "closed" and fills whatever space it's given.
function postToParent(payload: Record<string, unknown>) {
  if (window.parent === window) return // previewed standalone, not embedded — no-op
  window.parent.postMessage({ source: PARENT_MESSAGE_SOURCE, ...payload }, "*")
}

export default function LiveChatWidgetPage() {
  const { token } = useParams<{ token: string }>()
  const [open, setOpen] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactEmail, setContactEmail] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // This page is always the entire document (its own dedicated iframe) — undo
  // the app's default opaque body background so the transparent corners
  // around the circular launcher button actually show the host page through.
  useEffect(() => {
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
  }, [])

  const { data: config } = useLiveChatWidgetConfig(token)
  const { data: visitor } = useLiveChatVisitor(token)
  const { data: conversation } = useLiveChatConversation(token, visitor?.id)
  const conversationId = conversation?.id
  const { data: messages, isLoading: messagesLoading } = useLiveChatMessages(conversationId)
  const sendMessage = useSendLiveChatMessage(token)
  const markRead = useMarkLiveChatRead(token)
  const updateContact = useUpdateLiveChatContact(token)

  const unread = conversation?.visitorUnread ?? 0

  useEffect(() => {
    postToParent({ type: "resize", open })
  }, [open])

  // Clear the unread badge once the panel is opened on unseen replies.
  useEffect(() => {
    if (open && unread > 0 && visitor?.id) markRead.mutate(visitor.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unread, visitor?.id])

  // Keep the newest message in view.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  const handleSend = async (body: string, files: File[]) => {
    if (!visitor?.id) return
    await sendMessage.mutateAsync({ visitorId: visitor.id, body, files })
  }

  const handleSaveContact = () => {
    if (!visitor?.id || !contactEmail.trim()) return
    updateContact.mutate(
      { visitorId: visitor.id, email: contactEmail.trim() },
      { onSuccess: () => setShowContactForm(false) }
    )
  }

  if (!token) return null

  const displayName = config?.displayName ?? "Chat"
  const greeting = config?.greetingMessage ?? "Hi! How can we help?"

  return (
    <div className="flex h-screen w-screen flex-col items-end justify-end p-2">
      {open ? (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                {config?.logoUrl && <AvatarImage src={config.logoUrl} alt={displayName} />}
                <AvatarFallback>
                  <MessageCircle className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{displayName}</p>
                {conversation ? (
                  <Badge variant={LIVE_CHAT_STATUS_VARIANT[conversation.status]} className="text-[0.65rem]">
                    {LIVE_CHAT_STATUS_LABELS[conversation.status]}
                  </Badge>
                ) : (
                  <p className="text-xs text-muted-foreground">We usually reply within a few hours</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close chat">
              <X />
            </Button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-foreground">
                <p className="text-sm leading-relaxed">{greeting}</p>
              </div>
            </div>

            {messagesLoading && conversationId ? (
              <p className="text-center text-xs text-muted-foreground">Loading…</p>
            ) : (
              messages.map((m) => {
                const mine = m.authorRole === "visitor"
                return (
                  <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                    {!mine && (
                      <span className="mb-0.5 px-1 text-[0.7rem] font-medium text-muted-foreground">
                        {m.authorName || (m.authorRole === "bot" ? "Bot" : displayName)}
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2",
                        mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground"
                      )}
                    >
                      <WidgetMessageBody body={m.body} attachments={m.attachments} />
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
            {!visitor?.email && (
              <div className="mb-2">
                {showContactForm ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={handleSaveContact}
                      disabled={updateContact.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowContactForm(false)}
                      aria-label="Dismiss"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowContactForm(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="size-3.5" />
                    Leave your email so we can follow up
                  </button>
                )}
              </div>
            )}
            <WidgetComposer pending={sendMessage.isPending} onSend={handleSend} />
          </div>
        </div>
      ) : (
        <Button
          size="icon-lg"
          className="relative size-14 rounded-full shadow-lg"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <MessageCircle className="size-6" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[0.7rem] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      )}
    </div>
  )
}
