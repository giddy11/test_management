// components/support-chat/SupportChatWidget.tsx
// Floating support chat (bottom-right) for internal users to reach the platform's
// super admins. Two-way, realtime via Firestore. Rendered for admins and regular
// users only — super admins answer from the dedicated inbox, not this floater.
import { useEffect, useRef, useState } from "react"
import { Headset, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { ChatComposer } from "@/components/support-chat/ChatComposer"
import { ChatMessageBody } from "@/components/support-chat/ChatMessageBody"
import {
  useMyConversation,
  useSupportChatMessages,
  useSendMyMessage,
  useMarkMyRead,
  useSupportChatSettings,
} from "@/hooks/useSupportChat"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function SupportChatWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Only admins and regular users get the floater; super admins use the inbox,
  // and external IT supporters have their own support portal.
  const roleAllowed = user?.role === UserRole.ADMIN || user?.role === UserRole.USER

  // The super admin can disable the widget platform-wide.
  const { data: settings } = useSupportChatSettings(roleAllowed)
  const canUse = roleAllowed && settings?.enabled === true

  const { data: conversation } = useMyConversation(canUse)
  const conversationId = conversation?.id
  const { data: messages, isLoading } = useSupportChatMessages(conversationId)
  const sendMessage = useSendMyMessage()
  const markRead = useMarkMyRead()

  const unread = conversation?.userUnread ?? 0

  // Clear the unread badge once the panel is opened on unseen replies.
  useEffect(() => {
    if (open && unread > 0) markRead.mutate()
    // markRead identity is stable enough; only react to open/unread changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unread])

  // Keep the newest message in view.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  if (!canUse) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="flex h-[34rem] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Headset className="size-4 text-primary" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">Support</p>
                <p className="text-xs text-muted-foreground">We usually reply shortly</p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close support chat">
              <X />
            </Button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {isLoading && conversationId ? (
              <p className="text-center text-xs text-muted-foreground">Loading…</p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Headset className="mb-2 size-8 opacity-40" />
                <p className="font-medium text-foreground">Need a hand?</p>
                <p className="max-w-[16rem]">
                  Send a message and the admin team will get back to you here.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.authorRole !== "admin"
                return (
                  <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                    {!mine && (
                      <span className="mb-0.5 px-1 text-[0.7rem] font-medium text-muted-foreground">
                        Support
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
              onSend={(body, files) => sendMessage.mutateAsync({ body, files })}
            />
          </div>
        </div>
      )}

      <Button
        size="icon-lg"
        className="relative size-14 rounded-full shadow-lg"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        {open ? <X className="size-6" /> : <Headset className="size-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[0.7rem] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
    </div>
  )
}
