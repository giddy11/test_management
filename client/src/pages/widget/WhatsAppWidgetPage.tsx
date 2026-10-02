// pages/widget/WhatsAppWidgetPage.tsx
// The embeddable WhatsApp contact widget's entire UI. Reached via
// /widget/live-chat/:token, always loaded inside an iframe on a third-party
// site (see public/live-chat-widget.js, the loader script that creates that
// iframe and resizes it on request). Never part of the authenticated app
// shell — no DashboardLayout, no useAuth.
//
// Replaces the previous full live-chat panel as what this route renders (see
// LiveChatWidgetPage.tsx, left completely intact and just unrouted — see
// App.tsx — in case it's wanted again) with a round launcher that opens a
// WhatsApp-styled chat panel (see WhatsAppChatPanel, shared with the internal
// Contact support widget) and hands the message off to the project's own
// WhatsApp number via a wa.me link. Nothing about the message touches our
// backend — no chat actually happens inside this iframe.
//
// No Dialog/overlay here on purpose: this page already fills a tiny, purpose-
// built iframe, so a full-viewport dark overlay would just darken the whole
// widget. The launcher and the panel are simply swapped in place, exactly
// like LiveChatWidgetPage did.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { useParams } from "react-router-dom"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WhatsAppChatPanel } from "@/components/contact-support/WhatsAppChatPanel"
import { cn } from "@/lib/utils"
import { useLiveChatWidgetConfig } from "@/hooks/useLiveChatWidget"

// Must match PARENT_MESSAGE_SOURCE in public/live-chat-widget.js.
const PARENT_MESSAGE_SOURCE = "testmate-live-chat-widget"
const DRAG_THRESHOLD = 5
const MAX_MESSAGE_LEN = 2000

// The loader owns the iframe's actual pixel size and position on the host
// page — this page only ever asks for "open" vs "closed" (or hides itself
// entirely) and relays drag deltas, same protocol LiveChatWidgetPage used.
function postToParent(payload: Record<string, unknown>) {
  if (window.parent === window) return // previewed standalone, not embedded — no-op
  window.parent.postMessage({ source: PARENT_MESSAGE_SOURCE, ...payload }, "*")
}

// wa.me (not web.whatsapp.com/send) on every platform — it's WhatsApp's own
// universal click-to-chat link and redirects correctly on desktop (an
// interstitial that hands off to WhatsApp Web/Desktop) even when the browser
// has no WhatsApp Web session yet. web.whatsapp.com/send only works with an
// already-logged-in session — otherwise it just shows the generic QR login
// screen and silently drops the phone/text params.
function buildWhatsAppUrl(phoneNumber: string, message: string) {
  const digits = phoneNumber.replace(/\D/g, "")
  const text = encodeURIComponent(message)
  return `https://wa.me/${digits}?text=${text}`
}

export default function WhatsAppWidgetPage() {
  const { token } = useParams<{ token: string }>()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")

  // This page is always the entire document (its own dedicated iframe) — undo
  // the app's default opaque body background so the transparent corners
  // around the round launcher actually show the host page through.
  useEffect(() => {
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
  }, [])

  const { data: config, isError: configError } = useLiveChatWidgetConfig(token)
  const phoneNumber = config?.supportWhatsappNumber ?? null

  useEffect(() => {
    postToParent({ type: "resize", open })
  }, [open])

  // The loader script starts the iframe fully hidden and waits for one of
  // these before ever showing anything. A resolved config with no number set
  // is treated the same as an invalid token — there's nothing this widget can
  // do, so it never appears at all (same "render nothing" rule the internal
  // Contact support widget follows).
  useEffect(() => {
    if (config === undefined) return
    postToParent({ type: phoneNumber ? "ready" : "unavailable" })
  }, [config, phoneNumber])
  useEffect(() => {
    if (configError) postToParent({ type: "unavailable" })
  }, [configError])

  // Dragging the launcher — this page can't move itself (it's just the
  // iframe's content), so it only tracks the pointer and relays deltas; the
  // loader script is what actually repositions the iframe on the host page.
  // Same movement-threshold trick as the internal widget's launcher, so a
  // drag-release never opens the panel.
  const dragInfo = useRef<{ startX: number; startY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const hasDraggedRef = useRef(false)

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    hasDraggedRef.current = false
    // screenX/screenY (physical-display coordinates), not clientX/clientY —
    // clientX is relative to this iframe's own viewport, the very thing being
    // repositioned, which would create a feedback loop.
    dragInfo.current = { startX: e.screenX, startY: e.screenY }
    setDragging(true)
    postToParent({ type: "dragStart" })
  }, [])

  const handleClick = useCallback(() => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }
    setMessage("")
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: PointerEvent) => {
      const drag = dragInfo.current
      if (!drag) return
      const dx = e.screenX - drag.startX
      const dy = e.screenY - drag.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) hasDraggedRef.current = true
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

  // Disabled/invalid token, or no number configured yet: nothing to show,
  // ever, for this page load — the loader hides the iframe entirely on the
  // "unavailable" message posted above, so there's no launcher left dangling
  // on the host page.
  if (!token || !phoneNumber) return null

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed) return

    // No logged-in visitor to name here — the referring page and the
    // project's own name are the only context available.
    const fromPage = document.referrer ? new URL(document.referrer).hostname : null
    const context = [fromPage ? `Visitor on ${fromPage}` : "Website visitor", `Product: ${config?.displayName}`].join(
      " — "
    )
    const fullMessage = `${context}:\n${trimmed}`

    window.open(buildWhatsAppUrl(phoneNumber, fullMessage), "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  return (
    <div className="flex h-dvh w-dvw items-center justify-center p-1">
      {open ? (
        <WhatsAppChatPanel
          title={config?.displayName ?? "Contact us"}
          message={message}
          onMessageChange={setMessage}
          onSend={handleSend}
          onClose={() => setOpen(false)}
          maxLength={MAX_MESSAGE_LEN}
          placeholder="How can we help?"
        />
      ) : (
        <Button
          size="icon-lg"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          aria-label="Contact us on WhatsApp"
          className={cn(
            "size-14 touch-none rounded-full bg-[#25d366] text-white shadow-lg hover:bg-[#20bd5a]",
            dragging ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          <MessageCircle className="size-6" />
        </Button>
      )}
    </div>
  )
}
