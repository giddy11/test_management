// Public, unauthenticated ticket-status lookup — no account needed. A
// submitter enters the email they used, gets a one-time code, and trades it
// for every ticket they've ever raised (across every project/company).
import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, KeyRound, Mail, PlusCircle, TicketCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import { FEEDBACK_TYPE_LABELS, MY_TICKET_STATUS_LABELS, type MyTicket } from "@/types/feedback.types"

const STATUS_VARIANT: Record<MyTicket["status"], "default" | "secondary" | "outline" | "destructive"> = {
  received: "destructive",
  in_progress: "secondary",
  pending_your_confirmation: "default",
  resolved: "outline",
}

type Step = "email" | "code" | "list"

export default function MyTicketsPage() {
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)

  const startOver = () => {
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
      const res = await FeedbackEndpoints.listMyTickets(email.trim(), code.trim())
      if (res.success) {
        setTickets(res.data ?? [])
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
        {step === "email" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TicketCheck className="size-5 text-primary" />
                Check your tickets
              </CardTitle>
              <CardDescription>
                Enter the email you used when you submitted a ticket — we'll send a one-time code
                to view its status.
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
                We've emailed a 6-digit code to <span className="font-medium">{email}</span> — it
                expires shortly, so use it soon.
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
                    <span className="font-mono text-xs text-muted-foreground">#{t.ticketNumber}</span>
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
                  {t.feedbackToken && (
                    <Link
                      to={`/feedback/${t.feedbackToken}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <PlusCircle className="size-3" />
                      Raise another ticket for {t.projectName}
                    </Link>
                  )}
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
    </div>
  )
}
