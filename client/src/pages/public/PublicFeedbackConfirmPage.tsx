// Public, unauthenticated confirmation page — reached via the link in the
// "awaiting confirmation" status email. Lets the submitter say whether the
// team's fix actually resolved their feedback, without replying to an email.
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CheckCircle2, HelpCircle, RotateCcw, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"

export default function PublicFeedbackConfirmPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState<"confirm" | "reopen" | null>(null)
  const [result, setResult] = useState<"confirmed" | "reopened" | null>(null)
  // "No, not fixed" doesn't submit immediately — it opens an optional reason
  // step first, so the team gets context on what still isn't working.
  const [askingReason, setAskingReason] = useState(false)
  const [reason, setReason] = useState("")

  const { data: context, isLoading, isError } = useQuery({
    queryKey: ["public-feedback-confirmation", id],
    queryFn: async () => {
      const res = await FeedbackEndpoints.confirmationContext(id)
      if (!res.success || !res.data) throw new Error(res.message)
      return res.data
    },
    enabled: Boolean(id),
    retry: false,
  })

  const submit = async (confirmed: boolean, reasonText?: string) => {
    setSubmitting(confirmed ? "confirm" : "reopen")
    try {
      const res = await FeedbackEndpoints.submitConfirmation(id, confirmed, reasonText)
      if (res.success) setResult(confirmed ? "confirmed" : "reopened")
      else toast.error(res.message || "Something went wrong — please try again")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again")
    } finally {
      setSubmitting(null)
    }
  }

  const alreadyHandled = context && context.status !== "awaiting_confirmation" && !result

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        {isLoading ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        ) : isError || !context ? (
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium">This confirmation link is no longer valid.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have expired or already been used — contact the team if you need help.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1.5 size-4" />
              Back
            </Button>
          </CardContent>
        ) : result || alreadyHandled ? (
          <CardContent className="py-16 text-center">
            {result === "reopened" ? (
              <RotateCcw className="mx-auto size-10 text-amber-500" />
            ) : (
              <CheckCircle2 className="mx-auto size-10 text-green-600" />
            )}
            <p className="mt-3 text-base font-semibold">
              {result === "reopened"
                ? "Thanks — we'll keep investigating"
                : result === "confirmed"
                ? "Thanks for confirming!"
                : "This has already been handled"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result === "reopened"
                ? `We've reopened "${context.title}" and the team will take another look.`
                : result === "confirmed"
                ? `"${context.title}" has been closed. Thanks for helping us improve!`
                : `"${context.title}" is no longer awaiting confirmation.`}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() =>
                context.feedbackToken
                  ? navigate(`/feedback/${context.feedbackToken}`)
                  : navigate(-1)
              }
            >
              <ArrowLeft className="mr-1.5 size-4" />
              Back to feedback form
            </Button>
          </CardContent>
        ) : askingReason ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="size-5 text-amber-500" />
                What's still not working?
              </CardTitle>
              <CardDescription>
                Optional — anything you add helps the team pick this back up.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="reopen-reason">Reason (optional)</Label>
                <Textarea
                  id="reopen-reason"
                  rows={4}
                  maxLength={2000}
                  placeholder="What did you expect, or what's still happening?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={Boolean(submitting)}
                  onClick={() => setAskingReason(false)}
                >
                  <ArrowLeft className="mr-1.5 size-4" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={Boolean(submitting)}
                  onClick={() => submit(false, reason || undefined)}
                >
                  {submitting === "reopen" ? "Sending…" : "Send"}
                </Button>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="size-5 text-primary" />
                {context.projectName} — is this resolved?
              </CardTitle>
              <CardDescription>
                The team believes your feedback <strong>{context.title}</strong> has been
                resolved. Let them know if that's right.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={Boolean(submitting)} onClick={() => submit(true)}>
                <CheckCircle2 className="mr-1.5 size-4" />
                {submitting === "confirm" ? "Confirming…" : "Yes, it's resolved"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={Boolean(submitting)}
                onClick={() => setAskingReason(true)}
              >
                <XCircle className="mr-1.5 size-4" />
                No, not fixed
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
