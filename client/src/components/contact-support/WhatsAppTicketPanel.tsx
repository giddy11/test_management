// components/contact-support/WhatsAppTicketPanel.tsx
// WhatsAppChatPanel plus a hand-off that also logs a ticket — shared by
// TestMate's own in-app widget (ContactSupportWidget) and the embeddable one
// (WhatsAppWidgetPage). Collects who's writing (name and email, unless the
// caller already knows them), an optional phone number, a topic and the full
// message. On send it logs the ticket first, then opens WhatsApp with the
// message and the ticket's reference pre-filled; the server emails the
// person the usual "received" confirmation for that ticket.
//
// A failed ticket never blocks the hand-off: WhatsApp still opens, just
// without a reference — reaching support matters more than the record.
//
// "Already have a ticket?" switches to WhatsAppTicketLookup, where someone
// who's already written in can read and reply to their ticket's conversation.
import { useEffect, useId, useState } from "react"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WhatsAppChatPanel, WHATSAPP_FIELD_CLASS } from "@/components/contact-support/WhatsAppChatPanel"
import { WhatsAppTicketLookup } from "@/components/contact-support/WhatsAppTicketLookup"
import { cn } from "@/lib/utils"
import {
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
  type WhatsAppTicketPayload,
  type WhatsAppTicketResult,
} from "@/types/feedback.types"

// Matches the server's message limit (whatsAppTicketSchema / testMateSupportTicketSchema).
const MAX_MESSAGE_LEN = 4000
const MAX_PAGE_URL_LEN = 500
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const E164_REGEX = /^\+[1-9]\d{6,14}$/
const TOPICS: FeedbackType[] = ["complaint", "bug", "feature_request"]
// Remembers an embed visitor's name/email/phone for their next message —
// a per-browser convenience only, so every read/write tolerates failure.
const CONTACT_STORAGE_KEY = "tm_whatsapp_widget_contact"

const FIELD_CLASS = WHATSAPP_FIELD_CLASS

export interface SenderDetails {
  name: string
  email: string
  phone: string
}

interface Props {
  title: string
  /** The WhatsApp number the message is handed off to. */
  phoneNumber: string
  onClose: () => void
  createTicket: (payload: WhatsAppTicketPayload) => Promise<WhatsAppTicketResult>
  /** Who's writing, when the caller already knows (a signed-in user) — hides the name/email fields. */
  knownSender?: { name: string; email: string; phone?: string | null }
  /** One line naming who's writing and from where, put above the message in WhatsApp. */
  describeSender: (sender: SenderDetails) => string
  /** The page the person was on — added to the ticket as context. */
  pageUrl?: string
  placeholder?: string
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

function loadSavedContact(): Partial<SenderDetails> {
  try {
    const raw = localStorage.getItem(CONTACT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<SenderDetails>) : {}
  } catch {
    return {}
  }
}

function saveContact(contact: SenderDetails) {
  try {
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contact))
  } catch {
    // Storage blocked (private window, embedded third-party context) — just
    // means the visitor retypes their details next time.
  }
}

