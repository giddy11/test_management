// components/contact-support/ContactSupportWidget.tsx
// Floating "Contact support" button (bottom-right by default) for every
// signed-in user. Opens a small WhatsApp-styled chat panel that logs a ticket
// in the "TestMate Support" project (created automatically server-side), then
// hands the message — with the ticket's reference — off to TestMate's own
// support WhatsApp number via a wa.me deep link. See WhatsAppTicketPanel.
//
// This is TestMate's own support line, not a project's: the per-project
// numbers (see ProjectSupportNumberField) only power the embeddable widget on
// a project's external site (see WhatsAppWidgetPage).
import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WhatsAppTicketPanel } from "@/components/contact-support/WhatsAppTicketPanel"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { useCreateTestMateSupportTicket } from "@/hooks/useFeedback"

// Separates a drag from a click — a release after moving less than this never
// opens the dialog.
const DRAG_THRESHOLD = 5
// TestMate's own support WhatsApp number, in international format.
const SUPPORT_WHATSAPP_NUMBER = "+2347031170092"

export function ContactSupportWidget() {
  const { user } = useAuth()
  const createTicket = useCreateTestMateSupportTicket()

  const [open, setOpen] = useState(false)

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
    setOpen(true)
  }, [])

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
          {/* Mounted only while open (Radix unmounts closed content), so every open starts fresh. */}
          <WhatsAppTicketPanel
            title="TestMate support"
            phoneNumber={SUPPORT_WHATSAPP_NUMBER}
            onClose={() => setOpen(false)}
            createTicket={createTicket.mutateAsync}
            knownSender={user ? { name: user.name || user.email, email: user.email, phone: user.phoneNumber } : undefined}
            // Context so TestMate's support knows who's messaging and from where.
            describeSender={(s) =>
              [`${s.name} (${s.email})`, user?.companyName, "Sent from the TestMate app"].filter(Boolean).join(" — ")
            }
            pageUrl={window.location.href}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
