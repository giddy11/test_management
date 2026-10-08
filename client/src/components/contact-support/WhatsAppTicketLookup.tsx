// components/contact-support/WhatsAppTicketLookup.tsx
// "Already have a ticket?" inside both WhatsApp widgets (see
// WhatsAppTicketPanel). The person enters their ticket number and email,
// proves the email is theirs with the same emailed 6-digit code as the
// My Tickets page, then reads the ticket's conversation with the support team
// and replies — live, in the same chat panel. Uses the My Tickets endpoints
// as they are.
//
// A ticket number alone is never enough: they're sequential and easy to
// guess, so the emailed code is what proves ownership. The code stays valid
// for days (server's TICKET_LOOKUP_CODE_TTL_MINUTES), so it's remembered in
// this browser and a returning visitor isn't asked for a new one every time.
import { useEffect, useId, useRef, useState } from "react"
import { ArrowLeft, Check, FileText, Mail } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WhatsAppChatPanel, WHATSAPP_FIELD_CLASS } from "@/components/contact-support/WhatsAppChatPanel"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import { useFeedbackCommentThread } from "@/hooks/useFeedbackComments"
import { cn } from "@/lib/utils"
import { MY_TICKET_STATUS_LABELS, type MyTicket } from "@/types/feedback.types"

// Matches the server's publicAddCommentSchema.
const MAX_REPLY_LEN = 3000
// Match the server's comment attachment rules (uploadCommentAttachments /
// commentAttachmentFileFilter) — checked here too so the visitor hears about
// a bad file straight away instead of after a failed upload.
const MAX_FILES = 5
const MAX_FILE_MB = 10
const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const ALLOWED_FILE_NAME = /\.(pdf|docx?|xlsx?|png|jpe?g|webp)$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SESSION_STORAGE_KEY = "tm_whatsapp_widget_ticket_session"

type Step = "find" | "code" | "thread"

interface Props {
  title: string
  onClose: () => void
  /** Back to writing a new message. */
  onBack: () => void
  initialEmail?: string
}

function loadSession(): { email: string; code: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as { email: string; code: string }) : null
  } catch {
    return null
  }
}

function saveSession(session: { email: string; code: string } | null) {
  try {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Storage blocked — the visitor just gets asked for a code again next time.
  }
}

// The server refused the email + code (wrong, or expired / pushed out by
// newer codes) — as opposed to a network or server failure.
function isCodeRefused(e: unknown): boolean {
  return e instanceof ApiError && e.statusCode === 401
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback
}

// Accepts the full reference ("TKT-20261008-023", any case) or just its
// number ("23" / "023").
function matchTicket(tickets: MyTicket[], input: string): MyTicket | null {
  const wanted = input.trim().toUpperCase()
  const asNumber = /^\d+$/.test(wanted) ? Number(wanted) : null
  return (
    tickets.find(
      (t) => t.ticketCode.toUpperCase() === wanted || (asNumber !== null && t.ticketNumber === asNumber)
    ) ?? null
  )
}

const ACTION_BUTTON_CLASS =
  "flex h-10 flex-1 items-center justify-center rounded-full bg-[#25d366] text-sm font-medium text-white transition-colors hover:bg-[#20bd5a] disabled:opacity-40"
const SECONDARY_BUTTON_CLASS =
  "h-10 shrink-0 rounded-full px-4 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"

