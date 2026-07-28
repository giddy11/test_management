// Public, unauthenticated ticket-status lookup — no account needed. A
// submitter enters the email they used, gets a code, and trades it for every
// ticket they've ever raised (across every project/company).
import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  MessageSquare,
  PlusCircle,
  TicketCheck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TicketThreadDialog } from "@/components/feedback/TicketThreadDialog"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import { FEEDBACK_TYPE_LABELS, MY_TICKET_STATUS_LABELS, type MyTicket } from "@/types/feedback.types"

const STATUS_VARIANT: Record<MyTicket["status"], "default" | "secondary" | "outline" | "destructive"> = {
  received: "destructive",
  in_progress: "secondary",
  pending_your_confirmation: "default",
  resolved: "outline",
}

type Step = "loading" | "email" | "code" | "list"

// The code stays valid for repeated lookups until it naturally expires
// (same TTL as the email it came in) — it's read-only access to your own
// tickets, not a one-shot action. Caching the code itself (not the fetched
// list) means a page refresh re-runs a real fetch instead of replaying a
// stale snapshot, so a ticket raised after the last visit still shows up.
const CREDENTIAL_KEY = "tm_my_tickets_credential"

interface StoredCredential {
  email: string
  code: string
}

function loadStoredCredential(): StoredCredential | null {
  try {
    const raw = sessionStorage.getItem(CREDENTIAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredCredential>
    if (!parsed.email || !parsed.code) return null
    return { email: parsed.email, code: parsed.code }
  } catch {
    return null
  }
}

function saveStoredCredential(email: string, code: string) {
  sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ email, code }))
}

function clearStoredCredential() {
  sessionStorage.removeItem(CREDENTIAL_KEY)
}

