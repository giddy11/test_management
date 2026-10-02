// components/contact-support/ContactSupportWidget.tsx
// Floating "Contact support" button (bottom-right by default) for every
// signed-in user. Opens a small dialog, then hands the message off to the
// chosen project's own WhatsApp number via a wa.me deep link — the
// recipient's own WhatsApp client sends it, nothing touches our backend.
//
// Renders nothing only when there is truly nothing to do: no project of the
// viewer's has a number AND the viewer can't set one up either. A team lead
// (or project.manageall) whose project has no number yet gets a "set one up"
// prompt right inside the dialog instead of being sent to the project page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PhoneNumberInput } from "@/components/shared/PhoneNumberInput"
import { WhatsAppChatPanel } from "@/components/contact-support/WhatsAppChatPanel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { useProjects, useUpdateProject } from "@/hooks/useProjects"
import { ApiError } from "@/transport/http"
import type { Project } from "@/types/project.types"

// Separates a drag from a click — a release after moving less than this never
// opens the dialog.
const DRAG_THRESHOLD = 5
const E164_REGEX = /^\+[1-9]\d{6,14}$/
const MAX_MESSAGE_LEN = 2000

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
  const { user, can } = useAuth()
  const canSeeProjects = Boolean(user) && can("project.read")
  const { data } = useProjects({ page: 1, limit: 100 }, canSeeProjects)
  const updateProject = useUpdateProject()

  const allProjects = useMemo(() => data?.data ?? [], [data])
  const eligibleProjects = useMemo(() => allProjects.filter((p) => Boolean(p.supportWhatsappNumber)), [allProjects])
  // Projects the viewer could configure a number for, but hasn't yet.
  const settableProjects = useMemo(
    () => allProjects.filter((p) => p.canManage && !p.supportWhatsappNumber),
    [allProjects]
  )

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  // Set once the viewer saves a number inline, so the dialog can switch
  // straight to composing without waiting on a refetch.
  const [justConfigured, setJustConfigured] = useState<Project | null>(null)
  const [setupProjectId, setSetupProjectId] = useState<string | null>(null)
  const [setupNumber, setSetupNumber] = useState("")

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

  // Everything messageable right now: projects with a number already, plus
  // one just configured inline this session (may not be in eligibleProjects
  // yet if the list hasn't refetched).
  const messageableProjects = useMemo(() => {
    if (!justConfigured) return eligibleProjects
    return eligibleProjects.some((p) => p.id === justConfigured.id)
      ? eligibleProjects
      : [...eligibleProjects, justConfigured]
  }, [eligibleProjects, justConfigured])

  // Each fresh open starts from the latest fetched data — by the time of a new
  // click, a number saved in an earlier session has already round-tripped
  // through the server and back into eligibleProjects via the query cache.
  const handleClick = useCallback(() => {
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }
    setMessage("")
    setJustConfigured(null)
    if (eligibleProjects.length > 0) {
      setSelectedProjectId(eligibleProjects.length === 1 ? eligibleProjects[0].id : null)
    } else {
      setSetupNumber("")
      setSetupProjectId(settableProjects.length === 1 ? settableProjects[0].id : null)
    }
    setOpen(true)
  }, [eligibleProjects, settableProjects])

  if (messageableProjects.length === 0 && settableProjects.length === 0) return null

  const selectedProject = messageableProjects.find((p) => p.id === selectedProjectId) ?? null
  const showCompose = messageableProjects.length > 0

  const handleSend = () => {
    const trimmed = message.trim()
    if (!selectedProject?.supportWhatsappNumber || !trimmed) return

    // Context so the project's contact knows who's messaging, from where, and
    // about which product.
    const who = user?.name ? (user.email ? `${user.name} (${user.email})` : user.name) : user?.email
    const context = [who, user?.companyName, `Product: ${selectedProject.name}`].filter(Boolean).join(" — ")
    const fullMessage = `${context}:\n${trimmed}`

    window.open(buildWhatsAppUrl(selectedProject.supportWhatsappNumber, fullMessage), "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  const setupProject = settableProjects.find((p) => p.id === setupProjectId) ?? null

  const handleSaveNumber = () => {
    if (!setupProject) return
    const trimmed = setupNumber.trim()
    if (!E164_REGEX.test(trimmed)) {
      toast.error("Enter a number in international format, e.g. +2348012345678")
      return
    }
    updateProject.mutate(
      { id: setupProject.id, payload: { supportWhatsappNumber: trimmed } },
      {
        onSuccess: (updated) => {
          toast.success("WhatsApp support number saved")
          setJustConfigured(updated)
          setSelectedProjectId(updated.id)
          setMessage("")
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the number"),
      }
    )
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
          showCloseButton={!showCompose}
          className={
            showCompose
              ? "h-[32rem] max-h-[85vh] w-full max-w-sm gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-sm"
              : "sm:max-w-md"
          }
        >
          {showCompose ? (
            <>
              {/* Visually-hidden but accessible — the panel's own header is the visible title. */}
              <DialogTitle className="sr-only">Contact support</DialogTitle>
              <DialogDescription className="sr-only">
                Send a message on WhatsApp. This opens a chat in a new tab.
              </DialogDescription>
              <WhatsAppChatPanel
                title={selectedProject?.name ?? "Contact support"}
                message={message}
                onMessageChange={setMessage}
                onSend={handleSend}
                onClose={() => setOpen(false)}
                maxLength={MAX_MESSAGE_LEN}
                disabled={!selectedProject}
                autoFocus={messageableProjects.length === 1}
                topSlot={
                  messageableProjects.length > 1 ? (
                    <Select value={selectedProjectId ?? undefined} onValueChange={setSelectedProjectId}>
                      <SelectTrigger id="contact-support-project" className="w-full" aria-label="Which product is this about?">
                        <SelectValue placeholder="Which product is this about?" />
                      </SelectTrigger>
                      <SelectContent>
                        {messageableProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : undefined
                }
              />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Set up Contact support</DialogTitle>
                <DialogDescription>
                  {setupProject
                    ? `No WhatsApp number is set for ${setupProject.name} yet. Add one to start using Contact support.`
                    : "No WhatsApp number is set for your products yet. Choose one to add it."}
                </DialogDescription>
              </DialogHeader>

              {settableProjects.length > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="contact-support-setup-project">Product</Label>
                  <Select value={setupProjectId ?? undefined} onValueChange={setSetupProjectId}>
                    <SelectTrigger id="contact-support-setup-project" className="w-full">
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {settableProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="contact-support-setup-number">WhatsApp number</Label>
                <PhoneNumberInput id="contact-support-setup-number" value={setupNumber} onChange={setSetupNumber} />
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveNumber}
                  disabled={!setupProject || !setupNumber.trim() || updateProject.isPending}
                >
                  Save and continue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