export function WhatsAppTicketLookup({ title, onClose, onBack, initialEmail }: Props) {
  const fieldId = useId()
  const [step, setStep] = useState<Step>("find")
  const [ticketInput, setTicketInput] = useState("")
  const [email, setEmail] = useState(() => initialEmail ?? loadSession()?.email ?? "")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<MyTicket | null>(null)
  const [verifiedCode, setVerifiedCode] = useState("")
  const [reply, setReply] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [transcript, setTranscript] = useState<"idle" | "sending" | "sent">("idle")

  const { data: comments, isLoading: commentsLoading, isError: commentsError } = useFeedbackCommentThread(
    ticket?.id ?? ""
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (step === "thread") bottomRef.current?.scrollIntoView({ block: "end" })
  }, [step, comments.length, transcript])

  const trimmedEmail = email.trim()
  const canFind = Boolean(ticketInput.trim()) && EMAIL_REGEX.test(trimmedEmail)

  // Trades an email + code for the person's tickets, then picks the one asked
  // for. "invalid" = the code itself was refused (wrong or expired); any
  // other failure (network, server) is thrown for the caller to report.
  // Note every endpoint call throws an ApiError on failure (see wrapCall) —
  // it never resolves with success: false.
  const openWithCode = async (c: string): Promise<"opened" | "not_found" | "invalid"> => {
    let tickets: MyTicket[]
    try {
      tickets = (await FeedbackEndpoints.listMyTickets(trimmedEmail, c)).data ?? []
    } catch (e) {
      if (isCodeRefused(e)) return "invalid"
      throw e
    }
    saveSession({ email: trimmedEmail, code: c })
    const found = matchTicket(tickets, ticketInput)
    if (!found) return "not_found"
    setTicket(found)
    setVerifiedCode(c)
    setStep("thread")
    return "opened"
  }

  const notFoundMessage = () =>
    `No ticket ${ticketInput.trim().toUpperCase()} was found for ${trimmedEmail}. Check the reference in your confirmation email.`

  const handleFind = async () => {
    if (!canFind || busy) return
    setBusy(true)
    setError(null)
    try {
      // A code remembered from an earlier visit skips the email round-trip.
      const saved = loadSession()
      if (saved && saved.email.toLowerCase() === trimmedEmail.toLowerCase()) {
        const outcome = await openWithCode(saved.code)
        if (outcome === "opened") return
        if (outcome === "not_found") {
          setError(notFoundMessage())
          return
        }
        saveSession(null) // expired — fall through to a fresh code
      }
      await FeedbackEndpoints.requestMyTicketsCode(trimmedEmail)
      setCode("")
      setStep("code")
    } catch (e) {
      setError(errorMessage(e, "Couldn't send a code — try again shortly."))
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async () => {
    if (code.trim().length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await openWithCode(code.trim())
      if (outcome === "invalid") setError("That code is wrong or has expired.")
      else if (outcome === "not_found") {
        setStep("find")
        setError(notFoundMessage())
      }
    } catch (e) {
      setError(errorMessage(e, "Couldn't check that code — try again shortly."))
    } finally {
      setBusy(false)
    }
  }

  const addFiles = (picked: File[]) => {
    setError(null)
    const wrongType = picked.find((f) => !ALLOWED_FILE_NAME.test(f.name))
    if (wrongType) {
      setError(`"${wrongType.name}" can't be attached — only images, PDF, Word or Excel files.`)
      return
    }
    const tooBig = picked.find((f) => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) {
      setError(`"${tooBig.name}" is over ${MAX_FILE_MB} MB.`)
      return
    }
    const combined = [...files, ...picked]
    if (combined.length > MAX_FILES) setError(`Up to ${MAX_FILES} files per message — the extras were left out.`)
    setFiles(combined.slice(0, MAX_FILES))
  }

  const handleReply = async () => {
    const body = reply.trim()
    if (!ticket || (!body && files.length === 0) || sending) return
    setSending(true)
    setError(null)
    try {
      await FeedbackEndpoints.publicAddComment(ticket.id, trimmedEmail, verifiedCode, body, files)
      // The new message arrives through the live thread listener.
      setReply("")
      setFiles([])
    } catch (e) {
      if (isCodeRefused(e)) expireSession()
      else setError(errorMessage(e, "Couldn't send your reply — try again."))
    } finally {
      setSending(false)
    }
  }

  // Code expired mid-conversation — back to the start for a fresh one.
  const expireSession = () => {
    saveSession(null)
    setTicket(null)
    setStep("find")
    setError("Your code has expired — continue to get a new one.")
  }

  const handleEmailTranscript = async () => {
    if (!ticket || transcript === "sending") return
    setTranscript("sending")
    setError(null)
    // The reader's own time zone, so the transcript's timestamps match theirs.
    let timeZone: string | undefined
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      timeZone = undefined
    }
    try {
      await FeedbackEndpoints.publicEmailTranscript(ticket.id, trimmedEmail, verifiedCode, timeZone)
      setTranscript("sent")
    } catch (e) {
      setTranscript("idle")
      if (isCodeRefused(e)) expireSession()
      else setError(errorMessage(e, "Couldn't send the transcript — try again shortly."))
    }
  }

  if (step === "thread" && ticket) {
    return (
      <WhatsAppChatPanel
        title={title}
        subtitle={`${ticket.ticketCode} · ${MY_TICKET_STATUS_LABELS[ticket.status]}`}
        message={reply}
        onMessageChange={setReply}
        onSend={handleReply}
        onClose={onClose}
        maxLength={MAX_REPLY_LEN}
        placeholder="Reply to the support team"
        sending={sending}
        showGreeting={false}
        attachments={{
          files,
          accept: ATTACHMENT_ACCEPT,
          onAdd: addFiles,
          onRemove: (i) => setFiles((prev) => prev.filter((_, j) => j !== i)),
        }}
        topSlot={
          <div className="flex items-center gap-2 text-neutral-800">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to a new message"
              className="shrink-0 rounded-full p-1 text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              <ArrowLeft className="size-4" />
            </button>
            <p className="min-w-0 flex-1 truncate text-xs font-medium">{ticket.title}</p>
            <button
              type="button"
              onClick={handleEmailTranscript}
              disabled={transcript !== "idle"}
              title={transcript === "sent" ? `Sent to ${trimmedEmail}` : "Email me this whole conversation"}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                transcript === "sent"
                  ? "border-[#25d366] text-[#075e54]"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
              )}
            >
              {transcript === "sent" ? <Check className="size-3" /> : <Mail className="size-3" />}
              {transcript === "sending" ? "Sending…" : transcript === "sent" ? "Emailed" : "Email transcript"}
            </button>
          </div>
        }
      >
        {commentsLoading && <p className="py-4 text-center text-xs text-neutral-600">Loading conversation…</p>}
        {!commentsLoading && commentsError && (
          <p className="py-4 text-center text-xs text-red-600">Couldn't load the conversation — try again shortly.</p>
        )}
        {!commentsLoading && !commentsError && comments.length === 0 && (
          <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
            No replies yet. We'll email you when the support team writes back — or send them a message below.
          </div>
        )}
        {comments.map((c) => {
          const mine = c.authorType === "submitter"
          return (
            <div
              key={c.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm text-neutral-800 shadow-sm",
                mine ? "ml-auto rounded-tr-sm bg-[#dcf8c6]" : "rounded-tl-sm bg-white"
              )}
            >
              {/* Individual staff names stay internal — same as the My Tickets page. */}
              {!mine && <p className="mb-0.5 text-xs font-medium text-[#075e54]">Support team</p>}
              {c.body && <p className="whitespace-pre-wrap wrap-break-word">{c.body}</p>}
              {c.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.attachments.map((a, i) =>
                    a.mimeType?.startsWith("image/") ? (
                      <a key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.name ?? "Attachment"} className="size-16 rounded object-cover" />
                      </a>
                    ) : (
                      <a
                        key={`${a.url}-${i}`}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <FileText className="size-3" />
                        <span className="max-w-36 truncate">{a.name ?? "Attachment"}</span>
                      </a>
                    )
                  )}
                </div>
              )}
              <p className="mt-1 text-right text-[10px] text-neutral-500">
                {new Date(c.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          )
        })}
        {transcript === "sent" && (
          <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
            📧 Transcript sent to {trimmedEmail}. Not in your inbox? Check your spam or junk folder.
          </div>
        )}
        {error && <p className="text-center text-xs text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </WhatsAppChatPanel>
    )
  }

  return (
    <WhatsAppChatPanel
      title={title}
      message=""
      onMessageChange={() => {}}
      onSend={() => {}}
      onClose={onClose}
      maxLength={MAX_REPLY_LEN}
      showGreeting={false}
      autoFocus={false}
      footer={
        <div className="flex shrink-0 items-center gap-2 bg-[#f0f0f0] p-2">
          {step === "find" ? (
            <button type="button" onClick={handleFind} disabled={!canFind || busy} className={ACTION_BUTTON_CLASS}>
              {busy ? "Checking…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleVerify}
              disabled={code.trim().length !== 6 || busy}
              className={ACTION_BUTTON_CLASS}
            >
              {busy ? "Checking…" : "View ticket"}
            </button>
          )}
          <button type="button" onClick={onBack} className={SECONDARY_BUTTON_CLASS}>
            New message
          </button>
        </div>
      }
    >
      <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm">
        {step === "find"
          ? "Enter your ticket reference and the email you used, and we'll show you the conversation."
          : `If ${trimmedEmail} has tickets with us, we've just emailed it a 6-digit code. Enter it below — not in your inbox? Check your spam or junk folder.`}
      </div>

      <form
        className="space-y-3 rounded-lg bg-white p-3 text-sm text-neutral-800 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (step === "find") void handleFind()
          else void handleVerify()
        }}
      >
        {step === "find" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-ticket`} className="text-xs">
                Ticket reference
              </Label>
              <Input
                id={`${fieldId}-ticket`}
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="TKT-20261008-023"
                maxLength={40}
                autoFocus
                className={WHATSAPP_FIELD_CLASS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-email`} className="text-xs">
                Email you used
              </Label>
              <Input
                id={`${fieldId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                className={WHATSAPP_FIELD_CLASS}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-code`} className="text-xs">
              6-digit code
            </Label>
            <Input
              id={`${fieldId}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className={cn(WHATSAPP_FIELD_CLASS, "tracking-[0.3em]")}
            />
            <button
              type="button"
              onClick={() => {
                setStep("find")
                setError(null)
              }}
              className="text-[11px] text-[#075e54] underline-offset-2 hover:underline"
            >
              Use a different email or ticket
            </button>
          </div>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        {/* Lets Enter submit the form; the visible action lives in the footer. */}
        <button type="submit" hidden />
      </form>
    </WhatsAppChatPanel>
  )
}