export default function MyTicketsPage() {
  const [step, setStep] = useState<Step>(() => (loadStoredCredential() ? "loading" : "email"))
  const [email, setEmail] = useState(() => loadStoredCredential()?.email ?? "")
  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)
  // Which ticket's "No, not fixed" reason box is open, and its draft text.
  const [reopeningId, setReopeningId] = useState<string | null>(null)
  const [reopenReason, setReopenReason] = useState("")
  // Ticket currently submitting a confirm/reopen verdict.
  const [actingId, setActingId] = useState<string | null>(null)
  // Ticket whose conversation thread dialog is open (null = closed).
  const [threadTicket, setThreadTicket] = useState<MyTicket | null>(null)

  // Silent re-fetch on load when a still-valid credential is cached — no
  // code re-entry, and always a fresh list (unlike caching the list itself).
  useEffect(() => {
    const stored = loadStoredCredential()
    if (!stored) return
    let cancelled = false
    FeedbackEndpoints.listMyTickets(stored.email, stored.code)
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setTickets(res.data ?? [])
          setStep("list")
        } else {
          clearStoredCredential()
          setStep("email")
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredCredential()
          setStep("email")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-fetches in place after a confirm/reopen so the ticket's new status
  // shows immediately, without a full page reload.
  const refreshTickets = async () => {
    const stored = loadStoredCredential()
    if (!stored) return
    const res = await FeedbackEndpoints.listMyTickets(stored.email, stored.code)
    if (res.success) setTickets(res.data ?? [])
  }

  const submitVerdict = async (ticketId: string, confirmed: boolean, reason?: string) => {
    setActingId(ticketId)
    try {
      const res = await FeedbackEndpoints.submitConfirmation(ticketId, confirmed, reason)
      if (res.success) {
        toast.success(confirmed ? "Thanks for confirming!" : "Thanks — we'll keep investigating")
        setReopeningId(null)
        setReopenReason("")
        await refreshTickets()
      } else {
        toast.error(res.message || "Something went wrong — please try again")
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again")
    } finally {
      setActingId(null)
    }
  }

  const startOver = () => {
    clearStoredCredential()
    setStep("email")
    setCode("")
    setTickets(null)
  }

  const requestCode = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      const res = await FeedbackEndpoints.requestMyTicketsCode(email.trim())
      if (res.success) {
        toast.success("If that email has any tickets, a code is on its way")
        setStep("code")
      } else {
        toast.error(res.message || "Something went wrong — please try again")
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again")
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    try {
      const trimmedEmail = email.trim()
      const trimmedCode = code.trim()
      const res = await FeedbackEndpoints.listMyTickets(trimmedEmail, trimmedCode)
      if (res.success) {
        setTickets(res.data ?? [])
        saveStoredCredential(trimmedEmail, trimmedCode)
        setStep("list")
      } else {
        toast.error(res.message || "Invalid or expired code")
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Invalid or expired code")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        {step === "loading" && (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading your tickets…
          </CardContent>
        )}

        {step === "email" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TicketCheck className="size-5 text-primary" />
                Check your tickets
              </CardTitle>
              <CardDescription>
                Enter the email you used when you submitted a ticket — we'll send a code to view
                its status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={requestCode}>
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-email">Email</Label>
                  <Input
                    id="mt-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={sending}>
                  <Mail className="mr-1.5 size-4" />
                  {sending ? "Sending…" : "Send me a code"}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {step === "code" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                Enter your code
              </CardTitle>
              <CardDescription>
                We've emailed a 6-digit code to <span className="font-medium">{email}</span>. It
                stays valid for a while, so you won't need a new one every time you check back.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={verifyCode}>
                <div className="grid gap-1.5">
                  <Label htmlFor="mt-code">Code</Label>
                  <Input
                    id="mt-code"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={verifying}
                    onClick={() => { setStep("email"); setCode("") }}
                  >
                    <ArrowLeft className="mr-1.5 size-4" />
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={verifying || code.length !== 6}>
                    {verifying ? "Checking…" : "View my tickets"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {step === "list" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TicketCheck className="size-5 text-primary" />
                Your tickets
              </CardTitle>
              <CardDescription>
                Every ticket raised with <span className="font-medium">{email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {tickets && tickets.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No tickets found for this email.
                </p>
              )}
              {tickets?.map((t) => (
                <div key={t.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticketCode}</span>
                    <span className="text-sm font-medium">{t.title}</span>
                    <Badge variant="outline" className="text-xs">{FEEDBACK_TYPE_LABELS[t.type]}</Badge>
                    <Badge variant={STATUS_VARIANT[t.status]} className="ml-auto text-xs">
                      {MY_TICKET_STATUS_LABELS[t.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.clientCompanyName ? `via ${t.clientCompanyName} · ` : ""}
                    {t.projectName} · {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                  {t.note && (
                    <div className="mt-2 rounded-md border-l-2 border-primary bg-muted/60 px-2.5 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Note from support</p>
                      <p className="whitespace-pre-line text-sm">{t.note}</p>
                    </div>
                  )}
                  {t.status === "pending_your_confirmation" && (
                    <div className="mt-2 grid gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2.5 py-2">
                      <p className="text-xs font-medium">
                        The team believes this is resolved — is that right?
                      </p>
                      {reopeningId === t.id ? (
                        <>
                          <Textarea
                            rows={2}
                            maxLength={2000}
                            placeholder="What's still not working? (optional)"
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === t.id}
                              onClick={() => { setReopeningId(null); setReopenReason("") }}
                            >
                              Back
                            </Button>
                            <Button
                              size="sm"
                              disabled={actingId === t.id}
                              onClick={() => submitVerdict(t.id, false, reopenReason.trim() || undefined)}
                            >
                              {actingId === t.id ? "Sending…" : "Send"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={actingId === t.id}
                            onClick={() => submitVerdict(t.id, true)}
                          >
                            <CheckCircle2 className="mr-1 size-3.5" />
                            {actingId === t.id ? "Confirming…" : "Yes, it's resolved"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === t.id}
                            onClick={() => setReopeningId(t.id)}
                          >
                            <XCircle className="mr-1 size-3.5" />
                            No, not fixed
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => setThreadTicket(t)}
                    >
                      <MessageSquare className="size-3" />
                      View conversation
                    </button>
                    {t.feedbackToken && (
                      <Link
                        to={`/feedback/${t.feedbackToken}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <PlusCircle className="size-3" />
                        Raise another ticket for {t.projectName}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={startOver}>
                <ArrowLeft className="mr-1.5 size-4" />
                Check a different email
              </Button>
            </CardContent>
          </>
        )}
      </Card>

      <TicketThreadDialog
        ticket={threadTicket}
        // Always read fresh from sessionStorage rather than the `email`/`code`
        // input state above — those only ever hold a value on the manual
        // entry path; a returning visitor lands straight on the "list" step
        // via the cached credential and never populates them.
        email={loadStoredCredential()?.email ?? ""}
        code={loadStoredCredential()?.code ?? ""}
        onOpenChange={(open) => !open && setThreadTicket(null)}
      />
    </div>
  )
}
