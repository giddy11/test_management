// pages/widget/LiveChatWidgetPage.tsx
// The embeddable live-chat widget's entire UI. Reached via /widget/live-chat/:token,
// always loaded inside an iframe on a third-party site (see public/live-chat-widget.js,
// the loader script that creates that iframe and resizes it on request). Never
// part of the authenticated app shell — no DashboardLayout, no useAuth.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { useParams } from "react-router-dom"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { WidgetComposer } from "@/components/live-chat-widget/WidgetComposer"
import { WidgetMessageBody } from "@/components/live-chat-widget/WidgetMessageBody"
import { PreChatForm } from "@/components/live-chat-widget/PreChatForm"
import { LiveChatAuthForm } from "@/components/live-chat-widget/LiveChatAuthForm"
import {
  useLiveChatWidgetConfig,
  useLiveChatVisitor,
  useLiveChatConversation,
  useLiveChatMessages,
  useSendLiveChatMessage,
  useMarkLiveChatRead,
  useUpdateLiveChatContact,
  useRegisterLiveChatAccount,
  useLoginLiveChatAccount,
} from "@/hooks/useLiveChatWidget"
import { LIVE_CHAT_STATUS_LABELS, LIVE_CHAT_STATUS_VARIANT } from "@/types/liveChat.types"
import { ApiError } from "@/transport/http"

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
  const scrollRef = useRef<HTMLDivElement>(null)

  // This page is always the entire document (its own dedicated iframe) — undo
  // the app's default opaque body background so the transparent corners
  // around the pill launcher actually show the host page through.
  useEffect(() => {
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
  }, [])

  const { data: config, isError: configError, error: configErrorObj } = useLiveChatWidgetConfig(token)
  const { data: visitor } = useLiveChatVisitor(token, config?.requireAccount)
  const { data: conversation } = useLiveChatConversation(token, visitor?.id)
  const conversationId = conversation?.id
  const { data: messages, isLoading: messagesLoading } = useLiveChatMessages(conversationId)
  const sendMessage = useSendLiveChatMessage(token)
  const markRead = useMarkLiveChatRead(token)
  const updateContact = useUpdateLiveChatContact(token)
  const registerAccount = useRegisterLiveChatAccount(token)
  const loginAccount = useLoginLiveChatAccount(token)

  const unread = conversation?.visitorUnread ?? 0
  // Every branded surface (pill + header) uses the project's brand color when
  // set, with white text/icons for contrast — falls back to the app's neutral
  // theme otherwise.
  const branded = Boolean(config?.brandColor)
  const brandStyle: CSSProperties | undefined = config?.brandColor
    ? { backgroundColor: config.brandColor }
    : undefined

  useEffect(() => {
    postToParent({ type: "resize", open })
  }, [open])

  // Dragging the header (open) or the launcher pill (closed) — this page
  // can't move itself (it's just the iframe's content), so it only tracks
  // the pointer and relays deltas; the loader script is what actually
  // repositions the iframe on the host page. Resets to the default
  // bottom-right corner next time the widget closes (the loader's job, not
  // this page's) — same as SupportChatWidget's floater.
  const dragInfo = useRef<{ startX: number; startY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // The launcher pill is also a click-to-open button, so a genuine drag has
  // to be distinguished from a plain click — same movement-threshold trick
  // SupportChatWidget uses for its own draggable launcher button.
  const hasDraggedRef = useRef(false)

  const startDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    hasDraggedRef.current = false
    // screenX/screenY (physical-display coordinates), not clientX/clientY —
    // clientX is relative to this iframe's own viewport, which is the very
    // thing handleDrag repositions on every move. Deriving deltas from a
    // frame that moves along with the drag creates a feedback loop (the
    // loader chases a target that keeps shifting under it), which is what
    // made the launcher feel like it was shaking/fighting the cursor.
    dragInfo.current = { startX: e.screenX, startY: e.screenY }
    setDragging(true)
    postToParent({ type: "dragStart" })
  }, [])

  const handleHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return
      startDrag(e)
    },
    [startDrag]
  )

  const handleLauncherPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => startDrag(e),
    [startDrag]
  )

  // Suppresses the launcher's click-to-open when the pointerdown/up turned
  // out to be a real drag rather than a tap.
  const handleLauncherClick = useCallback(() => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: PointerEvent) => {
      const drag = dragInfo.current
      if (!drag) return
      const dx = e.screenX - drag.startX
      const dy = e.screenY - drag.startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDraggedRef.current = true
      postToParent({ type: "drag", dx, dy })
    }
    const handleUp = () => {
      setDragging(false)
      dragInfo.current = null
      postToParent({ type: "dragEnd" })
    }
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [dragging])

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

  const handleContactSubmit = (data: { name?: string; email: string; phone?: string }) => {
    if (!visitor?.id) return
    updateContact.mutate({ visitorId: visitor.id, ...data })
  }

  const authError = (mutation: typeof registerAccount | typeof loginAccount) =>
    mutation.error instanceof ApiError ? mutation.error.message : mutation.isError ? "Something went wrong" : null

  if (!token) return null

  const displayName = config?.displayName ?? "Chat"
  const greeting = config?.greetingMessage ?? "Hi! How can we help?"
  const configLoaded = config !== undefined
  const configErrorMessage = configError
    ? configErrorObj instanceof ApiError
      ? configErrorObj.message
      : "This live chat widget is not available"
    : null
  // Account-required projects gate on a real login/signup instead of the
  // free-form contact form — useLiveChatVisitor resolves to null (not
  // undefined) once it's confirmed there's no logged-in session yet.
  const needsAuth = configLoaded && config.requireAccount && visitor === null
  // Until the visitor gives an email, lead with the contact form instead of
  // the chat thread — same flow as JivoChat's "Send us a message" widget.
  const needsContactInfo = configLoaded && !config.requireAccount && !visitor?.email

  return (
    <div className="flex h-screen w-screen flex-col items-end justify-end p-2">
      {open ? (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <header
            onPointerDown={handleHeaderPointerDown}
            style={brandStyle}
            className={cn(
              "flex touch-none items-center justify-between border-b px-4 py-3 select-none",
              dragging ? "cursor-grabbing" : "cursor-grab",
              !branded && "bg-muted/40"
            )}
          >
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                {config?.logoUrl && <AvatarImage src={config.logoUrl} alt={displayName} />}
                <AvatarFallback className={branded ? "bg-white/20 text-white" : undefined}>
                  <MessageCircle className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <p className={cn("text-sm font-semibold", branded && "text-white")}>{displayName}</p>
                {conversation ? (
                  <Badge variant={LIVE_CHAT_STATUS_VARIANT[conversation.status]} className="text-[0.65rem]">
                    {LIVE_CHAT_STATUS_LABELS[conversation.status]}
                  </Badge>
                ) : (
                  <p className={cn("text-xs", branded ? "text-white/80" : "text-muted-foreground")}>
                    We usually reply within a few hours
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className={branded ? "text-white hover:bg-white/20 hover:text-white" : undefined}
            >
              <X />
            </Button>
          </header>

          {configErrorMessage ? (
            <div className="flex flex-1 items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground">{configErrorMessage}</p>
            </div>
          ) : !configLoaded ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-muted-foreground">Loading…</p>
            </div>
          ) : needsAuth ? (
            <div className="flex-1 overflow-y-auto">
              <LiveChatAuthForm
                pending={registerAccount.isPending || loginAccount.isPending}
                error={authError(registerAccount) ?? authError(loginAccount)}
                onLogin={(data) => loginAccount.mutate(data)}
                onRegister={(data) => registerAccount.mutate(data)}
              />
            </div>
          ) : needsContactInfo ? (
            <div className="flex-1 overflow-y-auto">
              <PreChatForm pending={updateContact.isPending} onSubmit={handleContactSubmit} />
            </div>
          ) : (
            <>
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
                <WidgetComposer pending={sendMessage.isPending} onSend={handleSend} />
                <p className="mt-1.5 text-right text-[0.65rem] text-muted-foreground">
                  Live chat by TestMate
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={handleLauncherPointerDown}
          onClick={handleLauncherClick}
          aria-label="Open chat"
          style={brandStyle}
          className={cn(
            "relative flex h-full w-full touch-none items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-white shadow-lg transition-transform select-none",
            dragging ? "cursor-grabbing" : "cursor-grab hover:scale-[1.02]",
            !branded && "bg-primary"
          )}
        >
          <MessageCircle className="size-5 shrink-0" />
          <span className="truncate">Send us a message</span>
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-[0.7rem] font-semibold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
