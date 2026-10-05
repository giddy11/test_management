// components/contact-support/ContactSupportWidget.tsx
// Floating "Contact support" button (bottom-right by default) for every
// signed-in user. Opens a small WhatsApp-styled chat panel, then hands the
// message off to TestMate's own support WhatsApp number via a wa.me deep link
// — the recipient's own WhatsApp client sends it, nothing touches our backend.
//
// This is TestMate's own support line, not a project's: the per-project
// numbers (see ProjectSupportNumberField) only power the embeddable widget on
// a project's external site (see WhatsAppWidgetPage).
import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WhatsAppChatPanel } from "@/components/contact-support/WhatsAppChatPanel"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

// Separates a drag from a click — a release after moving less than this never
// opens the dialog.
const DRAG_THRESHOLD = 5
const MAX_MESSAGE_LEN = 2000
// TestMate's own support WhatsApp number, in international format.
const SUPPORT_WHATSAPP_NUMBER = "+2347031170092"

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

export function ContactSupportWidget() {
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")

  // Lets the launcher button itself be dragged anywhere on screen — it can sit
  // over page controls (e.g. pagination) in the bottom-right corner otherwise.
  const containerRef = useRef<HTMLDivElement>(null)
  const dragInfo = useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null)
  const hasDragged = useRef(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const container = containerRef.current
    if (!container) return
    hasDragged.current = false
    const rect = container.getBoundingClientRect()
    dragInfo.current = { startX: e.clientX, startY: e.clientY, startTop: rect.top, startLeft: rect.left }
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const container = containerRef.current
    const { width, height } = container?.getBoundingClientRect() ?? { width: 0, height: 0 }

    const handleMove = (e: PointerEvent) => {
      const drag = dragInfo.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) hasDragged.current = true
      if (!hasDragged.current) return
      const maxLeft = Math.max(window.innerWidth - width, 0)
      const maxTop = Math.max(window.innerHeight - height, 0)
      const left = Math.min(Math.max(drag.startLeft + dx, 0), maxLeft)
      const top = Math.min(Math.max(drag.startTop + dy, 0), maxTop)
      setPos({ top, left })
    }
    const handleUp = () => {
      setDragging(false)
      dragInfo.current = null
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

  // Re-clamp on resize so a previous drag can't strand the button off-screen
  // (e.g. dragged to the far right on a wide window, then the window shrinks).
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current
      if (!container) return
      setPos((p) => {
        if (!p) return p
        const { width, height } = container.getBoundingClientRect()
        const maxLeft = Math.max(window.innerWidth - width, 0)
        const maxTop = Math.max(window.innerHeight - height, 0)
        return { top: Math.min(p.top, maxTop), left: Math.min(p.left, maxLeft) }
      })
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const handleClick = useCallback(() => {
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }
    setMessage("")
    setOpen(true)
  }, [])

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed) return

    // Context so TestMate's support knows who's messaging and from where.
    const who = user?.name ? (user.email ? `${user.name} (${user.email})` : user.name) : user?.email
    const context = [who, user?.companyName, "Sent from the TestMate app"].filter(Boolean).join(" — ")
    const fullMessage = `${context}:\n${trimmed}`

    window.open(buildWhatsAppUrl(SUPPORT_WHATSAPP_NUMBER, fullMessage), "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  return (
    <>
      <div
        ref={containerRef}
        style={pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
        className={cn("fixed z-50 print:hidden", !pos && "bottom-4 right-4")}
      >
        <Button
          size="icon-lg"
          className={cn(
            "size-14 touch-none rounded-full bg-[#25d366] text-white shadow-lg hover:bg-[#20bd5a]",
            dragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          aria-label="Contact support on WhatsApp"
        >
          <MessageCircle className="size-6" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="h-[32rem] max-h-[85vh] w-full max-w-sm gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-sm"
        >
          {/* Visually-hidden but accessible — the panel's own header is the visible title. */}
          <DialogTitle className="sr-only">Contact support</DialogTitle>
          <DialogDescription className="sr-only">
            Send a message on WhatsApp. This opens a chat in a new tab.
          </DialogDescription>
          <WhatsAppChatPanel
            title="TestMate support"
            message={message}
            onMessageChange={setMessage}
            onSend={handleSend}
            onClose={() => setOpen(false)}
            maxLength={MAX_MESSAGE_LEN}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