export function WhatsAppTicketPanel({
  title,
  phoneNumber,
  onClose,
  createTicket,
  knownSender,
  describeSender,
  pageUrl,
  placeholder = "Type your message",
}: Props) {
  const fieldId = useId()
  const [lookingUp, setLookingUp] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState(knownSender?.phone ?? "")
  const [topic, setTopic] = useState<FeedbackType>("complaint")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{
    message: string
    email: string
    ticketCode: string | null
    url: string
    opened: boolean
  } | null>(null)

  useEffect(() => {
    if (knownSender) return
    const saved = loadSavedContact()
    if (saved.name) setName(saved.name)
    if (saved.email) setEmail(saved.email)
    if (saved.phone) setPhone(saved.phone)
  }, [knownSender])

  const senderName = knownSender?.name ?? name.trim()
  const senderEmail = knownSender?.email ?? email.trim()
  // Typed with spaces/dashes is fine — only the digits and the leading + count.
  const normalisedPhone = phone.replace(/[\s()-]/g, "")
  const emailInvalid = !knownSender && email.trim() !== "" && !EMAIL_REGEX.test(email.trim())
  const phoneInvalid = normalisedPhone !== "" && !E164_REGEX.test(normalisedPhone)
  const detailsValid =
    Boolean(senderName) && EMAIL_REGEX.test(senderEmail) && !phoneInvalid

  const handleSend = async () => {
    const trimmed = message.trim()
    if (!detailsValid || !trimmed || sending) return
    const sender: SenderDetails = { name: senderName, email: senderEmail, phone: normalisedPhone }

    // Opened right away, inside the click — a window.open after the await
    // below would be blocked as a popup by most browsers (Safari always).
    // Pointed at WhatsApp once the ticket exists; cut off from this page
    // first, same as noopener would (which can't be used here — it makes
    // window.open return null, leaving nothing to point anywhere later).
    const waWindow = window.open("", "_blank")
    if (waWindow) waWindow.opener = null

    setSending(true)
    let ticketCode: string | null = null
    try {
      const result = await createTicket({
        type: topic,
        message: trimmed,
        ...(knownSender ? {} : { submitterName: sender.name, submitterEmail: sender.email }),
        ...(sender.phone ? { submitterPhone: sender.phone } : {}),
        ...(pageUrl ? { pageUrl: pageUrl.slice(0, MAX_PAGE_URL_LEN) } : {}),
      })
      ticketCode = result.ticketCode
    } catch {
      // Non-fatal — see the header comment. WhatsApp still opens below.
    }

    const header = [ticketCode ? `Ticket ${ticketCode}` : null, describeSender(sender)].filter(Boolean).join(" — ")
    const url = buildWhatsAppUrl(phoneNumber, `${header}:\n${trimmed}`)
    if (waWindow) waWindow.location.href = url
    if (!knownSender) saveContact(sender)

    setSending(false)
    setMessage("")
    setSent({ message: trimmed, email: sender.email, ticketCode, url, opened: Boolean(waWindow) })
  }

  if (lookingUp) {
    return (
      <WhatsAppTicketLookup
        title={title}
        onClose={onClose}
        onBack={() => setLookingUp(false)}
        initialEmail={knownSender?.email ?? (email.trim() || undefined)}
      />
    )
  }

  if (sent) {
    return (
      <WhatsAppChatPanel
        title={title}
        message=""
        onMessageChange={() => {}}
        onSend={() => {}}
        onClose={onClose}
        maxLength={MAX_MESSAGE_LEN}
        autoFocus={false}
        footer={
          <div className="flex shrink-0 items-center gap-2 bg-[#f0f0f0] p-2">
            <a
              href={sent.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-medium text-white transition-colors hover:bg-[#20bd5a]"
            >
              <ExternalLink className="size-4" />
              {sent.opened ? "Open WhatsApp again" : "Open WhatsApp"}
            </a>
            <button
              type="button"
              onClick={() => setSent(null)}
              className="h-10 shrink-0 rounded-full px-4 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
            >
              New message
            </button>
          </div>
        }
      >
        <div className="ml-auto max-w-[80%] rounded-lg rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm whitespace-pre-wrap break-words text-neutral-800 shadow-sm">
          {sent.message}
        </div>
        <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
          {sent.ticketCode ? (
            <>
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4 shrink-0 text-[#25d366]" />
                Ticket {sent.ticketCode} logged
              </p>
              <p className="mt-1">
                We've emailed a confirmation to {sent.email} (not in your inbox? check your spam or junk
                folder). Your message is ready in WhatsApp with this reference — send it there to carry on the
                conversation.
              </p>
              <button
                type="button"
                onClick={() => setLookingUp(true)}
                className="mt-1.5 text-xs font-medium text-[#075e54] underline-offset-2 hover:underline"
              >
                See replies to your tickets
              </button>
            </>
          ) : (
            <p>
              We couldn't log a ticket just now, but your message is ready in WhatsApp — send it there and
              we'll pick it up.
            </p>
          )}
        </div>
      </WhatsAppChatPanel>
    )
  }

  return (
    <WhatsAppChatPanel
      title={title}
      message={message}
      onMessageChange={setMessage}
      onSend={handleSend}
      onClose={onClose}
      maxLength={MAX_MESSAGE_LEN}
      placeholder={placeholder}
      disabled={!detailsValid}
      sending={sending}
      // Signed-in users go straight to the message; visitors start at their name.
      autoFocus={Boolean(knownSender)}
    >
      <div className="space-y-3 rounded-lg bg-white p-3 text-sm text-neutral-800 shadow-sm">
        {knownSender ? (
          <p className="text-xs text-neutral-600">
            Sending as <span className="font-medium text-neutral-800">{knownSender.name}</span> ({knownSender.email})
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-name`} className="text-xs">
                Full name
              </Label>
              <Input
                id={`${fieldId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                autoFocus
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-email`} className="text-xs">
                Email
              </Label>
              <Input
                id={`${fieldId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                aria-invalid={emailInvalid || undefined}
                className={FIELD_CLASS}
              />
              {emailInvalid && <p className="text-[11px] text-red-600">Enter a valid email address.</p>}
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-phone`} className="text-xs">
            Phone <span className="font-normal text-neutral-500">(optional)</span>
          </Label>
          <Input
            id={`${fieldId}-phone`}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            maxLength={30}
            autoComplete="tel"
            aria-invalid={phoneInvalid || undefined}
            className={FIELD_CLASS}
          />
          {phoneInvalid && (
            <p className="text-[11px] text-red-600">Use international format, e.g. +2348012345678.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">What's this about?</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What's this about?">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                aria-pressed={topic === t}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  topic === t
                    ? "border-[#075e54] bg-[#075e54] text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
                )}
              >
                {FEEDBACK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-neutral-500">
          Type your full message below. We'll log a ticket and email you its reference before WhatsApp opens.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setLookingUp(true)}
        className="mx-auto block rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#075e54] shadow-sm transition-colors hover:bg-white"
      >
        Already have a ticket? See replies
      </button>
    </WhatsAppChatPanel>
  )
}
